const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer-core');
const { executablePath } = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('DVLA Verifier API is running');
});

app.post('/verify', async (req, res) => {
  const { licenceNumber, lastName, postcode, dob } = req.body;

  if (!licenceNumber || !lastName || !postcode || !dob) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('https://www.viewdrivingrecord.service.gov.uk/driving-record/licence-number', {
      waitUntil: 'networkidle2'
    });

    // Fill the form fields
    await page.type('#driving-licence-number', licenceNumber);
    await page.type('#last-name', lastName);
    await page.type('#postcode', postcode);
    await page.type('#dob-day', dob.split('-')[2]);
    await page.type('#dob-month', dob.split('-')[1]);
    await page.type('#dob-year', dob.split('-')[0]);

    // Click 'View Now'
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]')
    ]);

    const pageURL = page.url();
    if (!pageURL.includes('/driving-licence')) {
      await browser.close();
      return res.status(401).json({ error: 'Verification failed', reason: 'Invalid credentials' });
    }

    // Example: extract name & licence status
    const data = await page.evaluate(() => {
      const name = document.querySelector('.column-two-thirds h1')?.innerText;
      const status = document.querySelector('.column-two-thirds .summary-item p')?.innerText;
      return { name, status };
    });

    await browser.close();
    res.status(200).json({ success: true, data });

  } catch (error) {
    console.error('Verification Error:', error);
    res.status(500).json({ error: 'Verification failed', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`DVLA Verifier running on port ${PORT}`);
});