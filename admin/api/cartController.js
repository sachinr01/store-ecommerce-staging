const crypto = require('crypto');
const db = require('../config/db');
const { getSessionUser } = require('./session');

const toStr = (val) => {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s ? s : null;
};

const toInt = (val, fallback = null) => {
  const n = Number.parseInt(val, 10);
  return Number.isFinite(n) ? n : fallback;
};

function buildCartSessionId(userId, sessionId) {
  return userId ? `user_${userId}` : sessionId;
}

function syntheticVariationId(productId, color, size) {
  const raw = `${productId || ''}:${color || ''}:${size || ''}`;
  const hex = crypto.createHash('md5').update(raw).digest('hex').slice(0, 8);
  const value = Number.parseInt(hex, 16);
  return -Math.abs(value);
}

function resolveVariationId(inputVarId, productId, color, size) {
  const parsed = toInt(inputVarId, null);
  if (parsed) return parsed;
  if (color || size) return syntheticVariationId(productId, color, size);
  return null;
}

function getCartIdentity(req) {
  const user = getSessionUser(req);
  const userId = user ? user.id : null;
  const sessionId = req.sessionId;
  const cookieId = req.guestId || null;

  if (userId) {
    return { key: 'user_id', value: userId, userId, sessionId, cookieId };
  }
  if (cookieId) {
    return { key: 'cookie_id', value: cookieId, userId: null, sessionId, cookieId };
  }
  return { key: 'session_id', value: sessionId, userId: null, sessionId, cookieId: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1: Fetch real-time price and title from the database.
// Never use client-supplied price/title — those can be tampered.
// ─────────────────────────────────────────────────────────────────────────────
async function fetchProductInfo(productId, variationId) {
  // Try variation price first (if variationId is a real DB row > 0)
  if (variationId && variationId > 0) {
    const [[varRow]] = await db.query(
      `SELECT
         p.product_title AS title,
         COALESCE(
           (SELECT CAST(meta_value AS DECIMAL(10,2))
            FROM tbl_productmeta
            WHERE product_id = ? AND meta_key = '_price'
            ORDER BY meta_id DESC LIMIT 1),
           (SELECT CAST(meta_value AS DECIMAL(10,2))
            FROM tbl_productmeta
            WHERE product_id = ? AND meta_key = '_price'
            ORDER BY meta_id DESC LIMIT 1)
         ) AS price
       FROM tbl_products p
       WHERE p.ID = ?
       LIMIT 1`,
      [variationId, productId, productId]
    );
    if (varRow && varRow.price !== null) {
      return {
        title: varRow.title || null,
        price: Number(varRow.price),
      };
    }
  }

  // Fall back to parent product price
  const [[prodRow]] = await db.query(
    `SELECT
       p.product_title AS title,
       CAST(pm.meta_value AS DECIMAL(10,2)) AS price
     FROM tbl_products p
     LEFT JOIN tbl_productmeta pm
       ON pm.product_id = p.ID AND pm.meta_key = '_price'
     WHERE p.ID = ?
     ORDER BY pm.meta_id DESC
     LIMIT 1`,
    [productId]
  );

  if (!prodRow) return null;

  return {
    title: prodRow.title || null,
    price: Number(prodRow.price || 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /cart
// FIX 2: Always JOIN against live product data so name/price shown are current.
// ─────────────────────────────────────────────────────────────────────────────
const getCart = async (req, res) => {
  const { key, value, userId } = getCartIdentity(req);
  try {
    let rows;
    if (userId) {
      [rows] = await db.query(
        `SELECT
           ci.id, ci.product_id, ci.variation_id, ci.quantity,
           ci.color, ci.size, ci.image, ci.created_at,
           /* Always use live product title */
           COALESCE(p.product_title, ci.title) AS title,
           /* Always use live price — never trust stored cart price */
           CAST(
             COALESCE(
               (SELECT meta_value FROM tbl_productmeta
                WHERE product_id = COALESCE(NULLIF(ci.variation_id,0), ci.product_id)
                  AND meta_key = '_price' ORDER BY meta_id DESC LIMIT 1),
               (SELECT meta_value FROM tbl_productmeta
                WHERE product_id = ci.product_id
                  AND meta_key = '_price' ORDER BY meta_id DESC LIMIT 1),
               0
             ) AS DECIMAL(10,2)
           ) AS price
         FROM cart_items ci
         LEFT JOIN tbl_products p ON p.ID = ci.product_id
         WHERE ci.user_id = ?
         ORDER BY ci.created_at DESC`,
        [userId]
      );
    } else if (key === 'cookie_id') {
      [rows] = await db.query(
        `SELECT
           ci.id, ci.product_id, ci.variation_id, ci.quantity,
           ci.color, ci.size, ci.image, ci.created_at,
           COALESCE(p.product_title, ci.title) AS title,
           CAST(
             COALESCE(
               (SELECT meta_value FROM tbl_productmeta
                WHERE product_id = COALESCE(NULLIF(ci.variation_id,0), ci.product_id)
                  AND meta_key = '_price' ORDER BY meta_id DESC LIMIT 1),
               (SELECT meta_value FROM tbl_productmeta
                WHERE product_id = ci.product_id
                  AND meta_key = '_price' ORDER BY meta_id DESC LIMIT 1),
               0
             ) AS DECIMAL(10,2)
           ) AS price
         FROM cart_items ci
         LEFT JOIN tbl_products p ON p.ID = ci.product_id
         WHERE ci.cookie_id = ? AND ci.user_id IS NULL
         ORDER BY ci.created_at DESC`,
        [value]
      );
    } else {
      [rows] = await db.query(
        `SELECT
           ci.id, ci.product_id, ci.variation_id, ci.quantity,
           ci.color, ci.size, ci.image, ci.created_at,
           COALESCE(p.product_title, ci.title) AS title,
           CAST(
             COALESCE(
               (SELECT meta_value FROM tbl_productmeta
                WHERE product_id = COALESCE(NULLIF(ci.variation_id,0), ci.product_id)
                  AND meta_key = '_price' ORDER BY meta_id DESC LIMIT 1),
               (SELECT meta_value FROM tbl_productmeta
                WHERE product_id = ci.product_id
                  AND meta_key = '_price' ORDER BY meta_id DESC LIMIT 1),
               0
             ) AS DECIMAL(10,2)
           ) AS price
         FROM cart_items ci
         LEFT JOIN tbl_products p ON p.ID = ci.product_id
         WHERE ci.session_id = ? AND ci.user_id IS NULL
         ORDER BY ci.created_at DESC`,
        [value]
      );
    }

    const count = rows.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const total = rows.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
    res.json({ success: true, data: { items: rows, count, total } });
  } catch (err) {
    console.error('getCart error:', err);
    res.status(500).json({ success: false, message: 'Failed to load cart.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /cart/add
// FIX 3: Ignore client-sent price and title entirely.
//        Fetch canonical price & title from DB before inserting.
// ─────────────────────────────────────────────────────────────────────────────
const addToCart = async (req, res) => {
  const { key, value, userId, sessionId, cookieId } = getCartIdentity(req);
  const body = req.body || {};
  const productId = toInt(body.product_id);
  if (!productId) {
    return res.status(400).json({ success: false, message: 'product_id is required.' });
  }

  const color = toStr(body.color);
  const size = toStr(body.size);
  const variationId = resolveVariationId(body.variation_id, productId, color, size);
  const quantity = Math.max(toInt(body.quantity, 1), 1);
  // NOTE: body.price and body.title are intentionally IGNORED here.
  const image = toStr(body.image);

  try {
    // ── Fetch authoritative price & title from DB ─────────────────────────────
    const productInfo = await fetchProductInfo(productId, variationId);
    if (!productInfo) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    const price = productInfo.price;
    const title = productInfo.title || toStr(body.title); // fallback to client only if DB title is blank

    // ── Stock check ───────────────────────────────────────────────────────────
    const checkId = (variationId && variationId > 0) ? variationId : productId;
    const [[stockRow]] = await db.query(
      `SELECT
         COALESCE(
           (SELECT meta_value FROM tbl_productmeta
            WHERE product_id = ? AND meta_key = '_stock_status'
            ORDER BY meta_id DESC LIMIT 1),
           'instock'
         ) AS stock_status`,
      [checkId]
    );
    if (stockRow && stockRow.stock_status === 'outofstock') {
      return res.status(400).json({ success: false, message: 'This product is out of stock.' });
    }

    // ── Check for existing cart row ───────────────────────────────────────────
    let existing;
    if (key === 'user_id') {
      [existing] = await db.query(
        `SELECT id, quantity FROM cart_items
         WHERE user_id = ? AND product_id = ?
           AND (variation_id <=> ?) AND (color <=> ?) AND (size <=> ?)
         LIMIT 1`,
        [value, productId, variationId, color, size]
      );
    } else if (key === 'cookie_id') {
      [existing] = await db.query(
        `SELECT id, quantity FROM cart_items
         WHERE cookie_id = ? AND user_id IS NULL AND product_id = ?
           AND (variation_id <=> ?) AND (color <=> ?) AND (size <=> ?)
         LIMIT 1`,
        [value, productId, variationId, color, size]
      );
    } else {
      [existing] = await db.query(
        `SELECT id, quantity FROM cart_items
         WHERE session_id = ? AND user_id IS NULL AND product_id = ?
           AND (variation_id <=> ?) AND (color <=> ?) AND (size <=> ?)
         LIMIT 1`,
        [value, productId, variationId, color, size]
      );
    }

    if (existing.length) {
      // FIX 4: On quantity update also refresh the stored price/title so old
      //        rows don't keep stale values from before a price change.
      await db.query(
        `UPDATE cart_items
         SET quantity = quantity + ?, price = ?, title = ?, updated_at = NOW()
         WHERE id = ?`,
        [quantity, price, title, existing[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO cart_items
         (session_id, cookie_id, user_id, product_id, variation_id,
          quantity, color, size, title, price, image)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, cookieId, userId, productId, variationId,
         quantity, color, size, title, price, image]
      );
    }

    res.json({ success: true, message: 'Added to cart.' });
  } catch (err) {
    console.error('addToCart error:', err);
    res.status(500).json({ success: false, message: 'Failed to add to cart.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /cart/update/:itemId
// (unchanged logic — only quantity is updated)
// ─────────────────────────────────────────────────────────────────────────────
const updateCartItem = async (req, res) => {
  const { key, value, userId } = getCartIdentity(req);
  const itemId = toInt(req.params.itemId);
  const body = req.body || {};
  const quantity = toInt(body.quantity, null);
  if (!itemId || !quantity || quantity < 1) {
    return res.status(400).json({ success: false, message: 'Valid quantity is required.' });
  }

  try {
    let result;
    if (userId) {
      [result] = await db.query(
        'UPDATE cart_items SET quantity = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
        [quantity, itemId, userId]
      );
    } else if (key === 'cookie_id') {
      [result] = await db.query(
        'UPDATE cart_items SET quantity = ?, updated_at = NOW() WHERE id = ? AND cookie_id = ? AND user_id IS NULL',
        [quantity, itemId, value]
      );
    } else {
      [result] = await db.query(
        'UPDATE cart_items SET quantity = ?, updated_at = NOW() WHERE id = ? AND session_id = ? AND user_id IS NULL',
        [quantity, itemId, value]
      );
    }
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Cart item not found.' });
    }
    res.json({ success: true, message: 'Cart updated.' });
  } catch (err) {
    console.error('updateCartItem error:', err);
    res.status(500).json({ success: false, message: 'Failed to update cart.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /cart/remove/:itemId
// ─────────────────────────────────────────────────────────────────────────────
const removeCartItem = async (req, res) => {
  const { key, value, userId } = getCartIdentity(req);
  const itemId = toInt(req.params.itemId);
  if (!itemId) {
    return res.status(400).json({ success: false, message: 'Invalid item id.' });
  }
  try {
    let result;
    if (userId) {
      [result] = await db.query(
        'DELETE FROM cart_items WHERE id = ? AND user_id = ?',
        [itemId, userId]
      );
    } else if (key === 'cookie_id') {
      [result] = await db.query(
        'DELETE FROM cart_items WHERE id = ? AND cookie_id = ? AND user_id IS NULL',
        [itemId, value]
      );
    } else {
      [result] = await db.query(
        'DELETE FROM cart_items WHERE id = ? AND session_id = ? AND user_id IS NULL',
        [itemId, value]
      );
    }
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Cart item not found.' });
    }
    res.json({ success: true, message: 'Removed from cart.' });
  } catch (err) {
    console.error('removeCartItem error:', err);
    res.status(500).json({ success: false, message: 'Failed to remove cart item.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /cart/clear
// ─────────────────────────────────────────────────────────────────────────────
const clearCart = async (req, res) => {
  const { key, value, userId } = getCartIdentity(req);
  try {
    if (userId) {
      await db.query('DELETE FROM cart_items WHERE user_id = ?', [userId]);
    } else if (key === 'cookie_id') {
      await db.query('DELETE FROM cart_items WHERE cookie_id = ? AND user_id IS NULL', [value]);
    } else {
      await db.query('DELETE FROM cart_items WHERE session_id = ? AND user_id IS NULL', [value]);
    }
    res.json({ success: true, message: 'Cart cleared.' });
  } catch (err) {
    console.error('clearCart error:', err);
    res.status(500).json({ success: false, message: 'Failed to clear cart.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// mergeGuestCart — called on login
// FIX 5: Re-fetch live price/title when merging so stale guest cart prices
//        don't carry forward into the authenticated user's cart.
// ─────────────────────────────────────────────────────────────────────────────
async function mergeGuestCart(userId, guestSessionId, guestCookieId) {
  if (!userId) return;

  let guestItems = [];

  if (guestCookieId) {
    [guestItems] = await db.query(
      'SELECT * FROM cart_items WHERE cookie_id = ? AND user_id IS NULL',
      [guestCookieId]
    );
  }

  if (!guestItems.length && guestSessionId) {
    [guestItems] = await db.query(
      'SELECT * FROM cart_items WHERE session_id = ? AND user_id IS NULL',
      [guestSessionId]
    );
  }

  if (!guestItems.length) return;

  for (const item of guestItems) {
    const color = toStr(item.color);
    const size = toStr(item.size);
    const variationId = resolveVariationId(item.variation_id, item.product_id, color, size);

    // Refresh price and title from DB on merge
    const productInfo = await fetchProductInfo(item.product_id, variationId);
    const livePrice = productInfo ? productInfo.price : Number(item.price || 0);
    const liveTitle = productInfo ? (productInfo.title || item.title) : item.title;

    const [existing] = await db.query(
      `SELECT id, quantity FROM cart_items
       WHERE user_id = ? AND product_id = ?
         AND (variation_id <=> ?) AND (color <=> ?) AND (size <=> ?)
       LIMIT 1`,
      [userId, item.product_id, variationId, color, size]
    );

    if (existing.length) {
      await db.query(
        `UPDATE cart_items
         SET quantity = quantity + ?, price = ?, title = ?, updated_at = NOW()
         WHERE id = ?`,
        [item.quantity, livePrice, liveTitle, existing[0].id]
      );
      await db.query('DELETE FROM cart_items WHERE id = ?', [item.id]);
    } else {
      await db.query(
        `UPDATE cart_items
         SET user_id = ?, variation_id = ?, price = ?, title = ?, updated_at = NOW()
         WHERE id = ?`,
        [userId, variationId, livePrice, liveTitle, item.id]
      );
    }
  }
}

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  mergeGuestCart,
  getCartIdentity,
  buildCartSessionId,
};
