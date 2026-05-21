const https = require("https");
const db = require("../config/db");

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "NESTCASE";
const RECEIVED_EMAIL = process.env.RECEIVED_EMAIL || "";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendBrevoEmail({ toEmail, toName, subject, html }) {
  return new Promise((resolve) => {
    if (!BREVO_API_KEY) {
      console.warn("Brevo API key missing.");
      return resolve(false);
    }
    const payload = JSON.stringify({
      sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
      to: [{ email: toEmail, name: toName || toEmail }],
      subject,
      htmlContent: html,
    });
    const req = https.request(
      {
        method: "POST",
        hostname: "api.brevo.com",
        port: 443,
        path: "/v3/smtp/email",
        headers: {
          "api-key": BREVO_API_KEY,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(true);
          } else {
            console.error("Brevo send failed:", res.statusCode, body);
            resolve(false);
          }
        });
      }
    );
    req.on("error", (err) => {
      console.error("Brevo send error:", err);
      resolve(false);
    });
    req.write(payload);
    req.end();
  });
}

function emailTemplate(title, rows) {
  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="font-weight:700; padding-right:16px; vertical-align:top; white-space:nowrap;">${label}</td><td>${escapeHtml(value || "—")}</td></tr>`
    )
    .join("\n");

  return `
    <div style="margin:0; padding:0; background:#f5efe8;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5efe8; padding:32px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #eadfce;">
              <tr>
                <td style="background:#22311d; color:#ffffff; padding:24px 28px; font-family:Arial, sans-serif; font-size:22px; font-weight:700; letter-spacing:1px;">
                  NESTCASE
                </td>
              </tr>
              <tr>
                <td style="padding:28px; font-family:Arial, sans-serif; color:#1b1b1b;">
                  <h2 style="margin:0 0 18px; font-size:24px; color:#22311d;">${title}</h2>
                  <table cellpadding="6" cellspacing="0" style="font-size:15px; color:#343434; line-height:1.7;">
                    ${rowsHtml}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

// POST /contact  (handles both general contact and B2B enquiries via `type` field)
async function submitContact(req, res) {
  const { name, business, email, phone, message, type } = req.body || {};
  const isB2B = type === "b2b";

  if (!name || !email || !phone || !message) {
    return res.status(400).json({ success: false, message: "Name, email, phone and message are required." });
  }
  if (!RECEIVED_EMAIL) {
    return res.status(500).json({ success: false, message: "Recipient email not configured." });
  }

  // Save to database
  try {
    await db.execute(
      `INSERT INTO tbl_enquiries (type, name, business_name, email, phone, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [isB2B ? "b2b" : "contact-us", name, business || null, email, phone || null, message]
    );
  } catch (dbErr) {
    console.error("Failed to save enquiry to DB:", dbErr);
    // Non-fatal — still attempt to send email
  }

  const title   = isB2B ? "New B2B Connect Enquiry" : "New Contact Us Enquiry";
  const subject = isB2B
    ? `B2B Enquiry: ${name}${business ? ` — ${business}` : ""}`
    : `Contact Us: ${name}${business ? ` — ${business}` : ""}`;

  const html = emailTemplate(title, [
    ["Name", name],
    ["Business Name", business],
    ["Email", email],
    ["Phone", phone],
    ["Message", message],
  ]);

  const sent = await sendBrevoEmail({
    toEmail: RECEIVED_EMAIL,
    toName: "Store Admin",
    subject,
    html,
  });

  if (!sent) {
    return res.status(500).json({ success: false, message: "Failed to send email. Please try again." });
  }
  return res.json({ success: true, message: "Message sent successfully." });
}

module.exports = { submitContact };
