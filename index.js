const express = require('express');
const { chromium } = require('playwright');

const app = express();
app.use(express.json());

app.post('/verify', async (req, res) => {
  const { licence_number, nin, postcode } = req.body;

  if (!licence_number || !nin || !postcode) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://www.viewdrivingrecord.service.gov.uk/driving-record/licence-number');

    await page.fill('#driving-licence-number', licence_number);
    await page.fill('#national-insurance-number', nin);
    await page.fill('#postcode', postcode);
    await page.check('#terms-and-conditions');
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ timeout: 10000 });

    // Example: Check for success by checking if a known dashboard element exists
    const success = await page.$('h1, .govuk-panel__title');

    if (success) {
      res.json({ success: true, message: 'DVLA Record Verified ✅' });
    } else {
      res.status(403).json({ error: 'Verification failed' });
    }

  } catch (err) {
    res.status(500).json({ error: 'Verification failed', details: err.message });
  } finally {
    await browser.close();
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`DVLA Verifier running on port ${PORT}`);
});