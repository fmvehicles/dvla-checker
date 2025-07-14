const express = require('express');
const puppeteer = require('puppeteer-core');
const { executablePath } = require('puppeteer');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Health check
app.get('/', (req, res) => {
  res.send('DVLA Verifier API is running.');
});

// Verification endpoint
app.post('/verify', async (req, res) => {
  const { licenceNumber, postcode, nationalInsurance } = req.body;

  if (!licenceNumber || !postcode || !nationalInsurance) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // Step 1: Go to DVLA view driving record page
    await page.goto('https://www.viewdrivingrecord.service.gov.uk/driving-record/licence-number', {
      waitUntil: 'domcontentloaded',
    });

    // Step 2: Fill form
    await page.type('#driving-licence-number', licenceNumber, { delay: 100 });
    await page.type('#postcode', postcode, { delay: 100 });
    await page.type('#nin', nationalInsurance, { delay: 100 });

    // Step 3: Submit the form
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);

    // Step 4: Check if login succeeded
    const pageTitle = await page.title();
    const success = pageTitle.includes('Driving record') || page.url().includes('/driving-record/');

    if (!success) {
      await browser.close();
      return res.status(401).json({ error: 'Verification failed. Check your details.' });
    }

    // Step 5: Extract details (example - you can customize this)
    const name = await page.$eval('.govuk-heading-l', el => el.textContent.trim());
    const licenceValidTo = await page.$eval('.column-two-thirds .column-two-thirds .govuk-summary-list .govuk-summary-list__value', el => el.textContent.trim());

    await browser.close();

    return res.json({
      success: true,
      name,
      licenceValidTo,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Automation failed', details: err.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DVLA Verifier running on port ${PORT}`);
});