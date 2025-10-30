require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const multer = require("multer");
const FormData = require("form-data");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer();

const DVLA_API = "https://dvla-verifier.onrender.com/verify";
const WP_MEDIA_URL = "https://driversnetwork.co.uk/wp-json/wp/v2/media";
const WP_POST_URL = "https://driversnetwork.co.uk/wp-json/wp/v2/verification";

// 🔐 Secure credentials in .env file (do not hardcode)
const WP_USERNAME = process.env.WP_USERNAME;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

// ✅ Encode credentials for Basic Auth
const AUTH_HEADER = "Basic " + Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString("base64");

// Utility: upload image to WP Media Library
async function uploadToWPMedia(fileBuffer, filename, mimeType) {
  const formData = new FormData();
  formData.append("file", fileBuffer, { filename, contentType: mimeType });
  formData.append("title", filename);

  const res = await fetch(WP_MEDIA_URL, {
    method: "POST",
    headers: { Authorization: AUTH_HEADER },
    body: formData,
  });

  if (!res.ok) throw new Error(`Upload to WP Media failed: ${res.status}`);
  const media = await res.json();
  return media.source_url;
}

// Utility: save ACF post to WordPress
async function saveToWordPress(fullData) {
  const res = await fetch(WP_POST_URL, {
    method: "POST",
    headers: {
      Authorization: AUTH_HEADER,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: `Verification - ${fullData.extracted_licence_info.name} - ${fullData.extracted_licence_info.licenceNumber}`,
      status: "publish",
      acf: {
        full_name: fullData.extracted_licence_info.name,
        dob: fullData.extracted_licence_info.dob,
        licence_number: fullData.extracted_licence_info.licenceNumber,
        issue_date: fullData.extracted_licence_info.issuedDate,
        expiry_date: fullData.extracted_licence_info.expiryDate,
        address: fullData.extracted_licence_info.address,
        licence_type: fullData.extracted_licence_info.licenceType,
        nin: fullData.nin,
        dvla_valid: fullData.dvla?.success || false,
        penalty_info: fullData.dvla?.penalties_and_disqualifications || "",
        selfie_image: fullData.selfieUrl,
        licence_front_image: fullData.licenceFrontUrl,
        licence_back_image: fullData.licenceBackUrl,
      },
    }),
  });

  if (!res.ok) throw new Error(`WP Save failed: ${res.status}`);
  return await res.json();
}

// 🎯 Route: Verify with DVLA then upload to WordPress
app.post("/verify-and-upload", upload.fields([
  { name: "selfie" },
  { name: "licenceFront" },
  { name: "licenceBack" },
]), async (req, res) => {
  try {
    const { licenceNumber, nin, postcode, extracted_licence_info } = req.body;

    // Step 1: Verify via DVLA
    const verifyRes = await fetch(DVLA_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenceNumber, nin, postcode }),
    });
    const dvlaData = await verifyRes.json();

    if (!dvlaData.success) {
      return res.status(400).json({ message: "DVLA verification failed", dvlaData });
    }

    // Step 2: Upload images to WordPress
    const selfieUrl = await uploadToWPMedia(req.files["selfie"][0].buffer, "selfie.jpg", "image/jpeg");
    const licenceFrontUrl = await uploadToWPMedia(req.files["licenceFront"][0].buffer, "front.jpg", "image/jpeg");
    const licenceBackUrl = await uploadToWPMedia(req.files["licenceBack"][0].buffer, "back.jpg", "image/jpeg");

    // Step 3: Save post with ACF fields
    const wpSave = await saveToWordPress({
      extracted_licence_info: JSON.parse(extracted_licence_info),
      nin,
      dvla: dvlaData,
      selfieUrl,
      licenceFrontUrl,
      licenceBackUrl,
    });

    res.json({ success: true, message: "Uploaded & saved successfully", wpSave });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
