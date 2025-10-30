const express = require('express');
const bodyParser = require('body-parser');
const { chromium } = require('playwright');
const fetch = require('node-fetch');
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

const upload = multer(); // for handling file uploads

// WordPress credentials (server-side, not exposed to client)
const WP_USER = 'khalilman88@gmail.com';
const WP_PASS = 'UV8p qmqd W0AQ 2xpz 2I2F 3n7f';
const WP_TOKEN = Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');

// Helper to upload image to WordPress media library
async function uploadToWPMedia(blobBuffer, filename) {
  const form = new FormData();
  form.append('file', blobBuffer, { filename });
  form.append('title', filename);
  form.append('alt_text', filename);

  const res = await fetch('https://driversnetwork.co.uk/wp-json/wp/v2/media', {
    method: 'POST',
    headers: { Authorization: `Basic ${WP_TOKEN}` },
    body: form
  });

  if (!res.ok) throw new Error(`WP media upload failed: ${res.status}`);
  const data = await res.json();
  return data.source_url; // return uploaded image URL
}

// DVLA verification endpoint
app.post('/verify', upload.fields([
  { name: 'selfie', maxCount: 1 },
  { name: 'licenceFront', maxCount: 1 },
  { name: 'licenceBack', maxCount: 1 }
]), async (req, res) => {
  const { licence_number, nin, postcode, email, admin_ref } = req.body;
  const files = req.files;

  if (!licence_number || !nin || !postcode) {
    return res.status(400).json({ error: 'licence_number, nin, and postcode are required' });
  }
  if (!files?.selfie || !files?.licenceFront || !files?.licenceBack) {
    return res.status(400).json({ error: 'All three images (selfie, licenceFront, licenceBack) are required' });
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto('https://www.viewdrivingrecord.service.gov.uk/driving-record/licence-number', { waitUntil: 'domcontentloaded' });

    // Accept cookies if present
    try { await page.click('button[name="cookies-accept"]', { timeout: 3000 }); } catch {}

    // Fill DVLA form
    await page.fill('#wizard_view_driving_licence_enter_details_driving_licence_number', licence_number);
    await page.fill('#wizard_view_driving_licence_enter_details_national_insurance_number', nin);
    await page.fill('#wizard_view_driving_licence_enter_details_post_code', postcode);
    await page.check('#wizard_view_driving_licence_enter_details_data_sharing_confirmation');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click('#view-now')
    ]);

    const heading = (await page.textContent('h1'))?.trim() || '';

    if (heading === 'Enter details') {
      const errorSummary = await page.$('.govuk-error-summary');
      const errorText = errorSummary ? (await errorSummary.textContent()).trim() : 'Unknown error';
      return res.status(400).json({ error: 'Verification failed', details: errorText });
    }

    const getText = async selector => {
      const el = await page.$(selector);
      return el ? (await el.textContent()).trim() : null;
    };

    // Personal details
    const title = await getText('.govuk-summary-list__row:nth-child(1) .govuk-summary-list__value');
    const name = await getText('.govuk-summary-list__row:nth-child(2) .govuk-summary-list__value');
    const sex = await getText('.govuk-summary-list__row:nth-child(3) .govuk-summary-list__value');
    const dob = await getText('.govuk-summary-list__row:nth-child(4) .govuk-summary-list__value');
    const address = await getText('.govuk-summary-list__row:nth-child(5) .govuk-summary-list__value');

    // Driving licence details
    const licence_status = await getText('.govuk-summary-list:nth-of-type(2) .govuk-summary-list__row:nth-child(1) .govuk-summary-list__value');
    const valid_from = await getText('.govuk-summary-list:nth-of-type(2) .govuk-summary-list__row:nth-child(2) .govuk-summary-list__value');
    const valid_to = await getText('.govuk-summary-list:nth-of-type(2) .govuk-summary-list__row:nth-child(3) .govuk-summary-list__value');
    const licence_number_extracted = await getText('.govuk-summary-list:nth-of-type(2) .govuk-summary-list__row:nth-child(4) .govuk-summary-list__value');
    const licence_issue_number = await getText('.govuk-summary-list:nth-of-type(2) .govuk-summary-list__row:nth-child(5) .govuk-summary-list__value');

    // Penalties
    let penaltiesText = 'No penalties or disqualifications';
    const penaltiesEl = await page.$('#Endorsements');
    if (penaltiesEl) penaltiesText = (await penaltiesEl.textContent()).trim();

    // Upload images to WordPress
    const selfieUrl = await uploadToWPMedia(files.selfie[0].buffer, 'selfie.jpg');
    const licenceFrontUrl = await uploadToWPMedia(files.licenceFront[0].buffer, 'front.jpg');
    const licenceBackUrl = await uploadToWPMedia(files.licenceBack[0].buffer, 'back.jpg');

    // Create WP post with ACF fields
    const postBody = {
      title: `Verification - ${name} - ${licence_number_extracted}`,
      status: 'publish',
      acf: {
        full_name: name,
        email: email || '',
        admin_ref: admin_ref || '',
        dob,
        licence_number: licence_number_extracted,
        issue_date: valid_from,
        expiry_date: valid_to,
        address,
        licence_type: licence_status,
        nin,
        dvla_valid: true,
        penalty_info: penaltiesText,
        selfie_image: selfieUrl,
        licence_front_image: licenceFrontUrl,
        licence_back_image: licenceBackUrl
      }
    };

    const wpPostRes = await fetch('https://driversnetwork.co.uk/wp-json/wp/v2/verification', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${WP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(postBody)
    });

    if (!wpPostRes.ok) throw new Error(`WP post creation failed: ${wpPostRes.status}`);
    const wpPostData = await wpPostRes.json();

    res.json({
      success: true,
      personal_details: { title, name, sex, dob, address },
      driving_licence_details: { licence_status, valid_from, valid_to, licence_number: licence_number_extracted, licence_issue_number },
      penalties: penaltiesText,
      wordpress_post: wpPostData
    });

  } catch (err) {
    res.status(500).json({ error: 'Verification failed', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`DVLA Verifier + WP uploader running on port ${PORT}`));
