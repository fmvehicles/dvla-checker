const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

app.post("/verify", (req, res) => {
  // Only here destructure req.body
  const { licence_number, postcode, national_insurance, share_code } = req.body;

  // Your verification logic here
  res.json({
    success: true,
    message: "DVLA verification simulated",
    data: { licence_number, postcode, national_insurance, share_code }
  });
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});