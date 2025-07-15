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

    // Go to DVLA driving licence number check page
    await page.goto('https://www.viewdrivingrecord.service.gov.uk/driving-record/licence-number', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Accept cookies if visible
    try {
      await page.click('button[name="cookies-accept"]', { timeout: 3000 });
    } catch {}

    // Fill the form fields
    await page.fill('#wizard_view_driving_licence_enter_details_driving_licence_number', licence_number);
    await page.fill('#wizard_view_driving_licence_enter_details_national_insurance_number', nin);
    await page.fill('#wizard_view_driving_licence_enter_details_post_code', postcode);

    // Check data sharing confirmation
    await page.check('#wizard_view_driving_licence_enter_details_data_sharing_confirmation');

    // Submit the form and wait for navigation
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click('#view-now')
    ]);

    // Check page heading to confirm success
    const heading = (await page.textContent('h1'))?.trim() || '';

    if (heading === 'Enter details') {
      // Error: Still on form page after submit
      const errorSummary = await page.$('.govuk-error-summary');
      const errorText = errorSummary
        ? (await errorSummary.textContent()).trim()
        : 'Unknown error after form submission';
      await page.screenshot({ path: 'error_after_submit.png' });
      return res.status(400).json({ error: 'Verification failed', details: errorText });
    }

    // Now extract the key info from the results page

    // Helper function to get text content safely
    async function getText(selector) {
      const el = await page.$(selector);
      if (!el) return null;
      const txt = await el.textContent();
      return txt ? txt.trim() : null;
    }

    // Extract your details
    const title = await getText('.govuk-summary-list__row:nth-child(1) .govuk-summary-list__value');
    const name = await getText('.govuk-summary-list__row:nth-child(2) .govuk-summary-list__value');
    const sex = await getText('.govuk-summary-list__row:nth-child(3) .govuk-summary-list__value');
    const dob = await getText('.govuk-summary-list__row:nth-child(4) .govuk-summary-list__value');
    const address = await getText('.govuk-summary-list__row:nth-child(5) .govuk-summary-list__value');

    // Extract driving licence details
    const licence_status = await getText('.govuk-summary-list:nth-of-type(2) .govuk-summary-list__row:nth-child(1) .govuk-summary-list__value');
    const valid_from = await getText('.govuk-summary-list:nth-of-type(2) .govuk-summary-list__row:nth-child(2) .govuk-summary-list__value');
    const valid_to = await getText('.govuk-summary-list:nth-of-type(2) .govuk-summary-list__row:nth-child(3) .govuk-summary-list__value');
    const licence_number_extracted = await getText('.govuk-summary-list:nth-of-type(2) .govuk-summary-list__row:nth-child(4) .govuk-summary-list__value');
    const licence_issue_number = await getText('.govuk-summary-list:nth-of-type(2) .govuk-summary-list__row:nth-child(5) .govuk-summary-list__value');

    // Extract entitlements
    // Entitlements are in accordion sections - gather each category with validity and description
    const entitlementSections = await page.$$('.govuk-accordion__section');

    const entitlements = [];
    for (const section of entitlementSections) {
      const category = await section.$eval('h3 button', btn => btn.innerText.split(',')[1]?.trim() || '');
      const validFrom = await section.$eval('.entitlements_value strong:nth-child(1)', el => el.innerText).catch(() => null);
      const validTo = await section.$eval('.entitlements_value strong:nth-child(2)', el => el.innerText).catch(() => null);
      const description = await section.$eval('p.govuk-body[name^="legal-literal"]', el => el.innerText).catch(() => null);
      entitlements.push({
        category,
        validFrom,
        validTo,
        description,
      });
    }

    // Extract penalties and disqualifications info
    const penaltiesText = await getText('#Endorsements p.govuk-heading-s') || 'No penalties or disqualifications';

    // Prepare response
    res.json({
      success: true,
      heading,
      personal_details: {
        title,
        name,
        sex,
        date_of_birth: dob,
        address,
      },
      driving_licence_details: {
        licence_status,
        valid_from,
        valid_to,
        licence_number: licence_number_extracted,
        licence_issue_number,
      },
      entitlements,
      penalties_and_disqualifications: penaltiesText,
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