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

    await page.goto('https://www.viewdrivingrecord.service.gov.uk/driving-record/licence-number', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    try {
      await page.waitForSelector('#wizard_view_driving_licence_enter_details_driving_licence_number', { timeout: 10000 });
    } catch (e) {
      await page.screenshot({ path: 'form_load_error.png' });
      throw new Error("Licence number input field not found. Screenshot saved as form_load_error.png");
    }

    try {
      await page.click('button[name="cookies-accept"]', { timeout: 3000 });
    } catch (e) {}

    await page.fill('#wizard_view_driving_licence_enter_details_driving_licence_number', licence_number);
    await page.fill('#wizard_view_driving_licence_enter_details_national_insurance_number', nin);
    await page.fill('#wizard_view_driving_licence_enter_details_post_code', postcode);

    await page.check('#wizard_view_driving_licence_enter_details_data_sharing_confirmation');

    await Promise.all([
      page.waitForNavigation(),
      page.click('#view-now')
    ]);

    const heading = await page.textContent('h1');

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

    // Extract "Your details"
    const yourDetails = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#your-details dl.govuk-summary-list > div.govuk-summary-list__row')];
      const details = {};
      rows.forEach(row => {
        const key = row.querySelector('.govuk-summary-list__key')?.textContent.trim();
        const value = row.querySelector('.govuk-summary-list__value')?.textContent.trim();
        if (key && value) {
          details[key.replace(':', '')] = value;
        }
      });
      return details;
    });

    // Extract "Driving licence details" (same method, different section)
    const licenceDetails = await page.evaluate(() => {
      const section = [...document.querySelectorAll('#your-details dl.govuk-summary-list')];
      // Second summary list contains licence details
      const rows = section[1] ? [...section[1].querySelectorAll('div.govuk-summary-list__row')] : [];
      const details = {};
      rows.forEach(row => {
        const key = row.querySelector('.govuk-summary-list__key')?.textContent.trim();
        const value = row.querySelector('.govuk-summary-list__value')?.textContent.trim();
        if (key && value) {
          details[key.replace(':', '')] = value;
        }
      });
      return details;
    });

    // Extract "Entitlements" categories and descriptions
    const entitlements = await page.evaluate(() => {
      const categories = [];
      const sections = document.querySelectorAll('#Entitlements .govuk-accordion__section');
      sections.forEach(section => {
        const categoryName = section.querySelector('h3.govuk-accordion__section-heading button')?.textContent.trim();
        const validity = {};
        const validFromElem = section.querySelector('p.govuk-body.entitlement-dates strong:nth-child(1)');
        const validToElem = section.querySelector('p.govuk-body.entitlement-dates strong:nth-child(2)');
        const validFrom = validFromElem ? validFromElem.textContent.trim() : null;
        const validTo = validToElem ? validToElem.textContent.trim() : null;
        const description = section.querySelector('p.govuk-body[name^="legal-literal"]')?.textContent.trim();

        categories.push({
          category: categoryName,
          validFrom,
          validTo,
          description
        });
      });
      return categories;
    });

    // Extract penalties (text only)
    const penaltiesText = await page.textContent('#Endorsements .govuk-grid-column-full p.govuk-heading-s');

    res.json({
      success: true,
      heading: heading.trim(),
      yourDetails,
      licenceDetails,
      entitlements,
      penalties: penaltiesText.trim()
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
