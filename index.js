const express = require('express');
const bodyParser = require('body-parser');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());

app.post('/verify', async (req, res) => {
    const { licence_number, postcode } = req.body;

    if (!licence_number || !postcode) {
        return res.status(400).json({
            error: 'Missing fields',
            message: 'Both licence_number and postcode are required.'
        });
    }

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        // Go to DVLA page
        await page.goto('https://www.viewdrivingrecord.service.gov.uk/driving-record/licence-number', {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        // Wait and fill the driving licence number
        await page.waitForSelector('#driving-licence-number', { timeout: 30000 });
        await page.fill('#driving-licence-number', licence_number);

        // Click Continue
        await page.click('button[type=submit]');

        // Wait for postcode field to appear
        await page.waitForSelector('#postcode', { timeout: 30000 });
        await page.fill('#postcode', postcode);

        // Click Continue again
        await page.click('button[type=submit]');

        // Wait for summary or result (success or fail)
        await page.waitForTimeout(3000); // you can improve with more specific wait

        // Capture current URL and page content for parsing/validation
        const finalUrl = page.url();
        const content = await page.content();

        if (finalUrl.includes('/view-driving-licence')) {
            // User was verified and reached the summary page
            return res.status(200).json({
                status: 'verified',
                licence_number,
                postcode
                // You can also scrape name, expiry, points, etc. if needed
            });
        } else {
            return res.status(401).json({
                error: 'Verification failed',
                details: 'Could not access driving record. Check licence number and postcode.'
            });
        }
    } catch (error) {
        console.error('Verification error:', error);
        return res.status(500).json({
            error: 'Verification failed',
            details: error.message
        });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

app.get('/', (req, res) => {
    res.send('DVLA Verifier running on port ' + PORT);
});

app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
});