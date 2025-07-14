const express = require('express');
const bodyParser = require('body-parser');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());

app.post('/verify', async (req, res) => {
  const { licence_number, nin, postcode } = req.body;

  if (!licence_number || !nin || !postcode) {
    return res.status(400).json({
      error: 'Missing required fields',
      details: 'licence_number, nin, and postcode are required',
    });
  }

  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    await page.goto(
      'https://www.viewdrivingrecord.service.gov.uk/driving-record/licence-number',
      { waitUntil: 'domcontentloaded' }
    );

    // Accept cookies if shown
    try {
      await page.click('button[name="cookies-accept"]', { timeout: 3000 });
    } catch (e) {
      // No cookie banner, continue
    }

    // Fill out the form
    await page.waitForSelector('#driving-licence-number', { timeout: 10000 });
    await page.fill('#driving-licence-number', licence_number);
    await page.fill('#national-insurance-number', nin);
    await page.fill('#postcode', postcode);
    await page.check('#terms-and-conditions');

    await Promise.all([
      page.waitForNavigation(),
      page.click('button[type="submit"]'),
    ]);

    // Check for error messages
    const errorExists = await page.$('.error-message');
    if (errorExists) {
      const errorText = await page.textContent('.error-message');
      return res.status(400).json({
        error: 'Verification failed',
        details: errorText,
      });
    }

    // Success response
    const successText = await page.textContent('h1');
    res.json({
      success: true,
      message: successText || 'Verified successfully',
    });
  } catch (error) {
    res.status(500).json({
      error: 'Verification failed',
      details: error.message,
    });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`DVLA Verifier running on port ${PORT}`);
});