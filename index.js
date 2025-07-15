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

    // Wait for the form input field
    try {
      await page.waitForSelector('#wizard_view_driving_licence_enter_details_driving_licence_number', { timeout: 10000 });
    } catch (e) {
      await page.screenshot({ path: 'form_load_error.png' });
      throw new Error("Licence number input field not found. Screenshot saved as form_load_error.png");
    }

    // Accept cookies (if visible)
    try {
      await page.click('button[name="cookies-accept"]', { timeout: 3000 });
    } catch (e) {}

    // Fill the form
    await page.fill('#wizard_view_driving_licence_enter_details_driving_licence_number', licence_number);
    await page.fill('#wizard_view_driving_licence_enter_details_national_insurance_number', nin);
    await page.fill('#wizard_view_driving_licence_enter_details_post_code', postcode);

    // Check the data sharing box
    await page.check('#wizard_view_driving_licence_enter_details_data_sharing_confirmation');

    // Submit the form and wait for navigation
    await Promise.all([
      page.waitForNavigation(),
      page.click('#view-now')
    ]);

    // Get the page heading
    const heading = await page.textContent('h1');

    // If still on "Enter details", something went wrong
    if (heading.trim() === 'Enter details') {
      const errorSummary = await page.$('.govuk-error-summary');
      const errorText = errorSummary
        ? await errorSummary.textContent()
        : 'Unknown error occurred after form submission';

      await page.screenshot({ path: 'error_after_submit.png' });

      return res.status(400).json({
        error: 'Verification failed',
        details: errorText.trim()
      });
    }

    // Success
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