const db = require("../config/db");

// ── Helper: get all meta for an order as object ──────────────────────────────
const getOrderMeta = async (orderId) => {
  const [rows] = await db.query(
    "SELECT meta_key, meta_value FROM tbl_ordermeta WHERE order_id = ?",
    [orderId],
  );
  const meta = {};
  rows.forEach((r) => {
    meta[r.meta_key] = r.meta_value;
  });
  return meta;
};

// ── Helper: get all items for an order with their meta ───────────────────────
const getOrderItems = async (orderId) => {
  const [items] = await db.query(
    "SELECT * FROM tbl_order_items WHERE order_id = ? ORDER BY order_item_id ASC",
    [orderId],
  );
  for (const item of items) {
    const [metaRows] = await db.query(
      "SELECT meta_key, meta_value FROM tbl_order_itemmeta WHERE order_item_id = ?",
      [item.order_item_id],
    );
    item.meta = {};
    metaRows.forEach((r) => {
      item.meta[r.meta_key] = r.meta_value;
    });
  }
  return items;
};

// ── Status badge config ───────────────────────────────────────────────────────
const statusBadge = {
  "wc-completed": { label: "Completed", class: "bg-success" },
  "wc-processing": { label: "Processing", class: "bg-primary" },
  "wc-pending": { label: "Pending", class: "bg-warning text-dark" },
  "wc-on-hold": { label: "On Hold", class: "bg-info text-dark" },
  "wc-cancelled": { label: "Cancelled", class: "bg-secondary" },
  "wc-refunded": { label: "Refunded", class: "bg-danger" },
  "wc-failed": { label: "Failed", class: "bg-dark" },
};

// ─── LIST ORDERS ──────────────────────────────────────────────────────────────
const showOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const status = req.query.status || "";
    const search = req.query.search || "";

    let where = "WHERE o.order_type = 'shop_order' AND o.parent_id = 0";
    const params = [];

    if (status) {
      where += " AND o.order_status = ?";
      params.push(status);
    }

    if (search) {
      where += `
        AND (
          o.order_title LIKE ?
          OR o.order_name LIKE ?
          OR ua.first_name LIKE ?
          OR ua.last_name LIKE ?
          OR om_email.meta_value LIKE ?
        )
      `;

      const searchValue = "%" + search + "%";

      params.push(
        searchValue,
        searchValue,
        searchValue,
        searchValue,
        searchValue,
      );
    }

    // ─── Total Count ──────────────────────────────────────────────────────────
    const [[{ total }]] = await db.query(
      `
      SELECT COUNT(DISTINCT o.order_id) AS total
      FROM tbl_orders o
      LEFT JOIN tbl_user_address ua
        ON ua.order_id = o.order_id
       AND ua.address_billing = 'yes'
      LEFT JOIN tbl_ordermeta om_email
        ON om_email.order_id = o.order_id
       AND om_email.meta_key = '_billing_email'
      ${where}
      `,
      params,
    );

    // ─── Orders List ──────────────────────────────────────────────────────────
    const [orders] = await db.query(
      `
      SELECT
        o.*,

        ua.first_name AS billing_first_name,
        ua.last_name AS billing_last_name,
        ua.phone AS billing_phone,

        MAX(CASE WHEN om.meta_key = '_billing_email'
          THEN om.meta_value END) AS billing_email,

        MAX(CASE WHEN om.meta_key = '_order_total'
          THEN om.meta_value END) AS order_total,

        MAX(CASE WHEN om.meta_key = '_payment_method_title'
          THEN om.meta_value END) AS payment_method,

        MAX(CASE WHEN om.meta_key = '_customer_user'
          THEN om.meta_value END) AS customer_user_id

      FROM tbl_orders o

      LEFT JOIN tbl_user_address ua
        ON ua.order_id = o.order_id
       AND ua.address_billing = 'yes'

      LEFT JOIN tbl_ordermeta om
        ON om.order_id = o.order_id

      ${where}

      GROUP BY o.order_id

      ORDER BY o.order_date DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    res.render("orders/index", {
      title: "Orders",
      orders,
      statusBadge,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      status,
      search,
      success: req.query.success || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error("showOrders error:", err.message);
    res.status(500).send("Server Error: " + err.message);
  }
};

// const showOrders = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 20;
//     const offset = (page - 1) * limit;
//     const status = req.query.status || "";
//     const search = req.query.search || "";

//     let where = "WHERE o.order_type = 'shop_order' AND o.parent_id = 0";
//     const params = [];

//     if (status) {
//       where += " AND o.order_status = ?";
//       params.push(status);
//     }
//     if (search) {
//       where += " AND (o.order_title LIKE ? OR o.order_name LIKE ?)";
//       params.push("%" + search + "%", "%" + search + "%");
//     }

//     const [[{ total }]] = await db.query(
//       `SELECT COUNT(*) AS total FROM tbl_orders o ${where}`,
//       params,
//     );

//     const [orders] = await db.query(
//       `SELECT o.*,
//           MAX(CASE WHEN om.meta_key = '_billing_first_name'   THEN om.meta_value END) AS billing_first_name,
//           MAX(CASE WHEN om.meta_key = '_billing_last_name'    THEN om.meta_value END) AS billing_last_name,
//           MAX(CASE WHEN om.meta_key = '_billing_email'        THEN om.meta_value END) AS billing_email,
//           MAX(CASE WHEN om.meta_key = '_billing_phone'        THEN om.meta_value END) AS billing_phone,
//           MAX(CASE WHEN om.meta_key = '_order_total'          THEN om.meta_value END) AS order_total,
//           MAX(CASE WHEN om.meta_key = '_payment_method_title' THEN om.meta_value END) AS payment_method,
//           MAX(CASE WHEN om.meta_key = '_customer_user'        THEN om.meta_value END) AS customer_user_id
//        FROM tbl_orders o
//        LEFT JOIN tbl_ordermeta om ON om.order_id = o.order_id
//        ${where}
//        GROUP BY o.order_id
//        ORDER BY o.order_date DESC
//        LIMIT ? OFFSET ?`,
//       [...params, limit, offset],
//     );

//     res.render("orders/index", {
//       title: "Orders",
//       orders,
//       statusBadge,
//       total,
//       page,
//       limit,
//       totalPages: Math.ceil(total / limit),
//       status,
//       search,
//       success: req.query.success || null,
//       error: req.query.error || null,
//     });
//   } catch (err) {
//     console.error("showOrders error:", err.message);
//     res.status(500).send("Server Error: " + err.message);
//   }
// };

// ─── SHOW ORDER DETAIL ────────────────────────────────────────────────────────
// const showOrder = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const [[order]] = await db.query(
//       "SELECT * FROM tbl_orders WHERE order_id = ?",
//       [id],
//     );
//     if (!order) {
//       return res.redirect("/admin/orders?error=Order not found");
//     }

//     const meta = await getOrderMeta(id);

//     order.meta = meta;
//     order.billing_first_name = meta["_billing_first_name"] || "";
//     order.billing_last_name = meta["_billing_last_name"] || "";
//     order.billing_email = meta["_billing_email"] || "";
//     order.billing_phone = meta["_billing_phone"] || "";
//     order.billing_address_1 = meta["_billing_address_1"] || "";
//     order.billing_address_2 = meta["_billing_address_2"] || "";
//     order.billing_city = meta["_billing_city"] || "";
//     order.billing_state = meta["_billing_state"] || "";
//     order.billing_postcode = meta["_billing_postcode"] || "";
//     order.billing_country = meta["_billing_country"] || "";
//     order.payment_method =
//       meta["_payment_method_title"] || meta["_payment_method"] || "";
//     order.order_total = meta["_order_total"] || "0.00";
//     order.order_subtotal = meta["_order_subtotal"] || "";
//     order.order_shipping = meta["_order_shipping"] || "0.00";
//     order.order_tax = meta["_order_tax"] || "0.00";
//     order.order_discount = meta["_discount_total"] || "0.00";
//     order.customer_note = meta["customer_note"] || "";
//     order.customer_user_id = meta["_customer_user"] || "";
//     order.order_key = meta["_order_key"] || "";

//     order.shipping_first_name =
//       meta["_shipping_first_name"] || order.billing_first_name;
//     order.shipping_last_name =
//       meta["_shipping_last_name"] || order.billing_last_name;
//     order.shipping_address_1 =
//       meta["_shipping_address_1"] || order.billing_address_1;
//     order.shipping_address_2 =
//       meta["_shipping_address_2"] || order.billing_address_2;
//     order.shipping_city = meta["_shipping_city"] || order.billing_city;
//     order.shipping_state = meta["_shipping_state"] || order.billing_state;
//     order.shipping_postcode =
//       meta["_shipping_postcode"] || order.billing_postcode;
//     order.shipping_country = meta["_shipping_country"] || order.billing_country;

//     const allItems = await getOrderItems(id);
//     order.line_items = allItems.filter(
//       (i) => i.order_item_type === "line_item",
//     );
//     order.shipping_items = allItems.filter(
//       (i) => i.order_item_type === "shipping",
//     );
//     order.fee_items = allItems.filter((i) => i.order_item_type === "fee");

//     for (const item of order.line_items) {
//       const productId = item.meta["_product_id"] || item.product_id || 0;
//       item.thumbnail = "";
//       if (productId) {
//         const [[thumbMeta]] = await db.query(
//           `SELECT mm.meta_value AS file_path
//            FROM tbl_productmeta pm
//            JOIN tbl_media m ON m.media_id = pm.meta_value AND m.parent_id = ?
//            JOIN tbl_mediameta mm ON mm.media_id = m.media_id AND mm.meta_key = '_wp_attached_file'
//            WHERE pm.product_id = ? AND pm.meta_key = '_thumbnail_id'
//            LIMIT 1`,
//           [productId, productId],
//         );
//         if (thumbMeta) item.thumbnail = "/uploads/" + thumbMeta.file_path;
//       }
//       item.attributes = [];
//       Object.entries(item.meta).forEach(([key, val]) => {
//         if (key.startsWith("pa_") && val) {
//           const label = key.replace("pa_", "");
//           item.attributes.push(
//             label.charAt(0).toUpperCase() + label.slice(1) + ": " + val,
//           );
//         }
//       });
//     }

//     const [refunds] = await db.query(
//       "SELECT * FROM tbl_orders WHERE parent_id = ? AND order_type = 'shop_order_refund' ORDER BY order_date DESC",
//       [id],
//     );

//     let customer = null;
//     if (order.customer_user_id && order.customer_user_id !== "0") {
//       const [[cu]] = await db.query(
//         "SELECT ID, user_login, user_email, display_name FROM tbl_users WHERE ID = ?",
//         [order.customer_user_id],
//       );
//       customer = cu || null;
//     }

//     const statuses = Object.entries(statusBadge).map(([value, info]) => ({
//       value,
//       label: info.label,
//       class: info.class,
//     }));

//     res.render("orders/show", {
//       title: "Order #" + id,
//       order,
//       refunds,
//       customer,
//       statuses,
//       statusBadge,
//       success: req.query.success || null,
//       error: req.query.error || null,
//     });
//   } catch (err) {
//     console.error("showOrder error:", err.message);
//     res.status(500).send("Server Error: " + err.message);
//   }
// };

// ─── SHOW ORDER DETAIL ────────────────────────────────────────────────────────
const showOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const [[order]] = await db.query(
      "SELECT * FROM tbl_orders WHERE order_id = ?",
      [id],
    );

    if (!order) {
      return res.redirect("/admin/orders?error=Order not found");
    }

    // ─── Order Meta ───────────────────────────────────────────────────────────
    const meta = await getOrderMeta(id);
    order.meta = meta;

    order.payment_method =
      meta["_payment_method_title"] || meta["_payment_method"] || "";

    order.order_total = meta["_order_total"] || "0.00";
    order.order_subtotal = meta["_order_subtotal"] || "0.00";
    order.order_shipping = meta["_order_shipping"] || "0.00";
    order.order_tax = meta["_order_tax"] || "0.00";
    order.order_discount = meta["_discount_total"] || "0.00";
    order.customer_note = meta["customer_note"] || "";
    order.customer_user_id = meta["_customer_user"] || "";
    order.order_key = meta["_order_key"] || "";

    // ─── Load Addresses from tbl_user_address ────────────────────────────────
    const [addresses] = await db.query(
      `SELECT *
       FROM tbl_user_address
       WHERE order_id = ?
       ORDER BY address_id ASC`,
      [id],
    );

    const billingAddress = addresses.find((a) => a.address_billing === "yes");

    const shippingAddress = addresses.find((a) => a.address_billing === "no");

    // Billing
    order.billing_first_name = billingAddress?.first_name || "";
    order.billing_last_name = billingAddress?.last_name || "";
    order.billing_phone = billingAddress?.phone || "";
    order.billing_address_1 = billingAddress?.address_line1 || "";
    order.billing_address_2 = billingAddress?.address_line2 || "";
    order.billing_city = billingAddress?.city || "";
    order.billing_state = billingAddress?.state_name || "";
    order.billing_postcode = billingAddress?.zipcode || "";
    order.billing_country = meta["_billing_country"] || "";

    // Shipping
    order.shipping_first_name =
      shippingAddress?.first_name || order.billing_first_name;

    order.shipping_last_name =
      shippingAddress?.last_name || order.billing_last_name;

    order.shipping_phone = shippingAddress?.phone || order.billing_phone;

    order.shipping_address_1 =
      shippingAddress?.address_line1 || order.billing_address_1;

    order.shipping_address_2 =
      shippingAddress?.address_line2 || order.billing_address_2;

    order.shipping_city = shippingAddress?.city || order.billing_city;

    order.shipping_state = shippingAddress?.state_name || order.billing_state;

    order.shipping_postcode =
      shippingAddress?.zipcode || order.billing_postcode;

    order.shipping_country = meta["_shipping_country"] || order.billing_country;

    // Email remains in meta
    order.billing_email = meta["_billing_email"] || "";

    // ─── Order Items ──────────────────────────────────────────────────────────
    const allItems = await getOrderItems(id);

    order.line_items = allItems.filter(
      (i) => i.order_item_type === "line_item",
    );

    order.shipping_items = allItems.filter(
      (i) => i.order_item_type === "shipping",
    );

    order.fee_items = allItems.filter((i) => i.order_item_type === "fee");

    for (const item of order.line_items) {
      const productId = item.meta["_product_id"] || item.product_id || 0;

      item.thumbnail = "";

      if (productId) {
        const [[thumbMeta]] = await db.query(
          `SELECT media_path AS file_path FROM tbl_media WHERE parent_id = 3 LIMIT 1`,
          [productId],
        );

        if (thumbMeta?.file_path) {
          item.thumbnail = thumbMeta.file_path;
        }
      }

      item.attributes = [];

      Object.entries(item.meta).forEach(([key, val]) => {
        if (key.startsWith("pa_") && val) {
          const label = key.replace("pa_", "");

          item.attributes.push(
            label.charAt(0).toUpperCase() + label.slice(1) + ": " + val,
          );
        }
      });
    }

    // ─── Refunds ──────────────────────────────────────────────────────────────
    const [refunds] = await db.query(
      `SELECT *
       FROM tbl_orders
       WHERE parent_id = ?
         AND order_type = 'shop_order_refund'
       ORDER BY order_date DESC`,
      [id],
    );

    // ─── Customer ─────────────────────────────────────────────────────────────
    let customer = null;

    if (order.customer_user_id && order.customer_user_id !== "0") {
      const [[cu]] = await db.query(
        `SELECT ID, user_login, user_email, display_name
         FROM tbl_users
         WHERE ID = ?`,
        [order.customer_user_id],
      );

      customer = cu || null;
    }

    const statuses = Object.entries(statusBadge).map(([value, info]) => ({
      value,
      label: info.label,
      class: info.class,
    }));

    res.render("orders/show", {
      title: "Order #" + id,
      order,
      refunds,
      customer,
      statuses,
      statusBadge,
      success: req.query.success || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error("showOrder error:", err.message);
    res.status(500).send("Server Error: " + err.message);
  }
};

// ─── UPDATE ORDER STATUS ──────────────────────────────────────────────────────
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await db.query(
      "UPDATE tbl_orders SET order_status = ?, order_modified = NOW() WHERE order_id = ?",
      [status, id],
    );
    res.redirect(`/admin/orders/${id}?success=Status updated`);
  } catch (err) {
    console.error("updateOrderStatus error:", err.message);
    res.redirect(
      `/admin/orders/${req.params.id}?error=` +
        encodeURIComponent(err.message),
    );
  }
};

// ─── DELETE ORDER ─────────────────────────────────────────────────────────────
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const [items] = await db.query(
      "SELECT order_item_id FROM tbl_order_items WHERE order_id = ?",
      [id],
    );
    for (const item of items) {
      await db.query("DELETE FROM tbl_order_itemmeta WHERE order_item_id = ?", [
        item.order_item_id,
      ]);
    }
    await db.query("DELETE FROM tbl_order_items WHERE order_id = ?", [id]);
    await db.query("DELETE FROM tbl_ordermeta WHERE order_id = ?", [id]);
    await db.query("DELETE FROM tbl_orders WHERE order_id = ?", [id]);
    res.redirect("/admin/orders?success=Order deleted successfully");
  } catch (err) {
    console.error("deleteOrder error:", err.message);
    res.redirect(
      "/admin/orders?error=" + encodeURIComponent(err.message),
    );
  }
};

// ─── SHOW ADD ORDER FORM ──────────────────────────────────────────────────────
const showAddOrder = async (req, res) => {
  try {
    const [customers] = await db.query(
      `SELECT u.ID, u.user_login, u.user_email, u.display_name,
              MAX(CASE WHEN um.meta_key = 'first_name'        THEN um.meta_value END) AS first_name,
              MAX(CASE WHEN um.meta_key = 'last_name'         THEN um.meta_value END) AS last_name,
              MAX(CASE WHEN um.meta_key = 'phone'             THEN um.meta_value END) AS phone,
              MAX(CASE WHEN um.meta_key = 'billing_address_1' THEN um.meta_value END) AS billing_address_1,
              MAX(CASE WHEN um.meta_key = 'billing_address_2' THEN um.meta_value END) AS billing_address_2,
              MAX(CASE WHEN um.meta_key = 'billing_city'      THEN um.meta_value END) AS billing_city,
              MAX(CASE WHEN um.meta_key = 'billing_state'     THEN um.meta_value END) AS billing_state,
              MAX(CASE WHEN um.meta_key = 'billing_postcode'  THEN um.meta_value END) AS billing_postcode,
              MAX(CASE WHEN um.meta_key = 'billing_country'   THEN um.meta_value END) AS billing_country,
              MAX(CASE WHEN um.meta_key = 'billing_phone'      THEN um.meta_value END) AS billing_phone,
              MAX(CASE WHEN um.meta_key = 'shipping_address_1' THEN um.meta_value END) AS shipping_address_1,
              MAX(CASE WHEN um.meta_key = 'shipping_address_2' THEN um.meta_value END) AS shipping_address_2,
              MAX(CASE WHEN um.meta_key = 'shipping_city'      THEN um.meta_value END) AS shipping_city,
              MAX(CASE WHEN um.meta_key = 'shipping_state'     THEN um.meta_value END) AS shipping_state,
              MAX(CASE WHEN um.meta_key = 'shipping_postcode'  THEN um.meta_value END) AS shipping_postcode,
              MAX(CASE WHEN um.meta_key = 'shipping_country'   THEN um.meta_value END) AS shipping_country,
              MAX(CASE WHEN um.meta_key = 'shipping_phone'     THEN um.meta_value END) AS shipping_phone
       FROM tbl_users u
       LEFT JOIN tbl_usermeta um ON um.user_id = u.ID
       WHERE u.user_type = 3
       GROUP BY u.ID
       ORDER BY u.display_name ASC`,
    );

    const [products] = await db.query(
      `SELECT p.ID, p.product_title, p.product_type,
              MAX(CASE WHEN pm.meta_key = '_price' THEN pm.meta_value END) AS price,
              MAX(CASE WHEN pm.meta_key = '_sku'   THEN pm.meta_value END) AS sku
       FROM tbl_products p
       LEFT JOIN tbl_productmeta pm ON pm.product_id = p.ID
       WHERE p.product_status = 'publish' AND p.parent_id = 0
       GROUP BY p.ID
       ORDER BY p.product_title ASC`,
    );

    res.render("orders/add", {
      title: "Add Order",
      customers,
      products,
      errors: req.query.error || null,
    });
  } catch (err) {
    console.error("showAddOrder error:", err.message);
    res.status(500).send("Server Error: " + err.message);
  }
};

// ─── GET PRODUCT VARIATIONS (AJAX) ───────────────────────────────────────────
const getProductVariations = async (req, res) => {
  try {
    const { id } = req.params;
    const [variations] = await db.query(
      `SELECT p.ID, p.product_title,
              MAX(CASE WHEN pm.meta_key = '_price'         THEN pm.meta_value END) AS price,
              MAX(CASE WHEN pm.meta_key = '_regular_price' THEN pm.meta_value END) AS regular_price,
              MAX(CASE WHEN pm.meta_key = '_sku'           THEN pm.meta_value END) AS sku,
              MAX(CASE WHEN pm.meta_key = '_stock_status'  THEN pm.meta_value END) AS stock_status
       FROM tbl_products p
       LEFT JOIN tbl_productmeta pm ON pm.product_id = p.ID
       WHERE p.parent_id = ? AND p.product_type = 'product_variation'
       GROUP BY p.ID
       ORDER BY p.menu_order ASC`,
      [id],
    );
    for (const v of variations) {
      const [attrRows] = await db.query(
        "SELECT meta_key, meta_value FROM tbl_productmeta WHERE product_id = ? AND meta_key LIKE 'attribute_pa_%'",
        [v.ID],
      );
      v.attributes = {};
      attrRows.forEach((r) => {
        v.attributes[r.meta_key.replace("attribute_pa_", "")] = r.meta_value;
      });
      v.label =
        Object.values(v.attributes)
          .map((val) => val.charAt(0).toUpperCase() + val.slice(1))
          .join(" / ") || v.product_title;
    }
    res.json(variations);
  } catch (err) {
    res.json({ error: err.message });
  }
};

// ─── insert function for store billing and sgipping address ───────────────────────────────────────────
async function insertOrderAddress(
  conn,
  { userId, orderId, address, isBilling, notes = null },
) {
  const createdAt = new Date().toISOString().slice(0, 19).replace("T", " ");

  await conn.query(
    `INSERT INTO tbl_user_address
     (
       user_id, order_id, address_type, address_primary,
       first_name, last_name, phone,
       address_line1, address_line2, city, zipcode, state_name,
       city_id, state_id, country_id, address_notes,
       address_billing, latitude, longitude,
       created_at, updated_at, update_done
     )
     VALUES
     (
       ?, ?, 'general', 'no',
       ?, ?, ?,
       ?, ?, ?, ?, ?,
       0, NULL, 226, ?,
       ?, '', '',
       ?, ?, 'no'
     )`,
    [
      userId || null,
      orderId,

      address.first_name || "",
      address.last_name || "",
      address.phone || "",

      address.address_1 || "",
      address.address_2 || "",
      address.city || "",
      address.postcode || "",
      address.state || "",

      notes,
      isBilling ? "yes" : "no",

      createdAt,
      createdAt,
    ],
  );
}

// ─── STORE ORDER ──────────────────────────────────────────────────────────────
const storeOrder = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const body = req.body;
    const itemProductIds = [].concat(body.item_product_id || []);
    const itemNames = [].concat(body.item_name || []);
    const itemQtys = [].concat(body.item_qty || []);
    const itemPrices = [].concat(body.item_price || []);
    const itemVariationIds = [].concat(body.item_variation_id || []);

    let subtotal = 0;
    for (let i = 0; i < itemProductIds.length; i++) {
      subtotal += parseInt(itemQtys[i] || 1) * parseFloat(itemPrices[i] || 0);
    }
    const shippingCost = parseFloat(body.shipping_cost || 0);
    const discount = parseFloat(body.discount_total || 0);
    const orderTotal = subtotal + shippingCost - discount;

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const datePart =
      now.getFullYear() +
      "-" +
      months[now.getMonth()] +
      "-" +
      pad(now.getDate());
    const timePart =
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      "-" +
      (now.getHours() < 12 ? "am" : "pm");
    const orderName = `order-${datePart}-${timePart}`;
    const orderTitle = `Order &ndash; ${now.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" })} @ ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    const orderKey = "wc_order_" + Math.random().toString(36).substr(2, 15);

    const [orderResult] = await conn.query(
      `INSERT INTO tbl_orders
         (parent_id, user_id, order_name, order_title, order_content,
          order_status, order_type, order_date, order_modified)
       VALUES (0, ?, ?, ?, '', ?, 'shop_order', NOW(), NOW())`,
      [
        body.customer_id || 0,
        orderName,
        orderTitle,
        body.order_status || "wc-pending",
      ],
    );
    const orderId = orderResult.insertId;

    const insertMeta = async (key, value) => {
      await conn.query(
        "INSERT INTO tbl_ordermeta (order_id, meta_key, meta_value) VALUES (?, ?, ?)",
        [orderId, key, value || ""],
      );
    };

    await insertMeta("_order_key", orderKey);
    await insertMeta("_customer_user", body.customer_id || "0");
    await insertMeta("_payment_method", body.payment_method || "cod");
    await insertMeta(
      "_payment_method_title",
      body.payment_method_title || "Cash on delivery",
    );
    await insertMeta("_order_total", orderTotal.toFixed(2));
    await insertMeta("_order_subtotal", subtotal.toFixed(2));
    await insertMeta("_order_shipping", shippingCost.toFixed(2));
    await insertMeta("_order_tax", "0");
    await insertMeta("_discount_total", discount.toFixed(2));
    await insertMeta("customer_note", body.customer_note || "");
    await insertMeta("_created_via", "admin");

    await insertMeta("_billing_email", body.billing_email || "");
    await insertMeta("_billing_country", body.billing_country || "");
    await insertMeta(
      "_shipping_country",
      body.shipping_country || body.billing_country || "",
    );

    // ─── SAVE BILLING + SHIPPING INTO tbl_user_address ───────────────────────
    const addressUserId = body.customer_id || null;

    // Billing row
    await insertOrderAddress(conn, {
      userId: addressUserId,
      orderId,
      isBilling: true,
      notes: body.customer_note || null,
      address: {
        first_name: body.billing_first_name,
        last_name: body.billing_last_name,
        phone: body.billing_phone,
        address_1: body.billing_address_1,
        address_2: body.billing_address_2,
        city: body.billing_city,
        postcode: body.billing_postcode,
        state: body.billing_state,
      },
    });

    // Shipping row
    await insertOrderAddress(conn, {
      userId: addressUserId,
      orderId,
      isBilling: false,
      notes: null,
      address: {
        first_name: body.shipping_first_name || body.billing_first_name,
        last_name: body.shipping_last_name || body.billing_last_name,
        phone: body.shipping_phone || body.billing_phone,
        address_1: body.shipping_address_1 || body.billing_address_1,
        address_2: body.shipping_address_2 || body.billing_address_2,
        city: body.shipping_city || body.billing_city,
        postcode: body.shipping_postcode || body.billing_postcode,
        state: body.shipping_state || body.billing_state,
      },
    });

    for (let i = 0; i < itemProductIds.length; i++) {
      const productId = itemProductIds[i];
      const variationId = itemVariationIds[i] || 0;
      const qty = parseInt(itemQtys[i] || 1);
      const price = parseFloat(itemPrices[i] || 0);
      const lineTotal = (qty * price).toFixed(2);

      const [itemResult] = await conn.query(
        "INSERT INTO tbl_order_items (order_item_name, order_item_type, order_id, product_id) VALUES (?, 'line_item', ?, ?)",
        [itemNames[i], orderId, productId],
      );
      const itemId = itemResult.insertId;

      const insertItemMeta = async (key, val) => {
        await conn.query(
          "INSERT INTO tbl_order_itemmeta (order_item_id, meta_key, meta_value) VALUES (?, ?, ?)",
          [itemId, key, val || ""],
        );
      };
      await insertItemMeta("_product_id", productId);
      await insertItemMeta("_variation_id", variationId);
      await insertItemMeta("_qty", qty);
      await insertItemMeta("_line_subtotal", lineTotal);
      await insertItemMeta("_line_total", lineTotal);
      await insertItemMeta("_line_subtotal_tax", "0");
      await insertItemMeta("_line_tax", "0");
      await insertItemMeta("_tax_class", "");
    }

    if (shippingCost > 0) {
      const [shipResult] = await conn.query(
        "INSERT INTO tbl_order_items (order_item_name, order_item_type, order_id, product_id) VALUES (?, 'shipping', ?, 0)",
        [body.shipping_method_title || "Standard Ground", orderId],
      );
      await conn.query(
        "INSERT INTO tbl_order_itemmeta (order_item_id, meta_key, meta_value) VALUES (?, 'cost', ?)",
        [shipResult.insertId, shippingCost.toFixed(2)],
      );
    }

    await conn.commit();
    res.redirect(
      `/admin/orders/${orderId}?success=Order created successfully`,
    );
  } catch (err) {
    await conn.rollback();
    console.error("storeOrder error:", err.message, err.stack);
    res.redirect(
      "/admin/orders/add?error=" + encodeURIComponent(err.message),
    );
  } finally {
    conn.release();
  }
};

module.exports = {
  showOrders,
  showOrder,
  updateOrderStatus,
  deleteOrder,
  showAddOrder,
  getProductVariations,
  storeOrder,
};
