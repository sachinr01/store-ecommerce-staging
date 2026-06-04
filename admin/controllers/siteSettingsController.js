const db = require("../config/db");

// ── Helper: get all site options as object ────────────────────────────────────
const getOptions = async () => {
  const [rows] = await db.query(
    "SELECT option_name, option_value FROM tbl_site_options"
  );
  const opts = {};
  rows.forEach((r) => { opts[r.option_name] = r.option_value; });
  return opts;
};

// ── Helper: upsert a single option ───────────────────────────────────────────
const upsertOption = async (name, value) => {
  await db.query(
    `INSERT INTO tbl_site_options (option_name, option_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE option_value = VALUES(option_value)`,
    [name, value || ""]
  );
};

// ─── SHOW SETTINGS ────────────────────────────────────────────────────────────
const showSettings = async (req, res) => {
  try {
    const tab  = req.query.tab || "general";
    const opts = await getOptions();

    res.render("site-settings/index", {
      title:   "Site Settings",
      tab,
      opts,
      success: req.query.success || null,
      error:   req.query.error   || null,
    });
  } catch (err) {
    console.error("showSettings error:", err.message);
    res.status(500).send("Server Error: " + err.message);
  }
};

// ─── SAVE SETTINGS ────────────────────────────────────────────────────────────
const saveSettings = async (req, res) => {
  try {
    const tab  = req.query.tab || "general";
    const body = req.body;

    // Save every field from the form
    for (const [key, value] of Object.entries(body)) {
      await upsertOption(key, Array.isArray(value) ? value.join(",") : value);
    }

    res.redirect(
      `/admin/site-settings?tab=${tab}&success=Settings saved successfully`
    );
  } catch (err) {
    console.error("saveSettings error:", err.message);
    res.redirect(
      `/admin/site-settings?tab=${req.query.tab || "general"}&error=` +
        encodeURIComponent(err.message)
    );
  }
};

module.exports = { showSettings, saveSettings };