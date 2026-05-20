const db = require('../config/db');
const { getSessionUser } = require('./session');

const SYNC_MAX = 200; // max items accepted in a single sync call

// ── GET /wishlist ─────────────────────────────────────────────────────────────
const getWishlist = async (req, res) => {
  const user = getSessionUser(req);
  try {
    const [rows] = await db.query(
      'SELECT id, product_id, added_at FROM tbl_wishlist WHERE user_id = ? ORDER BY added_at DESC',
      [user.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[wishlist] getWishlist error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch wishlist.' });
  }
};

// ── POST /wishlist/add ────────────────────────────────────────────────────────
// Body: { product_id: number }
const addToWishlist = async (req, res) => {
  const user = getSessionUser(req);
  const body = req.body || {};                          // FIX: guard against undefined body
  const productId = parseInt(body.product_id, 10);

  if (!productId || isNaN(productId) || productId <= 0) {
    return res.status(400).json({ success: false, message: 'Valid product_id is required.' });
  }

  try {
    await db.query(
      'INSERT IGNORE INTO tbl_wishlist (user_id, product_id) VALUES (?, ?)',
      [user.id, productId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[wishlist] addToWishlist error:', err);
    res.status(500).json({ success: false, message: 'Failed to add to wishlist.' });
  }
};

// ── DELETE /wishlist/remove/:productId ────────────────────────────────────────
const removeFromWishlist = async (req, res) => {
  const user = getSessionUser(req);
  const productId = parseInt(req.params.productId, 10);

  if (!productId || isNaN(productId) || productId <= 0) {
    return res.status(400).json({ success: false, message: 'Valid product_id is required.' });
  }

  try {
    await db.query(
      'DELETE FROM tbl_wishlist WHERE user_id = ? AND product_id = ?',
      [user.id, productId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[wishlist] removeFromWishlist error:', err);
    res.status(500).json({ success: false, message: 'Failed to remove from wishlist.' });
  }
};

// ── POST /wishlist/sync ───────────────────────────────────────────────────────
// Bulk-inserts guest localStorage items into DB on login.
// Body: { product_ids: number[] }
const syncWishlist = async (req, res) => {
  const user = getSessionUser(req);
  const body = req.body || {};                          // FIX: guard against undefined body
  const ids = body.product_ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.json({ success: true });
  }

  const validIds = ids
    .slice(0, SYNC_MAX)                                // FIX: cap to prevent abuse
    .map(id => parseInt(id, 10))
    .filter(id => !isNaN(id) && id > 0);

  if (validIds.length === 0) {
    return res.json({ success: true });
  }

  try {
    const values = validIds.map(pid => [user.id, pid]);
    await db.query(
      'INSERT IGNORE INTO tbl_wishlist (user_id, product_id) VALUES ?',
      [values]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[wishlist] syncWishlist error:', err);
    res.status(500).json({ success: false, message: 'Failed to sync wishlist.' });
  }
};

module.exports = { getWishlist, addToWishlist, removeFromWishlist, syncWishlist };
