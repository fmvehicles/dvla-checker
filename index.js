const express = require('express');
const { chromium } = require('playwright');

const app = express();
app.use(express.json());

app.post('/verify', async (req, res) => {
  const { licence_number, last_name, postcode } = req.body;

  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('https://www.viewdrivingrecord.service.gov.uk/driving-record/licence-number');

    await page.fill('#driving-licence-number', licence_number);
    await page.fill('#last-name', last_name);
    await page.fill('#postcode', postcode);
    await page.click('button[type=submit]');

    await page.waitForTimeout(3000); // Wait for page response

    // You can scrape details here...

    await browser.close();

    res.json({ success: true, message: 'Verification complete.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Verification failed', details: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`DVLA Verifier running on port ${PORT}`);
});