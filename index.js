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
    browser = await chromium.launch({ headless: true });

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
      // Ignore if cookie banner not found
    }

    // Wait for and fill the form
    await page.waitForSelector('#wizard_view_driving_licence_enter_details_driving_licence_number', { timeout: 15000 });

    await page.fill('#wizard_view_driving_licence_enter_details_driving_licence_number', licence_number.toUpperCase());
    await page.fill('#wizard_view_driving_licence_enter_details_national_insurance_number', nin.toUpperCase());
    await page.fill('#wizard_view_driving_licence_enter_details_post_code', postcode.toUpperCase());

    await page.check('#wizard_view_driving_licence_enter_details_data_sharing_confirmation');

    // Submit the form
    await Promise.all([
      page.waitForNavigation({ timeout: 15000 }),
      page.click('#view-now'),
    ]);

    // Check if error exists
    const errorMessage = await page.locator('.govuk-error-summary__body').first().textContent().catch(() => null);
    if (errorMessage) {
      return res.status(400).json({
        error: 'Verification failed',
        details: errorMessage.trim(),
      });
    }

    // Example check – can be adjusted based on success page structure
    const headerText = await page.textContent('h1');
    res.json({
      success: true,
      message: headerText ? headerText.trim() : 'Verified successfully',
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