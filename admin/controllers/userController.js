const db = require("../config/db");
const bcrypt = require("bcrypt");

// ── Helper: upsert a single usermeta row ──────────────────────────────────────
const upsertMeta = async (userId, key, value) => {
  await db.query(
    `INSERT INTO tbl_usermeta (user_id, meta_key, meta_value)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
    [userId, key, value || ""],
  );
};

// ── Helper: collect all meta_ fields from req.body and save them ──────────────
// Form fields named  meta_first_name  →  meta key = first_name
const saveMeta = async (userId, body) => {
  const metaFields = [
    "first_name",
    "last_name",
    "phone",
    "dob",
    "gender",
    "description",
    // Billing address
    "billing_address_1",
    "billing_address_2",
    "billing_city",
    "billing_state",
    "billing_postcode",
    "billing_country",
    "billing_phone",
    // Shipping address
    "shipping_address_1",
    "shipping_address_2",
    "shipping_city",
    "shipping_state",
    "shipping_postcode",
    "shipping_country",
    "shipping_phone",
  ];

  for (const key of metaFields) {
    const formKey = "meta_" + key;
    if (body[formKey] !== undefined) {
      await upsertMeta(userId, key, body[formKey]);
    }
  }
};

// ─── LIST USERS ───────────────────────────────────────────────────────────────
const showUsers = async (req, res) => {
  try {
    const [users] = await db.query(
      `SELECT u.*, ut.user_type AS type_name
       FROM tbl_users u
       LEFT JOIN tbl_user_types ut ON ut.user_type_id = u.user_type
       ORDER BY u.ID DESC`,
    );

    res.render("users/index", {
      title: "Users",
      users,
      success: req.query.success || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error("showUsers error:", err.message);
    res.status(500).send("Server Error: " + err.message);
  }
};

// ─── SHOW ADD FORM ────────────────────────────────────────────────────────────
const showAddUser = async (req, res) => {
  try {
    const [userTypes] = await db.query(
      "SELECT * FROM tbl_user_types ORDER BY user_type_id ASC",
    );

    res.render("users/add", {
      title: "Add User",
      userTypes,
      user: null,
      isEdit: false,
      errors: req.query.error || null,
    });
  } catch (err) {
    console.error("showAddUser error:", err.message);
    res.status(500).send("Server Error: " + err.message);
  }
};

// ─── STORE USER ───────────────────────────────────────────────────────────────
const storeUser = async (req, res) => {
  try {
    const body = req.body;

    // Check duplicate login
    const [[existing]] = await db.query(
      "SELECT ID FROM tbl_users WHERE user_login = ?",
      [body.user_login],
    );
    if (existing) {
      return res.redirect(
        "/admin/users/add?error=" +
          encodeURIComponent("Username already exists"),
      );
    }

    // Hash password
    const hashedPass = await bcrypt.hash(body.user_pass, 10);

    // Insert user
    const [result] = await db.query(
      `INSERT INTO tbl_users
         (user_type, user_login, user_pass, user_nicename, user_email,
          user_url, user_registered, user_status, display_name)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [
        body.user_type || 1,
        body.user_login || body.user_email,
        hashedPass,
        body.user_nicename || body.user_login || body.user_email,
        body.user_email,
        body.user_url || "",
        body.user_status !== undefined ? body.user_status : 0,
        body.display_name || body.user_login,
      ],
    );
    const userId = result.insertId;

    // Save all meta fields
    await saveMeta(userId, body);

    res.redirect("/admin/users?success=User added successfully");
  } catch (err) {
    console.error("storeUser error:", err.message);
    res.redirect(
      "/admin/users/add?error=" + encodeURIComponent(err.message),
    );
  }
};

// ─── SHOW EDIT FORM ───────────────────────────────────────────────────────────
const showEditUser = async (req, res) => {
  try {
    const { id } = req.params;

    const [[user]] = await db.query("SELECT * FROM tbl_users WHERE ID = ?", [
      id,
    ]);
    if (!user) {
      return res.redirect("/admin/users?error=User not found");
    }

    const [userTypes] = await db.query(
      "SELECT * FROM tbl_user_types ORDER BY user_type_id ASC",
    );

    // Load all usermeta into user.meta object
    const [metaRows] = await db.query(
      "SELECT meta_key, meta_value FROM tbl_usermeta WHERE user_id = ?",
      [id],
    );
    user.meta = {};
    metaRows.forEach(function (row) {
      user.meta[row.meta_key] = row.meta_value;
    });

    res.render("users/add", {
      title: "Edit User",
      userTypes,
      user,
      isEdit: true,
      errors: req.query.error || null,
    });
  } catch (err) {
    console.error("showEditUser error:", err.message);
    res.status(500).send("Server Error: " + err.message);
  }
};

// ─── UPDATE USER ──────────────────────────────────────────────────────────────
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;

    if (body.user_pass && body.user_pass.trim() !== "") {
      // Update with new password
      const hashedPass = await bcrypt.hash(body.user_pass, 10);
      await db.query(
        `UPDATE tbl_users SET
           user_pass     = ?,
           user_email    = ?,
           display_name  = ?,
           user_nicename = ?,
           user_url      = ?,
           user_type     = ?,
           user_status   = ?
         WHERE ID = ?`,
        [
          hashedPass,
          body.user_email,
          body.display_name,
          body.user_nicename || body.user_login || body.user_email || "",
          body.user_url || "",
          body.user_type || 1,
          body.user_status !== undefined ? body.user_status : 0,
          id,
        ],
      );
    } else {
      // Update without touching password
      await db.query(
        `UPDATE tbl_users SET
     user_email    = ?,
     display_name  = ?,
     user_nicename = ?,
     user_url      = ?,
     user_type     = ?,
     user_status   = ?
   WHERE ID = ?`,
        [
          body.user_email || "",
          body.display_name || body.user_login || body.user_email || "",
          body.user_nicename || body.user_login || body.user_email || "",
          body.user_url || "",
          parseInt(body.user_type) || 1,
          body.user_status !== undefined ? parseInt(body.user_status) : 0,
          id,
        ],
      );
    }

    // Save / update all meta fields
    await saveMeta(id, body);

    res.redirect("/admin/users?success=User updated successfully");
  } catch (err) {
    console.error("updateUser error:", err.message);
    res.redirect(
      `/admin/users/edit/${req.params.id}?error=` +
        encodeURIComponent(err.message),
    );
  }
};

// ─── DELETE USER ──────────────────────────────────────────────────────────────
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (String(id) === String(req.session.admin.id)) {
      return res.redirect(
        "/admin/users?error=You cannot delete your own account",
      );
    }

    await db.query("DELETE FROM tbl_usermeta WHERE user_id = ?", [id]);
    await db.query("DELETE FROM tbl_users WHERE ID = ?", [id]);

    res.redirect("/admin/users?success=User deleted successfully");
  } catch (err) {
    console.error("deleteUser error:", err.message);
    res.redirect("/admin/users?error=" + encodeURIComponent(err.message));
  }
};

module.exports = {
  showUsers,
  showAddUser,
  storeUser,
  showEditUser,
  updateUser,
  deleteUser,
};
