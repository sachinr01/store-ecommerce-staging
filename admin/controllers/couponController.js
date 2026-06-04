const db = require("../config/db");

// ── GET ALL COUPONS
exports.index = async (req, res) => {
  const { status } = req.query;
  let query = "SELECT * FROM tbl_coupons ORDER BY coupon_id DESC";
  let params = [];

  if (status) {
    query =
      "SELECT * FROM tbl_coupons WHERE coupon_status = ? ORDER BY coupon_id DESC";
    params = [status];
  }

  const [coupons] = await db.query(query, params);

  res.render("coupons/index", {
    title: "Coupons",
    coupons,
    statusFilter: status || null,
    admin: req.session.admin,
    success: req.query.success || null,
    error: req.query.error || null,
  });
};

// ── GET ADD FORM
exports.create = async (req, res) => {
  const [categories] = await db.query(
    "SELECT category_id, category_name FROM tbl_products_category ORDER BY category_name ASC",
  );
  const [products] = await db.query(`
  SELECT ID, product_title 
  FROM tbl_products 
  WHERE product_type = 'product' 
  ORDER BY product_title ASC
`);

  res.render("coupons/add", {
    title: "Add New Coupon",
    coupon: null,
    categories,
    products,
    admin: req.session.admin,
  });
};

// ── POST STORE
exports.store = async (req, res) => {
  const {
    coupon_code,
    coupon_name,
    coupon_details,
    coupon_status,
    coupon_type,
    coupon_amount,
    coupon_expiry_date,
    minimum_spend,
    maximum_spend,
    include_products,
    exclude_products,
    include_categories,
    exclude_categories,
    usage_limit_per_coupon,
    usage_limit_per_user,
    usage_limit_per_products,
  } = req.body;

  if (!coupon_code) {
    return res.redirect("/admin/coupons/add");
  }

  const now = new Date();

  await db.query(
    `INSERT INTO tbl_coupons
      (coupon_code, coupon_name, coupon_details, coupon_status,
       coupon_date, coupon_date_modified,
       coupon_type, coupon_amount, coupon_expiry_date,
       usage_limit_per_coupon, usage_limit_per_user, usage_limit_per_products,
       minimum_spend, maximum_spend,
       include_products, exclude_products,
       include_categories, exclude_categories,
       coupon_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      coupon_code.toLowerCase().trim(),
      coupon_name || "",
      coupon_details || "",
      coupon_status || "publish",
      now,
      now,
      coupon_type || "percent",
      parseFloat(coupon_amount) || 0,
      coupon_expiry_date || null,
      parseInt(usage_limit_per_coupon) || 0,
      parseInt(usage_limit_per_user) || 0,
      parseInt(usage_limit_per_products) || 0,
      parseFloat(minimum_spend) || 0,
      parseFloat(maximum_spend) || 0,
      Array.isArray(include_products)
        ? include_products.join(",")
        : include_products || "",
      Array.isArray(exclude_products)
        ? exclude_products.join(",")
        : exclude_products || "",
      Array.isArray(include_categories)
        ? include_categories.join(",")
        : include_categories || "",
      Array.isArray(exclude_categories)
        ? exclude_categories.join(",")
        : exclude_categories || "",
    ],
  );

  res.redirect("/admin/coupons?success=Coupon added successfully");
};

// ── GET EDIT FORM
exports.edit = async (req, res) => {
  const { id } = req.params;
  const [[coupon]] = await db.query(
    "SELECT * FROM tbl_coupons WHERE coupon_id = ?",
    [id],
  );

  if (!coupon) return res.redirect("/admin/coupons");

  const [categories] = await db.query(
    "SELECT category_id, category_name FROM tbl_products_category ORDER BY category_name ASC",
  );
  const [products] = await db.query(`
  SELECT ID, product_title 
  FROM tbl_products 
  WHERE product_type = 'product' 
  ORDER BY product_title ASC
`);

  res.render("coupons/add", {
    title: "Edit Coupon",
    coupon,
    categories,
    products,
    admin: req.session.admin,
  });
};

// ── POST UPDATE
exports.update = async (req, res) => {
  const { id } = req.params;
  const {
    coupon_code,
    coupon_name,
    coupon_details,
    coupon_status,
    coupon_type,
    coupon_amount,
    coupon_expiry_date,
    minimum_spend,
    maximum_spend,
    include_products,
    exclude_products,
    include_categories,
    exclude_categories,
    usage_limit_per_coupon,
    usage_limit_per_user,
    usage_limit_per_products,
  } = req.body;

  await db.query(
    `UPDATE tbl_coupons SET
      coupon_code               = ?,
      coupon_name               = ?,
      coupon_details            = ?,
      coupon_status             = ?,
      coupon_date_modified      = NOW(),
      coupon_type               = ?,
      coupon_amount             = ?,
      coupon_expiry_date        = ?,
      usage_limit_per_coupon    = ?,
      usage_limit_per_user      = ?,
      usage_limit_per_products  = ?,
      minimum_spend             = ?,
      maximum_spend             = ?,
      include_products          = ?,
      exclude_products          = ?,
      include_categories        = ?,
      exclude_categories        = ?
    WHERE coupon_id = ?`,
    [
      coupon_code.toLowerCase().trim(),
      coupon_name || "",
      coupon_details || "",
      coupon_status || "publish",
      coupon_type || "percent",
      parseFloat(coupon_amount) || 0,
      coupon_expiry_date || null,
      parseInt(usage_limit_per_coupon) || 0,
      parseInt(usage_limit_per_user) || 0,
      parseInt(usage_limit_per_products) || 0,
      parseFloat(minimum_spend) || 0,
      parseFloat(maximum_spend) || 0,
      Array.isArray(include_products)
        ? include_products.join(",")
        : include_products || "",
      Array.isArray(exclude_products)
        ? exclude_products.join(",")
        : exclude_products || "",
      Array.isArray(include_categories)
        ? include_categories.join(",")
        : include_categories || "",
      Array.isArray(exclude_categories)
        ? exclude_categories.join(",")
        : exclude_categories || "",
      id,
    ],
  );

  res.redirect("/admin/coupons?success=Coupon updated successfully");
};

// ── GET DELETE
exports.delete = async (req, res) => {
  const { id } = req.params;
  await db.query("DELETE FROM tbl_coupons WHERE coupon_id = ?", [id]);
  res.redirect("/admin/coupons?success=Coupon deleted successfully");
};
