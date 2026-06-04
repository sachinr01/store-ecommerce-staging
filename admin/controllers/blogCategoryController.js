const db = require("../config/db");

// GET ALL CATEGORIES
exports.index = async (req, res) => {
  // primari key is category_id
  const [rows] = await db.query(
    "SELECT * FROM tbl_posts_category ORDER BY category_id  DESC",
  );

  res.render("blogs/category", {
    title: "Categories",
    categories: rows,
    admin: req.session.admin,
    success: req.query.success || null,
    error: req.query.error || null,
  });
};

// ADD CATEGORY
exports.store = async (req, res) => {
  const { category_name, parent_id, category_desc } = req.body;

  await db.query(
    `INSERT INTO tbl_posts_category (category_name, parent_id, category_desc)
     VALUES (?, ?, ?)`,
    [category_name, parent_id || 0, category_desc || ""],
  );

  res.redirect(
    "/admin/blogs/categories?success=Category added successfully",
  );
};

// UPDATE CATEGORY
exports.update = async (req, res) => {
  const { id } = req.params;
  const { category_name, parent_id, category_desc } = req.body;

  await db.query(
    `UPDATE tbl_posts_category 
     SET category_name=?, parent_id=?, category_desc=? 
     WHERE category_id=?`,
    [category_name, parent_id || 0, category_desc || "", id],
  );

  res.redirect(
    "/admin/blogs/categories?success=Category updated successfully",
  );
};

// DELETE CATEGORY
exports.delete = async (req, res) => {
  const { id } = req.params;

  await db.query("DELETE FROM tbl_posts_category WHERE category_id=?", [id]);

  res.redirect(
    "/admin/blogs/categories?success=Category deleted successfully",
  );
};
