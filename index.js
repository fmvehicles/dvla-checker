const express = require(express);
const cors = require(cors);
const app = express();
const port = process.env.PORT  3000;

app.use(cors());
app.use(express.json());

app.post(verify, async (req, res) = {
    const { licence_number, postcode, national_insurance, share_code } = req.body;

    if (!licence_number  !postcode  !national_insurance  !share_code) {
        return res.status(400).json({ error Missing required fields });
    }

     Puppeteer logic will go here in next steps
    res.json({ message Stub for DVLA check received, data req.body });
});

app.listen(port, () = {
    console.log(`DVLA Verifier API running on port ${port}`);
});
