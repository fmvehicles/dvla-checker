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
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.133 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    // Go to DVLA page
    await page.goto('https://www.viewdrivingrecord.service.gov.uk/driving-record/licence-number', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for the form OR take screenshot if fails
    try {
      await page.waitForSelector('#wizard_view_driving_licence_enter_details_driving_licence_number', { timeout: 10000 });
    } catch (e) {
      await page.screenshot({ path: 'form_load_error.png' });
      throw new Error("Licence number input field not found. Screenshot saved as form_load_error.png");
    }

    // Accept cookies
    try {
      await page.click('button[name="cookies-accept"]', { timeout: 3000 });
    } catch (e) {}

    // Fill out form
    await page.fill('#wizard_view_driving_licence_enter_details_driving_licence_number', licence_number);
    await page.fill('#wizard_view_driving_licence_enter_details_national_insurance_number', nin);
    await page.fill('#wizard_view_driving_licence_enter_details_post_code', postcode);

    // Check the "data sharing confirmation" box
    await page.check('#wizard_view_driving_licence_enter_details_data_sharing_confirmation');

    // Submit the form
    await Promise.all([
      page.waitForNavigation(),
      page.click('#view-now')
    ]);

    // Check for errors
    const errorMessage = await page.$('.error-message');
    if (errorMessage) {
      const text = await errorMessage.textContent();
      return res.status(400).json({
        error: 'Verification failed',
        details: text.trim()
      });
    }

    // Get heading as success
    const heading = await page.textContent('h1');
    res.json({
      success: true,
      message: heading.trim() || 'Verified successfully'
    });

  } catch (error) {
    res.status(500).json({
      error: 'Verification failed',
      details: error.message
    });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`DVLA Verifier running on port ${PORT}`);
});