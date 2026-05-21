const db = require("../config/db");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { getSessionUser } = require("./session");
const { getCartIdentity } = require("./cartController");
const {
  validateAndLockCoupon,
  recordCouponUsage,
} = require("./couponController");

const toStr = (val) => {
  if (val === undefined || val === null) return "";
  return String(val).trim();
};

const toAmount = (val) => {
  const n = Number.parseFloat(val);
  return Number.isFinite(n) ? n : 0;
};

const toInt = (val, fallback = 0) => {
  const n = Number.parseInt(val, 10);
  return Number.isFinite(n) ? n : fallback;
};

const BREVO_API_KEY =
  process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || "";
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "NESTCASE";
const BREVO_LOGO_URL = process.env.BREVO_LOGO_URL || "";
const DEFAULT_LOGO_PATH = path.join(
  __dirname,
  "..",
  "..",
  "frontend",
  "public",
  "images",
  "logo-white.png",
);
const DEFAULT_COUNTRY = process.env.DEFAULT_COUNTRY || "India";

const axios = require("axios");
const SHIPROCKET_EMAIL = process.env.SHIPROCKET_EMAIL;
const SHIPROCKET_PASSWORD = process.env.SHIPROCKET_PASSWORD;

// ================================
// GET SHIPROCKET TOKEN
// ================================

async function getShiprocketToken() {
  try {
    const response = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/auth/login",
      {
        email: SHIPROCKET_EMAIL,
        password: SHIPROCKET_PASSWORD,
      },
    );

    return response.data.token;
  } catch (error) {
    console.log(
      "Shiprocket Auth Error:",
      error.response?.data || error.message,
    );

    throw new Error("Unable to authenticate Shiprocket");
  }
}

// ================================
// CREATE SHIPROCKET ORDER
// ================================

async function createShiprocketOrder(orderData) {
  try {
    const token = await getShiprocketToken();

    const response = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
      orderData,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );

    return response.data;
  } catch (error) {
    console.log(
      "Shiprocket Order Error:",
      error.response?.data || error.message,
    );

    throw new Error("Failed to create Shiprocket order");
  }
}

// ================================
// ASSIGN COURIER + GENERATE AWB
// ================================

async function generateAWB(shipment_id) {
  try {
    const token = await getShiprocketToken();

    const response = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
      {
        shipment_id,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );

    return response.data;
  } catch (error) {
    console.log("Shiprocket AWB Error:", error.response?.data || error.message);

    throw new Error("Failed to generate AWB");
  }
}


async function getShippingRate(req, res) {
  try {
    const token = await getShiprocketToken();

    const {
      pincode,
      cod = 0,
      weight,
      length,
      breadth,
      height,
      declared_value = 599
    } = req.body;

    const response = await axios.get(
      "https://apiv2.shiprocket.in/v1/external/courier/serviceability",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          pickup_postcode: "411017",
          delivery_postcode: pincode,
          cod: cod ? 1 : 0,
          weight,
          length: length || 10,
          breadth: breadth || 10,
          height: height || 10,
          declared_value
        }
      }
    );

    const couriers =
      response.data?.data?.available_courier_companies || [];

    if (!couriers.length) {
      return res.json({
        success:false,
        message:"No courier available"
      });
    }

    // Prefer Shiprocket recommended courier
let selected =
    couriers.find(
        c => c.recommended_by_shiprocket === true
    );

if (!selected) {
    couriers.sort((a,b)=>
        Number(
            a.courier_charge ||
            a.rate ||
            a.freight_charge
        )
        -
        Number(
            b.courier_charge ||
            b.rate ||
            b.freight_charge
        )
    );

    selected = couriers[0];
}

const finalRate =
    Number(
        selected.courier_charge ||
        selected.rate ||
        selected.freight_charge ||
        0
    );

return res.json({
    success:true,
    rate: finalRate,
    courier_name:selected.courier_name,
    etd:selected.etd,

    all_rates:couriers.map(c=>({
        courier:c.courier_name,
        rate:Number(
            c.courier_charge ||
            c.rate ||
            c.freight_charge ||
            0
        ),
        etd:c.etd
    }))
});

  } catch(error){

    console.log(
      error.response?.data || error.message
    );

    return res.status(500).json({
      success:false,
      message:"Unable to get shipping rate"
    });
  }
}


let cachedLogoDataUri = "";

function formatMoney(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getLogoDataUri() {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  const logoPath =
    process.env.BREVO_LOGO_PATH || process.env.LOGO_PATH || DEFAULT_LOGO_PATH;
  try {
    if (!fs.existsSync(logoPath)) return "";
    const buffer = fs.readFileSync(logoPath);
    cachedLogoDataUri = `data:image/png;base64,${buffer.toString("base64")}`;
    return cachedLogoDataUri;
  } catch (err) {
    console.error("Failed to load logo for email:", err);
    return "";
  }
}

async function sendBrevoEmail({ toEmail, toName, subject, html }) {
  if (!BREVO_API_KEY) {
    console.warn("Brevo API key missing. Set BREVO_API_KEY in environment.");
    return false;
  }

  const payload = JSON.stringify({
    sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
    to: [{ email: toEmail, name: toName || toEmail }],
    subject,
    htmlContent: html,
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        method: "POST",
        hostname: "api.brevo.com",
        path: "/v3/smtp/email",
        headers: {
          "api-key": BREVO_API_KEY,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(true);
          } else {
            console.error("Brevo send failed:", res.statusCode, body);
            resolve(false);
          }
        });
      },
    );

    req.on("error", (err) => {
      console.error("Brevo send error:", err);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

function buildOrderName() {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `order-${stamp}`;
}

function sanitizeBilling(billing) {
  const b = billing || {};
  return {
    first_name: toStr(b.first_name),
    last_name: toStr(b.last_name),
    email: toStr(b.email),
    phone: toStr(b.phone),
    address: toStr(b.address),
    address_2: toStr(b.address_2),
    city: toStr(b.city),
    state: toStr(b.state),
    postcode: toStr(b.postcode),
    country: DEFAULT_COUNTRY,
    company: toStr(b.company),
  };
}

function sanitizeShipping(shipping, billing) {
  const s = shipping || {};
  const b = billing || {};
  return {
    first_name: toStr(s.first_name || b.first_name),
    last_name: toStr(s.last_name || b.last_name),
    phone: toStr(s.phone || b.phone),
    address: toStr(s.address || b.address),
    address_2: toStr(s.address_2 || b.address_2),
    city: toStr(s.city || b.city),
    state: toStr(s.state || b.state),
    postcode: toStr(s.postcode || b.postcode),
    country: DEFAULT_COUNTRY,
  };
}

function validateBilling(billing) {
  const errors = {};
  if (!billing.first_name) errors.first_name = "First name required";
  if (!billing.last_name) errors.last_name = "Last name required";
  if (!billing.email) errors.email = "Email required";
  if (!billing.phone) errors.phone = "Phone required";
  if (!billing.address) errors.address = "Address required";
  if (!billing.city) errors.city = "City required";
  if (!billing.state) errors.state = "State required";
  if (!billing.postcode) errors.postcode = "Postcode required";
  return errors;
}

const PROFILE_META_KEYS = [
  "first_name",
  "last_name",
  "billing_first_name",
  "billing_last_name",
  "billing_address_1",
  "billing_address_2",
  "billing_city",
  "billing_state",
  "billing_postcode",
  "billing_country",
  "billing_company",
  "billing_phone",
  "shipping_first_name",
  "shipping_last_name",
  "shipping_address_1",
  "shipping_address_2",
  "shipping_city",
  "shipping_state",
  "shipping_postcode",
  "shipping_country",
  "shipping_company",
  "shipping_phone",
];

async function getUserMetaMap(userId) {
  const [rows] = await db.query(
    `SELECT meta_key, meta_value
     FROM tbl_usermeta
     WHERE user_id = ? AND meta_key IN (?)`,
    [userId, PROFILE_META_KEYS],
  );

  return rows.reduce((acc, row) => {
    acc[row.meta_key] = toStr(row.meta_value);
    return acc;
  }, {});
}

async function upsertUserMeta(conn, userId, metaKey, metaValue) {
  await conn.query(
    `INSERT INTO tbl_usermeta (user_id, meta_key, meta_value)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
    [userId, metaKey, toStr(metaValue)],
  );
}

function normalizeProfileAddressInput(payload, kind) {
  const prefix = kind === "billing" ? "billing" : "shipping";

  return {
    firstName: toStr(payload.firstName),
    lastName: toStr(payload.lastName),
    email: toStr(payload.email),
    phone: toStr(payload.phone),
    company: toStr(payload.company),
    address1: toStr(payload.address1),
    address2: toStr(payload.address2),
    city: toStr(payload.city),
    state: toStr(payload.state),
    postcode: toStr(payload.postcode),
    country: DEFAULT_COUNTRY,
    meta: {
      [`${prefix}_first_name`]: toStr(payload.firstName),
      [`${prefix}_last_name`]: toStr(payload.lastName),
      [`${prefix}_address_1`]: toStr(payload.address1),
      [`${prefix}_address_2`]: toStr(payload.address2),
      [`${prefix}_city`]: toStr(payload.city),
      [`${prefix}_state`]: toStr(payload.state),
      [`${prefix}_postcode`]: toStr(payload.postcode),
      [`${prefix}_country`]: DEFAULT_COUNTRY,
      [`${prefix}_company`]: toStr(payload.company),
      [`${prefix}_phone`]: toStr(payload.phone),
    },
  };
}

function validateProfileAddress(address) {
  const errors = {};
  if (!address.firstName) errors.firstName = "First name required";
  if (!address.lastName) errors.lastName = "Last name required";
  if (!address.address1) errors.address1 = "Address required";
  if (!address.city) errors.city = "City required";
  if (!address.state) errors.state = "State required";
  if (!address.postcode) errors.postcode = "Postcode required";
  return errors;
}

function buildProfileAddressResponse(userRow, meta) {
  return buildProfileAddressResponseWithFallback(userRow, meta, {});
}

function buildProfileAddressResponseWithFallback(userRow, meta, fallback) {
  const billingFallback = fallback.billing || {};
  const shippingFallback = fallback.shipping || {};

  return {
    billing: {
      firstName: toStr(
        meta.billing_first_name || meta.first_name || userRow.display_name,
      ),
      lastName: toStr(meta.billing_last_name || meta.last_name),
      email: toStr(userRow.user_email),
      phone: toStr(meta.billing_phone),
      company: toStr(meta.billing_company),
      address1: toStr(meta.billing_address_1 || billingFallback.address1),
      address2: toStr(meta.billing_address_2 || billingFallback.address2),
      city: toStr(meta.billing_city || billingFallback.city),
      state: toStr(meta.billing_state || billingFallback.state),
      postcode: toStr(meta.billing_postcode || billingFallback.postcode),
      country: DEFAULT_COUNTRY,
    },
    shipping: {
      firstName: toStr(
        meta.shipping_first_name || meta.first_name || userRow.display_name,
      ),
      lastName: toStr(meta.shipping_last_name || meta.last_name),
      email: toStr(userRow.user_email),
      phone: toStr(meta.shipping_phone),
      company: toStr(meta.shipping_company),
      address1: toStr(meta.shipping_address_1 || shippingFallback.address1),
      address2: toStr(meta.shipping_address_2 || shippingFallback.address2),
      city: toStr(meta.shipping_city || shippingFallback.city),
      state: toStr(meta.shipping_state || shippingFallback.state),
      postcode: toStr(meta.shipping_postcode || shippingFallback.postcode),
      country: DEFAULT_COUNTRY,
    },
  };
}

async function getLatestOrderAddressFallback(userId) {
  const [rows] = await db.query(
    `SELECT ua.address_billing,
            ua.address_line1,
            ua.address_line2,
            ua.city,
            ua.state_name,
            ua.zipcode
     FROM tbl_user_address ua
     JOIN tbl_orders o ON o.order_id = ua.order_id
     WHERE ua.user_id = ?
       AND ua.order_id IS NOT NULL
       AND o.order_type = 'shop_order'
     ORDER BY o.order_date DESC, ua.address_id DESC`,
    [userId],
  );

  const fallback = { billing: {}, shipping: {} };
  for (const row of rows) {
    if (row.address_billing === "yes" && !fallback.billing.address1) {
      fallback.billing = {
        address1: toStr(row.address_line1),
        address2: toStr(row.address_line2),
        city: toStr(row.city),
        state: toStr(row.state_name),
        postcode: toStr(row.zipcode),
      };
    }

    if (row.address_billing !== "yes" && !fallback.shipping.address1) {
      fallback.shipping = {
        address1: toStr(row.address_line1),
        address2: toStr(row.address_line2),
        city: toStr(row.city),
        state: toStr(row.state_name),
        postcode: toStr(row.zipcode),
      };
    }

    if (fallback.billing.address1 && fallback.shipping.address1) {
      break;
    }
  }

  return fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// insertAddress helper
//
// address_primary → ALWAYS 'no' for order rows.
//   Only set to 'yes' from profile/address-book page (like Amazon "Set as default").
//
// address_billing → identifies billing vs shipping ROW for this order:
//   'yes' = billing address row
//   'no'  = shipping address row
//
// Two types of rows in tbl_user_address:
//   ORDER rows        → order_id = real ID, address_primary = 'no'
//   SAVED ADDR rows   → order_id = NULL,    address_primary = 'yes'/'no'
// ─────────────────────────────────────────────────────────────────────────────
async function insertAddress(
  conn,
  { userId, orderId, address, isBilling, createdAt, notes = null },
) {
  await conn.query(
    `INSERT INTO tbl_user_address
     (user_id, order_id, address_type, address_primary,
      first_name, last_name, phone,
      address_line1, address_line2, city, zipcode, state_name,
      city_id, state_id, country_id, address_notes,
      address_billing, latitude, longitude, created_at, updated_at, update_done)
     VALUES
     (?, ?, 'general', 'no',
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      0, NULL, 226, ?,
      ?, '', '', ?, ?, 'no')`,
    [
      userId, // user_id
      orderId, // order_id  (always a real ID for order rows)
      address.firstName || "", // first_name
      address.lastName || "", // last_name
      address.phone || "", // phone
      address.line1 || "", // address_line1
      address.line2 || "", // address_line2
      address.city || "", // city
      address.zip || "", // zipcode
      address.state || "", // state_name
      notes, // address_notes
      isBilling ? "yes" : "no", // address_billing ? 'yes'=billing, 'no'=shipping
      createdAt, // created_at
      createdAt, // updated_at
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// placeOrder
// ─────────────────────────────────────────────────────────────────────────────
const placeOrder = async (req, res) => {
  const user = getSessionUser(req);
  const userId = user ? user.id : 0;
  const { key, value, cookieId, sessionId } = getCartIdentity(req);

  const billing = sanitizeBilling(req.body.billing);
  const shipping = sanitizeShipping(req.body.shipping, billing);
  const paymentMethod = toStr(req.body.payment_method) || "cod";
  const shippingCost = toAmount(req.body.shipping_cost || 0);
  const orderNotes = toStr(req.body.notes) || null;
  const appliedCoupon = req.sessionData?.appliedCoupon || null;

  const razorpayPaymentId = req.body.razorpay_payment_id || null;
  const razorpayOrderId = req.body.razorpay_order_id || null;
  const razorpaySignature = req.body.razorpay_signature || null;

  const billingErrors = validateBilling(billing);
  if (Object.keys(billingErrors).length) {
    return res.status(400).json({
      success: false,
      message: "Invalid billing details.",
      errors: billingErrors,
    });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // ── 1. Fetch cart items ───────────────────────────────────────────────────
    let cartItems;
    if (userId) {
      [cartItems] = await conn.query(
        "SELECT * FROM cart_items WHERE user_id = ? ORDER BY created_at DESC",
        [userId],
      );
    } else if (key === "cookie_id") {
      [cartItems] = await conn.query(
        "SELECT * FROM cart_items WHERE cookie_id = ? AND user_id IS NULL ORDER BY created_at DESC",
        [value],
      );
    } else {
      [cartItems] = await conn.query(
        "SELECT * FROM cart_items WHERE session_id = ? AND user_id IS NULL ORDER BY created_at DESC",
        [value],
      );
    }

    if (!cartItems.length) {
      await conn.rollback();
      return res
        .status(400)
        .json({ success: false, message: "Cart is empty." });
    }

    // ── 1b. Stock check for all cart items (with row locking for race safety) ──
    for (const item of cartItems) {
      const checkId =
        item.variation_id && item.variation_id > 0
          ? item.variation_id
          : item.product_id;
      const qty = Number(item.quantity || 0);

      // FOR UPDATE locks these rows so two simultaneous orders can't both pass
      const [[stockStatusRow]] = await conn.query(
        `SELECT meta_value AS stock_status
         FROM tbl_productmeta
         WHERE product_id = ? AND meta_key = '_stock_status'
         ORDER BY meta_id DESC
         LIMIT 1
         FOR UPDATE`,
        [checkId],
      );

      const [[stockQtyRow]] = await conn.query(
        `SELECT CAST(meta_value AS SIGNED) AS stock
         FROM tbl_productmeta
         WHERE product_id = ? AND meta_key = '_stock'
         ORDER BY meta_id DESC
         LIMIT 1
         FOR UPDATE`,
        [checkId],
      );

      const stockStatus = stockStatusRow
        ? stockStatusRow.stock_status
        : "instock";
      const stockQty = stockQtyRow ? stockQtyRow.stock : 0;

      if (stockStatus === "outofstock") {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `"${item.title || "A product in your cart"}" is out of stock. Please remove it before placing your order.`,
        });
      }

      if (stockQty < qty) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `"${item.title || "A product in your cart"}" only has ${stockQty} left in stock but you ordered ${qty}. Please update your cart.`,
        });
      }
    }

    // ── 2. Calculate totals ───────────────────────────────────────────────────
    const subtotal = cartItems.reduce(
      (sum, item) => sum + toAmount(item.price) * Number(item.quantity || 0),
      0,
    );

    // Re-validate coupon inside the transaction with FOR UPDATE locking
    // This prevents race conditions (two users using the last coupon slot).
    const productIds = cartItems
      .map((i) => Number(i.product_id))
      .filter(Boolean);
    const couponCheck = await validateAndLockCoupon(
      conn,
      appliedCoupon,
      userId,
      subtotal,
      productIds,
      cartItems,
    );
    if (!couponCheck.ok) {
      await conn.rollback();
      delete req.sessionData.appliedCoupon;
      req.touchSession();
      return res.status(400).json({
        success: false,
        coupon_error: true,
        message: couponCheck.message,
      });
    }
    const discount = couponCheck.discount || 0;

    const total = Math.max(0, subtotal - discount) + shippingCost;

    if (paymentMethod === "razorpay" && !razorpayPaymentId) {
      const razorpay = require("../config/razorpay");

      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(total * 100),
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
      });

      await conn.rollback();

      return res.json({
        success: true,
        razorpay: true,
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID,
      });
    }

    if (paymentMethod === "razorpay" && razorpayPaymentId) {
      const crypto = require("crypto");

      const generatedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_SECRET)
        .update(razorpayOrderId + "|" + razorpayPaymentId)
        .digest("hex");

      if (generatedSignature !== razorpaySignature) {
        await conn.rollback();

        return res.status(400).json({
          success: false,
          message: "Payment verification failed",
        });
      }
    }

    const currency =
      process.env.ORDER_CURRENCY || process.env.CURRENCY || "INR";

    // ── 3. Insert into tbl_orders ─────────────────────────────────────────────
    const orderName = buildOrderName();
    const orderTitle = `Order - ${new Date().toLocaleString()}`;

    const [orderResult] = await conn.query(
      `INSERT INTO tbl_orders
       (parent_id, user_id, order_name, order_title, order_content,
        order_status, order_type, order_date, order_modified)
       VALUES (0, ?, ?, ?, '', 'wc-pending', 'shop_order', NOW(), NOW())`,
      [userId, orderName, orderTitle],
    );
    const orderId = orderResult.insertId;

    // ===================================
    // SHIPROCKET ORDER PAYLOAD
    // ===================================

    const orderIdShiprocket = "ORD_" + orderId;

    const shiprocketPayload = {
      order_id: orderIdShiprocket,

      order_date: new Date().toISOString().slice(0, 10),

      pickup_location: "warehouse",

      billing_customer_name: billing.first_name,

      billing_last_name: billing.last_name,

      billing_address: billing.address,

      billing_address_2: billing.address_2 || "",

      billing_city: billing.city,

      billing_pincode: billing.postcode,

      billing_state: billing.state,

      billing_country: "India",

      billing_email: billing.email,

      billing_phone: billing.phone,

      shipping_is_billing: true,

      order_items: cartItems.map((item) => ({
        name: item.title || "Product",

        sku: item.product_id,

        units: Number(item.quantity),

        selling_price: Number(item.price),
      })),

      payment_method: paymentMethod === "cod" ? "COD" : "Prepaid",

      sub_total: total,

      length: 10,

      breadth: 10,

      height: 10,

      weight: 0.5,
    };

    // ===================================
    // CREATE SHIPROCKET ORDER
    // ===================================

    const shiprocketResponse = await createShiprocketOrder(shiprocketPayload);

    console.log("Shiprocket Order Created:", shiprocketResponse);

    // ===================================
    // GENERATE AWB
    // ===================================

    let awbResponse = null;

    if (shiprocketResponse.shipment_id) {
      awbResponse = await generateAWB(shiprocketResponse.shipment_id);

      console.log("AWB Generated:", awbResponse);
      await conn.query(
        `UPDATE tbl_orders
        SET shipment_id = ?,
       awb_code = ?,
       courier_name = ?,
       shipping_status = ?
        WHERE order_id = ?`,
        [
          shiprocketResponse.shipment_id || "",

          awbResponse?.response?.data?.awb_code || "",

          awbResponse?.response?.data?.courier_name || "",

          "new",

          orderId,
        ],
      );
    }

    // end shiprocket code

    // ── 4. tbl_ordermeta: financial + payment data ONLY ──────────────────────
    //    NO address, NO contact info here
    //    name/email  → tbl_users via user_id
    //    address     → tbl_user_address via order_id
    const metaEntries = [
      ["_customer_user", userId],
      ["_payment_method", paymentMethod],
      ["_order_currency", currency],
      ["_order_total", total.toFixed(2)],
      ["_order_subtotal", subtotal.toFixed(2)],
      ["_order_shipping", shippingCost.toFixed(2)],
      ["_session_id", sessionId],
      ["_cookie_id", cookieId || ""],
    ];

    if (appliedCoupon) {
      metaEntries.push(["_coupon_code", appliedCoupon.coupon_code]);
      metaEntries.push(["_coupon_discount", discount.toFixed(2)]);
    }

    if (paymentMethod === "razorpay") {
      metaEntries.push(["_razorpay_payment_id", razorpayPaymentId]);
      metaEntries.push(["_razorpay_order_id", razorpayOrderId]);
    }

    if (shiprocketResponse.shipment_id) {
       metaEntries.push(["_shiprocket_order_id", orderData.order_id]);
       metaEntries.push(["_shiprocket_shipment_id", orderData.shipment_id]);
       metaEntries.push(["_awb_code", awbData.response.data.awb_code]);
       metaEntries.push(["_courier_id", awbData.response.data.courier_company_id]);
       metaEntries.push(["_courier_name", awbData.response.data.courier_name]);
       metaEntries.push(["_tracking_number", awbData.response.data.awb_code]);
       metaEntries.push(["_freight_charges", awbData.response.data.freight_charges]);
    }

    for (const [metaKey, metaValue] of metaEntries) {
      await conn.query(
        "INSERT INTO tbl_ordermeta (order_id, meta_key, meta_value) VALUES (?, ?, ?)",
        [orderId, metaKey, metaValue],
      );
    }

    // ── 5. tbl_user_address: always 2 rows per order ─────────────────────────
    //    Whether user used saved address or typed new address — always insert fresh.
    //    Saved address (order_id = NULL) is just a template to pre-fill the form.
    //    Order rows always get a real order_id.
    //
    //    address_primary = 'no' always for order rows
    //    address_billing = 'yes' → billing row
    //    address_billing = 'no'  → shipping row
    const addressUserId = userId > 0 ? userId : null;
    const createdAt = new Date().toISOString().slice(0, 19).replace("T", " ");

    // Billing address row
    await insertAddress(conn, {
      userId: addressUserId,
      orderId,
      isBilling: true,
      createdAt,
      notes: orderNotes,
      address: {
        firstName: billing.first_name,
        lastName: billing.last_name,
        phone: billing.phone,
        line1: billing.address,
        line2: billing.address_2,
        city: billing.city,
        zip: billing.postcode,
        state: billing.state,
      },
    });

    // Shipping address row
    await insertAddress(conn, {
      userId: addressUserId,
      orderId,
      isBilling: false,
      createdAt,
      notes: null,
      address: {
        firstName: shipping.first_name,
        lastName: shipping.last_name,
        phone: shipping.phone,
        line1: shipping.address,
        line2: shipping.address_2,
        city: shipping.city,
        zip: shipping.postcode,
        state: shipping.state,
      },
    });

    // ── 6. tbl_order_items + tbl_order_itemmeta ───────────────────────────────
    for (const item of cartItems) {
      const [itemResult] = await conn.query(
        `INSERT INTO tbl_order_items (order_item_name, order_item_type, order_id, product_id)
         VALUES (?, 'line_item', ?, ?)`,
        [item.title || "Item", orderId, item.product_id],
      );
      const orderItemId = itemResult.insertId;

      const variationId =
        item.variation_id && Number(item.variation_id) > 0
          ? item.variation_id
          : 0;
      const lineTotal = toAmount(item.price) * Number(item.quantity || 0);

      const itemMeta = [
        ["_product_id", item.product_id],
        ["_variation_id", variationId],
        ["_qty", item.quantity],
        ["_line_subtotal", lineTotal.toFixed(2)],
        ["_line_total", lineTotal.toFixed(2)],
        ["_line_tax", "0"],
        ["_line_subtotal_tax", "0"],
      ];

      if (item.color) itemMeta.push(["pa_color", item.color]);
      if (item.size) itemMeta.push(["pa_size", item.size]);
      // Save image at order time — Amazon/Flipkart pattern
      if (item.image && !item.image.includes("dummy"))
        itemMeta.push(["_item_image", item.image]);

      for (const [metaKey, metaValue] of itemMeta) {
        await conn.query(
          "INSERT INTO tbl_order_itemmeta (order_item_id, meta_key, meta_value) VALUES (?, ?, ?)",
          [orderItemId, metaKey, metaValue],
        );
      }
    }

    // ── 6b. Deduct stock for each purchased item (atomic, inside transaction) ──
    for (const item of cartItems) {
      const qty = Number(item.quantity || 0);
      if (!qty) continue;

      // Use variation_id if present, otherwise product_id
      const stockProductId =
        item.variation_id && Number(item.variation_id) > 0
          ? item.variation_id
          : item.product_id;

      // Deduct stock — rows already locked by FOR UPDATE in step 1b
      await conn.query(
        `UPDATE tbl_productmeta
         SET meta_value = GREATEST(0, CAST(meta_value AS SIGNED) - ?)
         WHERE product_id = ? AND meta_key = '_stock'`,
        [qty, stockProductId],
      );

      // Re-read remaining stock and flip status to outofstock if depleted
      const [[stockResult]] = await conn.query(
        `SELECT CAST(meta_value AS SIGNED) AS stock
         FROM tbl_productmeta
         WHERE product_id = ? AND meta_key = '_stock'
         ORDER BY meta_id DESC
         LIMIT 1`,
        [stockProductId],
      );

      const remainingStock = stockResult ? stockResult.stock : 0;

      if (remainingStock <= 0) {
        await conn.query(
          `UPDATE tbl_productmeta
           SET meta_value = 'outofstock'
           WHERE product_id = ? AND meta_key = '_stock_status'`,
          [stockProductId],
        );
      }
    }

    // ── 7. Shipping cost line item ────────────────────────────────────────────
    if (shippingCost > 0) {
      const [shipResult] = await conn.query(
        `INSERT INTO tbl_order_items (order_item_name, order_item_type, order_id, product_id)
         VALUES ('Shipping', 'shipping', ?, 0)`,
        [orderId],
      );
      await conn.query(
        "INSERT INTO tbl_order_itemmeta (order_item_id, meta_key, meta_value) VALUES (?, ?, ?)",
        [shipResult.insertId, "cost", shippingCost.toFixed(2)],
      );
    }

    // ── 8. Clear cart ─────────────────────────────────────────────────────────
    if (userId) {
      await conn.query("DELETE FROM cart_items WHERE user_id = ?", [userId]);
    } else if (key === "cookie_id") {
      await conn.query(
        "DELETE FROM cart_items WHERE cookie_id = ? AND user_id IS NULL",
        [value],
      );
    } else {
      await conn.query(
        "DELETE FROM cart_items WHERE session_id = ? AND user_id IS NULL",
        [value],
      );
    }

    // ── 9. Record coupon usage ────────────────────────────────────────────────
    if (appliedCoupon && couponCheck.ok) {
      await recordCouponUsage(conn, appliedCoupon, orderId, userId);
    }

    await conn.commit();

    // Clear coupon from session after successful order
    if (appliedCoupon) {
      delete req.sessionData.appliedCoupon;
      req.touchSession();
    }

    let emailSent = false;
    try {
      const toEmail = billing.email;
      const toName = `${billing.first_name} ${billing.last_name}`.trim();
      const frontendBase = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
      const isLocalHost = /localhost|127\.0\.0\.1/.test(frontendBase);
      let logoSrc = "";
      if (BREVO_LOGO_URL) {
        logoSrc = BREVO_LOGO_URL;
      } else if (frontendBase && !isLocalHost) {
        logoSrc = `${frontendBase}/store/images/logo-white.png`;
      } else {
        logoSrc = getLogoDataUri();
      }
      const itemRows = cartItems
        .map((item) => {
          const title = escapeHtml(item.title || "Item");
          const qty = Number(item.quantity || 0);
          const price = toAmount(item.price);
          const lineTotal = price * qty;
          return `
          <tr>
            <td style="padding:10px 12px; border-bottom:1px solid #f0ece6; font-size:14px;">${title}</td>
            <td style="padding:10px 12px; border-bottom:1px solid #f0ece6; text-align:center; font-size:14px;">${qty}</td>
            <td style="padding:10px 12px; border-bottom:1px solid #f0ece6; text-align:right; font-size:14px;">₹${formatMoney(price)}</td>
            <td style="padding:10px 12px; border-bottom:1px solid #f0ece6; text-align:right; font-size:14px;">₹${formatMoney(lineTotal)}</td>
          </tr>
        `;
        })
        .join("");

      const billingBlock = `${escapeHtml(billing.address)}${billing.address_2 ? `, ${escapeHtml(billing.address_2)}` : ""}, ${escapeHtml(billing.city)}, ${escapeHtml(billing.state)} ${escapeHtml(billing.postcode)}, ${escapeHtml(billing.country)}`;
      const shippingBlock = `${escapeHtml(shipping.address)}${shipping.address_2 ? `, ${escapeHtml(shipping.address_2)}` : ""}, ${escapeHtml(shipping.city)}, ${escapeHtml(shipping.state)} ${escapeHtml(shipping.postcode)}, ${escapeHtml(shipping.country)}`;
      const orderDate = new Date().toLocaleString();

      const emailHtml = `
        <div style="margin:0; padding:0; background:#f5efe8;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5efe8; padding:28px 0;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #eadfce;">
                  <tr>
                    <td style="background:linear-gradient(135deg,#161616,#2c1f14); padding:22px 26px; text-align:left;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                          <td>
                            ${logoSrc ? `<img src="${logoSrc}" alt="NESTCASE" style="height:40px; width:auto; display:block;" />` : `<div style="color:#fff; font-size:20px; letter-spacing:2px; font-weight:700;">COFFR</div>`}
                          </td>
                          <td style="text-align:right; color:#fff; font-family: Arial, sans-serif; font-size:12px;">
                            <div style="opacity:0.85;">Order Confirmed</div>
                            <div style="font-size:14px; font-weight:700;">#${orderId}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:24px 28px; font-family: Arial, sans-serif; color:#1b1b1b;">
                      <h2 style="margin:0 0 8px; font-size:22px; color:#1b1b1b;">Thank you for your order!</h2>
                      <p style="margin:0 0 6px; color:#4c4c4c;">Hi ${escapeHtml(toName || "there")},</p>
                      <p style="margin:0 0 18px; color:#4c4c4c;">We’ve received your order and it’s now being processed.</p>

                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px;">
                        <tr>
                          <td style="background:#faf6f0; border:1px solid #efe5d8; border-radius:10px; padding:14px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                              <tr>
                                <td style="font-size:12px; color:#777;">Order Date</td>
                                <td style="font-size:12px; color:#777; text-align:right;">Payment</td>
                              </tr>
                              <tr>
                                <td style="font-size:14px; font-weight:700; color:#222;">${escapeHtml(orderDate)}</td>
                                <td style="font-size:14px; font-weight:700; color:#222; text-align:right;">${escapeHtml(paymentMethod.toUpperCase())}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>

                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse; margin:0 0 18px; border:1px solid #efe5d8; border-radius:10px; overflow:hidden;">
                        <thead>
                          <tr style="background:#faf6f0;">
                            <th style="text-align:left; font-size:12px; padding:10px 12px; color:#6b5b4b;">Item</th>
                            <th style="text-align:center; font-size:12px; padding:10px 12px; color:#6b5b4b;">Qty</th>
                            <th style="text-align:right; font-size:12px; padding:10px 12px; color:#6b5b4b;">Price</th>
                            <th style="text-align:right; font-size:12px; padding:10px 12px; color:#6b5b4b;">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${itemRows}
                        </tbody>
                      </table>

                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px;">
                        <tr>
                          <td style="background:#111; color:#fff; border-radius:10px; padding:14px 16px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                              <tr>
                                <td style="font-size:13px; opacity:0.8;">Subtotal</td>
                                <td style="font-size:13px; text-align:right; opacity:0.8;">₹${formatMoney(subtotal)}</td>
                              </tr>
                              ${
                                discount > 0
                                  ? `
                              <tr>
                                <td style="font-size:13px; opacity:0.8;">Discount (${escapeHtml(appliedCoupon.coupon_code)})</td>
                                <td style="font-size:13px; text-align:right; opacity:0.8; color:#4caf50;">−₹${formatMoney(discount)}</td>
                              </tr>`
                                  : ""
                              }
                              <tr>
                                <td style="font-size:13px; opacity:0.8;">Shipping</td>
                                <td style="font-size:13px; text-align:right; opacity:0.8;">₹${formatMoney(shippingCost)}</td>
                              </tr>
                              <tr>
                                <td style="font-size:16px; font-weight:700; padding-top:8px;">Order Total</td>
                                <td style="font-size:16px; font-weight:700; text-align:right; padding-top:8px;">₹${formatMoney(total)}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>

                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 10px;">
                        <tr>
                          <td style="width:50%; padding-right:10px; vertical-align:top;">
                            <div style="border:1px solid #efe5d8; border-radius:10px; padding:12px;">
                              <div style="font-size:12px; color:#6b5b4b; margin-bottom:6px;">Billing Address</div>
                              <div style="font-size:13px; color:#222; line-height:1.5;">${billingBlock}</div>
                            </div>
                          </td>
                          <td style="width:50%; padding-left:10px; vertical-align:top;">
                            <div style="border:1px solid #efe5d8; border-radius:10px; padding:12px;">
                              <div style="font-size:12px; color:#6b5b4b; margin-bottom:6px;">Shipping Address</div>
                              <div style="font-size:13px; color:#222; line-height:1.5;">${shippingBlock}</div>
                            </div>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:14px 0 0; color:#555;">We’ll notify you once your order ships.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background:#f8f3ee; padding:14px 24px; text-align:center; font-family: Arial, sans-serif; font-size:12px; color:#7a6b5c;">
                      Thank you for choosing NESTCASE
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      `;

      emailSent = await sendBrevoEmail({
        toEmail,
        toName,
        subject: `Order Confirmed - #${orderId}`,
        html: emailHtml,
      });
    } catch (emailErr) {
      console.error("Order email error:", emailErr);
    }

    res.json({
      success: true,
      data: {
        orderId,
        total: total.toFixed(2),
        discount: discount.toFixed(2),
        emailSent,
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    conn.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getDefaultAddress
// Pre-fills checkout form with user's default saved address.
// Only looks at saved address rows (order_id IS NULL).
// Frontend: GET /store/api/address/default
// ─────────────────────────────────────────────────────────────────────────────
const getDefaultAddress = async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "Login required." });
  }
  try {
    const [[address]] = await db.query(
      `SELECT * FROM tbl_user_address
       WHERE user_id = ? AND order_id IS NULL AND address_primary = 'yes'
       ORDER BY address_id DESC LIMIT 1`,
      [user.id],
    );
    res.json({ success: true, data: address || null });
  } catch (err) {
    console.error("getDefaultAddress error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to load default address." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// setDefaultAddress
// User sets a saved address as default from profile/address-book page.
// Only touches saved address rows (order_id IS NULL).
// Order rows are never affected.
// Frontend: PUT /store/api/address/default/:addressId
// ─────────────────────────────────────────────────────────────────────────────
const setDefaultAddress = async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "Login required." });
  }
  const addressId = Number.parseInt(req.params.addressId, 10);
  if (!addressId) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid address id." });
  }
  try {
    // Step 1: Remove default from all saved addresses only (NOT order rows)
    await db.query(
      `UPDATE tbl_user_address
       SET address_primary = 'no'
       WHERE user_id = ? AND order_id IS NULL`,
      [user.id],
    );
    // Step 2: Set selected saved address as default
    await db.query(
      `UPDATE tbl_user_address
       SET address_primary = 'yes'
       WHERE address_id = ? AND user_id = ? AND order_id IS NULL`,
      [addressId, user.id],
    );
    res.json({ success: true, message: "Default address updated." });
  } catch (err) {
    console.error("setDefaultAddress error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to update default address." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
const getRecentOrderAddresses = async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "Login required." });
  }

  try {
    const [rows] = await db.query(
      `SELECT address_id, order_id, address_billing,
              first_name, last_name, phone,
              address_line1, address_line2, city, state_name, zipcode
       FROM tbl_user_address
       WHERE user_id = ? AND order_id IS NOT NULL
       ORDER BY order_id DESC, address_id DESC
       LIMIT 20`,
      [user.id],
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("getRecentOrderAddresses error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to load recent addresses." });
  }
};
// getSavedAddresses
// Returns only saved address-book rows (order_id IS NULL).
// Order rows are excluded — they are fetched via getMyOrderById.
// Frontend: GET /store/api/address/saved
// ─────────────────────────────────────────────────────────────────────────────
const getSavedAddresses = async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "Login required." });
  }
  try {
    const [addresses] = await db.query(
      `SELECT address_id, address_type, address_primary,
              address_line1, address_line2, city, zipcode,
              state_name, address_notes, address_billing
       FROM tbl_user_address
       WHERE user_id = ? AND order_id IS NULL
       ORDER BY address_primary DESC, address_id DESC`,
      [user.id],
    );
    res.json({ success: true, data: addresses });
  } catch (err) {
    console.error("getSavedAddresses error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to load addresses." });
  }
};

const getProfileAddresses = async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "Login required." });
  }

  try {
    const [[userRow]] = await db.query(
      `SELECT ID, display_name, user_email
       FROM tbl_users
       WHERE ID = ?
       LIMIT 1`,
      [user.id],
    );

    if (!userRow) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const [meta, orderFallback] = await Promise.all([
      getUserMetaMap(user.id),
      getLatestOrderAddressFallback(user.id),
    ]);
    res.json({
      success: true,
      data: buildProfileAddressResponseWithFallback(
        userRow,
        meta,
        orderFallback,
      ),
    });
  } catch (err) {
    console.error("getProfileAddresses error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to load profile addresses." });
  }
};

const updateProfileAddress = async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "Login required." });
  }

  const kind =
    req.params.kind === "billing"
      ? "billing"
      : req.params.kind === "shipping"
        ? "shipping"
        : "";
  if (!kind) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid address type." });
  }

  const address = normalizeProfileAddressInput(req.body || {}, kind);
  const errors = validateProfileAddress(address);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Please fill all required address fields.",
      errors,
    });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE tbl_users
       SET user_email = CASE WHEN ? <> '' THEN ? ELSE user_email END,
           display_name = CASE
             WHEN ? <> '' AND ? = 'billing' THEN TRIM(CONCAT(?, CASE WHEN ? <> '' THEN ' ' ELSE '' END, ?))
             ELSE display_name
           END
       WHERE ID = ?`,
      [
        address.email,
        address.email,
        address.firstName,
        kind,
        address.firstName,
        address.lastName,
        address.lastName,
        user.id,
      ],
    );

    for (const [metaKey, metaValue] of Object.entries(address.meta)) {
      await upsertUserMeta(conn, user.id, metaKey, metaValue);
    }

    await conn.commit();

    const [[userRow]] = await db.query(
      `SELECT ID, display_name, user_email
       FROM tbl_users
       WHERE ID = ?
       LIMIT 1`,
      [user.id],
    );
    const meta = await getUserMetaMap(user.id);

    res.json({
      success: true,
      message: `${kind === "billing" ? "Billing" : "Shipping"} address updated successfully.`,
      data: buildProfileAddressResponse(userRow, meta),
    });
  } catch (err) {
    await conn.rollback();
    console.error("updateProfileAddress error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to update profile address." });
  } finally {
    conn.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getMyOrders
// Frontend: GET /store/api/orders/my
// ─────────────────────────────────────────────────────────────────────────────
const getMyOrders = async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "Login required." });
  }
  try {
    const [orders] = await db.query(
      `SELECT o.order_id,
              MAX(o.order_status)      AS order_status,
              MAX(o.awb_code) AS awb_code,
              MAX(o.courier_name) AS courier_name,
              MAX(o.shipping_status) AS shipping_status,
              MAX(o.order_date)        AS order_date,
              MAX(om_total.meta_value) AS total,
              GROUP_CONCAT(oi.order_item_name SEPARATOR ', ') AS items
       FROM tbl_orders o
       LEFT JOIN tbl_ordermeta om_total
         ON o.order_id = om_total.order_id AND om_total.meta_key = '_order_total'
       LEFT JOIN tbl_order_items oi
         ON o.order_id = oi.order_id AND oi.order_item_type = 'line_item'
       WHERE o.user_id = ? AND o.order_type = 'shop_order'
       GROUP BY o.order_id
       ORDER BY MAX(o.order_date) DESC`,
      [user.id],
    );
    res.json({ success: true, data: orders });
  } catch (err) {
    console.error("getMyOrders error:", err);
    res.status(500).json({ success: false, message: "Failed to load orders." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getAllOrders (admin)
// Frontend: GET /store/api/admin/orders
// ─────────────────────────────────────────────────────────────────────────────
const getAllOrders = async (_req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT o.order_id,
              MAX(o.order_status)      AS order_status,
              MAX(o.order_date)        AS order_date,
              MAX(om_total.meta_value) AS total,
              MAX(u.user_email)        AS billing_email,
              MAX(u.display_name)      AS customer_name,
              GROUP_CONCAT(oi.order_item_name SEPARATOR ', ') AS items
       FROM tbl_orders o
       LEFT JOIN tbl_users u ON u.ID = o.user_id
       LEFT JOIN tbl_ordermeta om_total
         ON o.order_id = om_total.order_id AND om_total.meta_key = '_order_total'
       LEFT JOIN tbl_order_items oi
         ON o.order_id = oi.order_id AND oi.order_item_type = 'line_item'
       WHERE o.order_type = 'shop_order'
       GROUP BY o.order_id
       ORDER BY MAX(o.order_date) DESC`,
    );
    res.json({ success: true, data: orders });
  } catch (err) {
    console.error("getAllOrders error:", err);
    res.status(500).json({ success: false, message: "Failed to load orders." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getMyOrderById
// name/email  → tbl_users via user_id        (sir's instruction)
// address     → tbl_user_address via order_id (sir's instruction)
// financials  → tbl_ordermeta
// Frontend: GET /store/api/orders/:orderId
// ─────────────────────────────────────────────────────────────────────────────
const getMyOrderById = async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "Login required." });
  }
  const orderId = Number.parseInt(req.params.orderId, 10);
  if (!orderId) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid order id." });
  }

  try {
    const [orderRows] = await db.query(
      `SELECT o.order_id,
              MAX(o.order_status)      AS order_status,
              MAX(o.awb_code) AS awb_code,
              MAX(o.courier_name) AS courier_name,
              MAX(o.shipping_status) AS shipping_status,
              MAX(o.shipment_id) AS shipment_id,
              MAX(o.order_date)        AS order_date,
              MAX(om_total.meta_value) AS total,
              MAX(om_sub.meta_value)   AS subtotal,
              MAX(om_ship.meta_value)  AS shipping,
              MAX(om_pay.meta_value)   AS payment_method,
              MAX(u.display_name)      AS user_display_name,
              MAX(u.user_email)        AS user_email,
              MAX(ub.first_name)       AS billing_first_name,
              MAX(ub.last_name)        AS billing_last_name,
              MAX(ub.phone)            AS billing_phone,
              MAX(ub.address_line1)    AS billing_address_1,
              MAX(ub.address_line2)    AS billing_address_2,
              MAX(ub.city)             AS billing_city,
              MAX(ub.state_name)       AS billing_state,
              MAX(ub.zipcode)          AS billing_postcode,
              MAX(ub.address_notes)    AS billing_notes,
              MAX(us.first_name)       AS ship_first_name,
              MAX(us.last_name)        AS ship_last_name,
              MAX(us.phone)            AS ship_phone,
              MAX(us.address_line1)    AS ship_address_1,
              MAX(us.address_line2)    AS ship_address_2,
              MAX(us.city)             AS ship_city,
              MAX(us.state_name)       AS ship_state,
              MAX(us.zipcode)          AS ship_postcode
       FROM tbl_orders o
       LEFT JOIN tbl_users u ON u.ID = o.user_id
       LEFT JOIN (
         SELECT order_id,
                MAX(first_name)   AS first_name,
                MAX(last_name)    AS last_name,
                MAX(phone)        AS phone,
                MAX(address_line1) AS address_line1,
                MAX(address_line2) AS address_line2,
                MAX(city)          AS city,
                MAX(state_name)    AS state_name,
                MAX(zipcode)       AS zipcode,
                MAX(address_notes) AS address_notes
         FROM tbl_user_address
         WHERE address_billing = 'yes'
         GROUP BY order_id
       ) ub ON ub.order_id = o.order_id
       LEFT JOIN (
         SELECT order_id,
                MAX(first_name)   AS first_name,
                MAX(last_name)    AS last_name,
                MAX(phone)        AS phone,
                MAX(address_line1) AS address_line1,
                MAX(address_line2) AS address_line2,
                MAX(city)          AS city,
                MAX(state_name)    AS state_name,
                MAX(zipcode)       AS zipcode
         FROM tbl_user_address
         WHERE address_billing = 'no'
         GROUP BY order_id
       ) us ON us.order_id = o.order_id
       LEFT JOIN tbl_ordermeta om_total
         ON o.order_id = om_total.order_id AND om_total.meta_key = '_order_total'
       LEFT JOIN tbl_ordermeta om_sub
         ON o.order_id = om_sub.order_id AND om_sub.meta_key = '_order_subtotal'
       LEFT JOIN tbl_ordermeta om_ship
         ON o.order_id = om_ship.order_id AND om_ship.meta_key = '_order_shipping'
       LEFT JOIN tbl_ordermeta om_pay
         ON o.order_id = om_pay.order_id AND om_pay.meta_key = '_payment_method'
       WHERE o.order_id = ? AND o.user_id = ? AND o.order_type = 'shop_order'
       GROUP BY o.order_id`,
      [orderId, user.id],
    );

    if (!orderRows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found." });
    }

    const order = orderRows[0];

    const [items] = await db.query(
      `SELECT oi.order_item_id,
              oi.order_item_name,
              oi.product_id,
              MAX(CASE WHEN oim.meta_key = '_variation_id' THEN oim.meta_value END) AS variation_id,
              MAX(CASE WHEN oim.meta_key = '_qty'        THEN oim.meta_value END) AS qty,
              MAX(CASE WHEN oim.meta_key = '_line_total' THEN oim.meta_value END) AS line_total,
              MAX(CASE WHEN oim.meta_key = 'pa_color'    THEN oim.meta_value END) AS color,
              MAX(CASE WHEN oim.meta_key = 'pa_size'     THEN oim.meta_value END) AS size,
              (
                SELECT COALESCE(
                  -- 1. Image saved at order time (Amazon/Flipkart pattern)
                  NULLIF((SELECT oim3.meta_value FROM tbl_order_itemmeta oim3
                          WHERE oim3.order_item_id = oi.order_item_id
                            AND oim3.meta_key = '_item_image' LIMIT 1), ''),
                  -- 2. Variation image (parent_id = variation_id)
                  (SELECT mm1.meta_value FROM tbl_media m1
                   JOIN tbl_mediameta mm1 ON mm1.media_id = m1.media_id AND mm1.meta_key = '_wp_attached_file'
                   WHERE m1.parent_id = CAST(NULLIF(
                     (SELECT oim2.meta_value FROM tbl_order_itemmeta oim2
                      WHERE oim2.order_item_id = oi.order_item_id AND oim2.meta_key = '_variation_id' LIMIT 1
                     ), '0') AS UNSIGNED)
                   ORDER BY m1.media_id ASC LIMIT 1),
                  -- 3. Product image (parent_id = product_id)
                  (SELECT mm2.meta_value FROM tbl_media m2
                   JOIN tbl_mediameta mm2 ON mm2.media_id = m2.media_id AND mm2.meta_key = '_wp_attached_file'
                   WHERE m2.parent_id = oi.product_id
                   ORDER BY m2.media_id ASC LIMIT 1)
                )
              ) AS thumbnail_url
       FROM tbl_order_items oi
       LEFT JOIN tbl_order_itemmeta oim ON oim.order_item_id = oi.order_item_id
       WHERE oi.order_id = ? AND oi.order_item_type = 'line_item'
       GROUP BY oi.order_item_id, oi.order_item_name, oi.product_id`,
      [orderId],
    );

    res.json({ success: true, data: { order, items } });
  } catch (err) {
    console.error("getMyOrderById error:", err);
    res.status(500).json({ success: false, message: "Failed to load order." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// updateOrderStatus (admin)
// Frontend: PUT /store/api/admin/orders/:orderId/status
// ─────────────────────────────────────────────────────────────────────────────
const updateOrderStatus = async (req, res) => {
  const orderId = Number.parseInt(req.params.orderId, 10);
  const status = toStr(req.body.status);
  if (!orderId || !status) {
    return res
      .status(400)
      .json({ success: false, message: "orderId and status required." });
  }

  const STOCK_RESTORE_STATUSES = ["wc-cancelled", "wc-refunded", "wc-failed"];

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Get current status before updating
    const [[currentOrder]] = await conn.query(
      "SELECT order_status FROM tbl_orders WHERE order_id = ? LIMIT 1",
      [orderId],
    );
    const previousStatus = currentOrder ? currentOrder.order_status : "";

    await conn.query(
      "UPDATE tbl_orders SET order_status = ?, order_modified = NOW() WHERE order_id = ?",
      [status, orderId],
    );

    // ── Restore stock when order is cancelled, refunded, or failed ────────────
    // Only restore if transitioning INTO a terminal status (not already there)
    const isNewlyTerminal =
      STOCK_RESTORE_STATUSES.includes(status) &&
      !STOCK_RESTORE_STATUSES.includes(previousStatus);

    if (isNewlyTerminal) {
      // Get all line items for this order
      const [orderItems] = await conn.query(
        `SELECT oi.product_id,
                MAX(CASE WHEN oim.meta_key = '_variation_id' THEN oim.meta_value END) AS variation_id,
                MAX(CASE WHEN oim.meta_key = '_qty'          THEN oim.meta_value END) AS qty
         FROM tbl_order_items oi
         LEFT JOIN tbl_order_itemmeta oim ON oim.order_item_id = oi.order_item_id
         WHERE oi.order_id = ? AND oi.order_item_type = 'line_item'
         GROUP BY oi.order_item_id, oi.product_id`,
        [orderId],
      );

      for (const item of orderItems) {
        const qty = Number(item.qty || 0);
        if (!qty) continue;

        const stockProductId =
          item.variation_id && Number(item.variation_id) > 0
            ? item.variation_id
            : item.product_id;

        // Add stock back
        await conn.query(
          `UPDATE tbl_productmeta
           SET meta_value = CAST(meta_value AS SIGNED) + ?
           WHERE product_id = ? AND meta_key = '_stock'`,
          [qty, stockProductId],
        );

        // Re-enable instock status if it was outofstock
        await conn.query(
          `UPDATE tbl_productmeta
           SET meta_value = 'instock'
           WHERE product_id = ? AND meta_key = '_stock_status'
             AND meta_value = 'outofstock'`,
          [stockProductId],
        );
      }
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error("updateOrderStatus error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to update order status." });
  } finally {
    conn.release();
  }
};

module.exports = {
  placeOrder,
  getMyOrders,
  getMyOrderById,
  getAllOrders,
  updateOrderStatus,
  getDefaultAddress,
  setDefaultAddress,
  getRecentOrderAddresses,
  getSavedAddresses,
  getProfileAddresses,
  updateProfileAddress,
  getShippingRate,
};
