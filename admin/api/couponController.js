const db = require('../config/db');

function parseIdList(str) {
  if (!str) return [];
  return String(str)
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}


async function readCartItems(req, conn) {
  const { getCartIdentity } = require('./cartController');
  const userId = req.sessionData?.user?.id || 0;
  const { key, value } = getCartIdentity(req);

  // Fetch cart rows — we need product_id, variation_id, quantity to look up live prices.
  // We intentionally do NOT use cart_items.price here: it is a stale snapshot that can be
  // tampered by the client (Burp Suite / DevTools) or become outdated after an admin price change.
  const livePriceSubquery = `
    CAST(
      COALESCE(
        (SELECT meta_value FROM tbl_productmeta
          WHERE product_id = COALESCE(NULLIF(ci.variation_id, 0), ci.product_id)
            AND meta_key = '_price'
          ORDER BY meta_id DESC LIMIT 1),
        (SELECT meta_value FROM tbl_productmeta
          WHERE product_id = ci.product_id
            AND meta_key = '_price'
          ORDER BY meta_id DESC LIMIT 1),
        0
      ) AS DECIMAL(10,2)
    ) AS price
  `;

  let rows = [];
  if (userId) {
    [rows] = await conn.query(
      `SELECT ci.product_id, ci.variation_id, ci.quantity, ${livePriceSubquery}
       FROM cart_items ci WHERE ci.user_id = ?`,
      [userId]
    );
  } else if (key === 'cookie_id' && value) {
    [rows] = await conn.query(
      `SELECT ci.product_id, ci.variation_id, ci.quantity, ${livePriceSubquery}
       FROM cart_items ci WHERE ci.cookie_id = ? AND ci.user_id IS NULL`,
      [value]
    );
  } else if (value) {
    [rows] = await conn.query(
      `SELECT ci.product_id, ci.variation_id, ci.quantity, ${livePriceSubquery}
       FROM cart_items ci WHERE ci.session_id = ? AND ci.user_id IS NULL`,
      [value]
    );
  }
  return rows || [];
}


async function validateCouponRules(coupon, userId, cartTotal, productIds, conn, cartItems) {
  // Guard: never allow a coupon to be applied to an empty cart
  if (!productIds || productIds.length === 0) {
    return { ok: false, status: 400, message: 'Add items to your cart before applying a coupon.' };
  }

  const query = conn.query.bind(conn);

  // ── 1. usage_limit_per_coupon ─────────────────────────────────────────────
  // NOTE: No FOR UPDATE here. This function is called both from apply/active
  // (uses the pool — autocommit, no open transaction) and from
  // validateAndLockCoupon (uses a real conn inside BEGIN).
  // FOR UPDATE on a SELECT COUNT(*) outside a transaction is a no-op:
  // MySQL releases the lock immediately under autocommit, protecting nothing.
  // The authoritative race-safe check happens in validateAndLockCoupon, which
  // runs inside the order transaction and locks tbl_coupons FOR UPDATE before
  // calling this function.
  if (coupon.usage_limit_per_coupon > 0) {
    const [[usageRow]] = await query(
      `SELECT COUNT(*) AS total_used
       FROM tbl_coupons_usage
       WHERE coupon_id = ? AND order_id > 0`,
      [coupon.coupon_id]
    );
    if (usageRow.total_used >= coupon.usage_limit_per_coupon) {
      return { ok: false, status: 400, message: 'Sorry, this coupon has been fully claimed and is no longer available.' };
    }
  }

  // ── 2. usage_limit_per_user ───────────────────────────────────────────────
  if (coupon.usage_limit_per_user > 0 && userId > 0) {
    const [[userUsage]] = await query(
      `SELECT COUNT(*) AS user_used
       FROM tbl_coupons_usage
       WHERE coupon_id = ? AND user_id = ? AND order_id > 0`,
      [coupon.coupon_id, userId]
    );
    if (userUsage.user_used >= coupon.usage_limit_per_user) {
      return { ok: false, status: 400, message: "You've already used this coupon the maximum number of times allowed per customer." };
    }
  }

  // ── 3. usage_limit_per_products ──────────────────────────────────────────────────────
  // Limits how many total product units across ALL orders can ever be discounted
  // by this coupon. Once that unit count is hit, the coupon is exhausted.
  //
  // Example: limit = 5 means only 5 units (across all customers, all orders)
  // will ever get a discount from this coupon.
  if (coupon.usage_limit_per_products > 0) {
    const [[productUsage]] = await query(
      `SELECT COALESCE(SUM(CAST(oim.meta_value AS UNSIGNED)), 0) AS total_units
       FROM tbl_coupons_usage cu
       JOIN tbl_order_items oi
         ON oi.order_id = cu.order_id AND oi.order_item_type = 'line_item'
       JOIN tbl_order_itemmeta oim
         ON oim.order_item_id = oi.order_item_id AND oim.meta_key = '_qty'
       WHERE cu.coupon_id = ? AND cu.order_id > 0`,
      [coupon.coupon_id]
    );
    if (Number(productUsage.total_units) >= coupon.usage_limit_per_products) {
      return {
        ok: false,
        status: 400,
        message: `This coupon has already been used on the maximum allowed number of product units (${coupon.usage_limit_per_products}). It is no longer available.`,
      };
    }
  }


  // ── 3 & 4. minimum_spend / maximum_spend ─────────────────────────────────

  const minSpend          = Number(coupon.minimum_spend)  || 0;
  const maxSpend          = Number(coupon.maximum_spend)  || 0;
  const includeProducts   = parseIdList(coupon.include_products);
  const excludeProducts   = parseIdList(coupon.exclude_products);
  const includeCategories = parseIdList(coupon.include_categories);
  const excludeCategories = parseIdList(coupon.exclude_categories);

  // Fetch category links once for all cart products (used in eligibility block)
  let productCatMap = {}; // product_id → [category_id, ...]
  if (productIds.length > 0 && (includeCategories.length > 0 || excludeCategories.length > 0)) {
    const ph = productIds.map(() => '?').join(',');
    const [catLinks] = await query(
      `SELECT product_id, category_id FROM tbl_products_category_link WHERE product_id IN (${ph})`,
      productIds
    );
    for (const row of catLinks) {
      if (!productCatMap[row.product_id]) productCatMap[row.product_id] = [];
      productCatMap[row.product_id].push(row.category_id);
    }
  }

  // ── 5. include_products — gate check ─────────────────────────────────────

  if (includeProducts.length > 0 && includeCategories.length === 0) {
    const hasMatch = productIds.some((pid) => includeProducts.includes(pid));
    if (!hasMatch) {
      return {
        ok: false,
        status: 400,
        message: 'This coupon only applies to specific products that are not in your cart. Add the required products to use this coupon.',
      };
    }
  }

  // ── 6–8. Unified per-product eligibility ─────────────────────────────────


  const hasAnyProductRule =
    includeProducts.length   > 0 ||
    excludeProducts.length   > 0 ||
    includeCategories.length > 0 ||
    excludeCategories.length > 0;

  let eligibleSubtotal = cartTotal;   // default: full cart eligible when no rules set
  let eligibleProductIds = productIds; // default: all products eligible when no rules set

  if (hasAnyProductRule) {
    // cartItems is required for accurate subtotal calculation
    if (!cartItems || cartItems.length === 0) {
      return {
        ok: false,
        status: 400,
        message: 'We could not verify your cart. Please refresh the page and try again.',
      };
    }

    eligibleProductIds = productIds.filter((pid) => {
      // (a) Explicitly included product → always eligible, skip all other checks
      if (includeProducts.length > 0 && includeProducts.includes(pid)) return true;

      // (b) Explicitly excluded product → not eligible
      if (excludeProducts.length > 0 && excludeProducts.includes(pid)) return false;

      const cats = productCatMap[pid] || [];

      // (c) Product's category is excluded → not eligible
      if (excludeCategories.length > 0 && cats.some((cid) => excludeCategories.includes(cid))) {
        return false;
      }

      // (d) include_categories is set → product must belong to one of them
      if (includeCategories.length > 0) {
        return cats.some((cid) => includeCategories.includes(cid));
      }

      
      if (includeProducts.length > 0) {
        return false;
      }

      // (f) No restrictions at all → eligible
      return true;
    });

    if (eligibleProductIds.length === 0) {
      return {
        ok: false,
        status: 400,
        message: 'None of the items in your cart are eligible for this coupon. It only applies to specific products or categories not currently in your cart.',
      };
    }

    // Compute eligible subtotal using actual item prices — never approximate
    eligibleSubtotal = cartItems
      .filter((item) => eligibleProductIds.includes(Number(item.product_id)))
      .reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  }


  if (minSpend > 0 && eligibleSubtotal < minSpend) {
    return {
      ok: false,
      status: 400,
      message: `Your eligible items total ₹${eligibleSubtotal.toFixed(2)}, but this coupon requires a minimum eligible spend of ₹${minSpend.toFixed(2)}. Add more eligible products to your cart to use this coupon.`,
    };
  }
  if (maxSpend > 0 && eligibleSubtotal > maxSpend) {
    return {
      ok: false,
      status: 400,
      message: `Your eligible items total ₹${eligibleSubtotal.toFixed(2)}, which exceeds the ₹${maxSpend.toFixed(2)} maximum for this coupon. Remove some eligible items to bring the total within the limit.`,
    };
  }

  // eligibleProductIds is already computed above inside the hasAnyProductRule block.
  // Reuse it directly — no need to re-run the filter logic a second time.
  return { ok: true, eligibleSubtotal, eligibleProductIds: hasAnyProductRule ? eligibleProductIds : productIds };
}


function calculateDiscount(coupon, cartTotal, eligibleSubtotal, cartItems, eligibleProductIds) {
  const base = (eligibleSubtotal !== undefined && eligibleSubtotal !== null)
    ? eligibleSubtotal
    : cartTotal;
  const amount = Number(coupon.coupon_amount) || 0;

  if (coupon.coupon_type === 'percent') {
    return Math.round((base * amount) / 100);
  }
  if (coupon.coupon_type === 'fixed_cart') {
    return Math.min(amount, base);
  }
  if (coupon.coupon_type === 'fixed_product') {
    // Deduct flat amount per eligible unit, capped at the eligible subtotal
    let totalUnits = 0;
    if (cartItems && eligibleProductIds && eligibleProductIds.length > 0) {
      for (const item of cartItems) {
        if (eligibleProductIds.includes(Number(item.product_id))) {
          totalUnits += Number(item.quantity || 0);
        }
      }
    }
    const perUnitDiscount = totalUnits > 0 ? amount * totalUnits : amount;
    return Math.min(perUnitDiscount, base);
  }
  return 0;
}

const COUPON_VALID_SQL = `
  coupon_status = 'publish'
  AND (coupon_expiry_date = '0000-00-00 00:00:00' OR coupon_expiry_date >= NOW())
`;

// ─────────────────────────────────────────────────────────────────────────────
// GET /store/api/coupon/active
// ─────────────────────────────────────────────────────────────────────────────
const active = async (req, res) => {
  const c = req.sessionData?.appliedCoupon;
  if (!c) return res.json({ success: true, coupon: null });

  try {
    // Re-fetch the coupon row so we can recompute eligibleSubtotal against
    // the current cart (cart may have changed since the coupon was applied).
    // Expiry is checked in SQL — avoids the Invalid Date JS bug.
    const [[coupon]] = await db.query(
      `SELECT * FROM tbl_coupons
       WHERE coupon_id = ? AND ${COUPON_VALID_SQL}
       LIMIT 1`,
      [c.coupon_id]
    );

    if (!coupon) {
      // Coupon expired or was deleted/unpublished — strip from session silently
      delete req.sessionData.appliedCoupon;
      req.touchSession();
      return res.json({ success: true, coupon: null });
    }

    let cartTotal        = 0;
    let eligibleSubtotal;
    let discount         = 0;

    try {
      const userId  = req.sessionData?.user?.id || 0;
      const cartItems = await readCartItems(req, db);

      cartTotal        = cartItems.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 0), 0);
      const productIds = cartItems.map((i) => Number(i.product_id)).filter(Boolean);

      // Pass real userId so per-user usage limits are correctly enforced
      // when a logged-in user reloads the checkout page.
      const result = await validateCouponRules(coupon, userId, cartTotal, productIds, db, cartItems);

      // Cart has changed and made the coupon invalid (e.g. items removed,
      // fell below minimum_spend) — strip immediately so the frontend clears
      // the discount.
      if (!result.ok) {
        delete req.sessionData.appliedCoupon;
        req.touchSession();
        return res.json({ success: true, coupon: null });
      }

      eligibleSubtotal = result.eligibleSubtotal;
      discount         = calculateDiscount(coupon, cartTotal, eligibleSubtotal, cartItems, result.eligibleProductIds);
    } catch (activeCartErr) {
      // Cart unreadable due to a DB error — safest to strip the coupon and
      // return null rather than risk showing a wrong discount to the user.
      // Log so DB failures are visible in server logs.
      console.error('coupon/active: cart read or validation failed:', activeCartErr);
      delete req.sessionData.appliedCoupon;
      req.touchSession();
      return res.json({ success: true, coupon: null });
    }

    return res.json({
      success: true,
      coupon: {
        code:     c.coupon_code,
        type:     c.coupon_type,
        amount:   c.coupon_amount,
        discount,
        ...(eligibleSubtotal !== undefined && { eligibleSubtotal }),
      },
    });
  } catch (err) {
    console.error('coupon/active error:', err);
    return res.status(500).json({ success: false, message: 'Something went wrong on our end. Please try again in a moment.' });
  }
};


const apply = async (req, res) => {
  const rawCode = String(req.body.coupon_code || '').trim();
  if (!rawCode) {
    return res.status(400).json({ success: false, message: 'Please enter a coupon code.' });
  }

  try {
   
    const [[coupon]] = await db.query(
      `SELECT *
       FROM tbl_coupons
       WHERE LOWER(coupon_code) = LOWER(?)
         AND ${COUPON_VALID_SQL}
       LIMIT 1`,
      [rawCode]
    );

    if (!coupon) {
      return res.status(404).json({ success: false, message: "That coupon code doesn't exist or has expired. Please check the code and try again." });
    }

    const userId = req.sessionData?.user?.id || 0;

    // Read cart for spend + product eligibility checks
    let cartItems = [];
    try {
      cartItems = await readCartItems(req, db);
    } catch (cartErr) {
      // Do NOT proceed with cartItems = [] — minimum_spend would pass against ₹0,
      // potentially allowing coupons to be applied to an effectively empty cart.
      console.error('coupon/apply: readCartItems failed:', cartErr);
      return res.status(500).json({ success: false, message: 'Something went wrong on our end. Please try again in a moment.' });
    }

    const cartTotal  = cartItems.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 0), 0);
    const productIds = cartItems.map((i) => Number(i.product_id)).filter(Boolean);

    const result = await validateCouponRules(coupon, userId, cartTotal, productIds, db, cartItems);
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }

    const eligibleSubtotal = result.eligibleSubtotal !== undefined ? result.eligibleSubtotal : cartTotal;
    const discount         = calculateDiscount(coupon, cartTotal, eligibleSubtotal, cartItems, result.eligibleProductIds);

    req.sessionData.appliedCoupon = {
      coupon_id:     coupon.coupon_id,
      coupon_code:   coupon.coupon_code,
      coupon_type:   coupon.coupon_type,
      coupon_amount: Number(coupon.coupon_amount),
    };
    req.touchSession();

    return res.json({
      success: true,
      message: `Coupon "${coupon.coupon_code}" applied! You're saving ₹${discount.toFixed(2)} on this order.`,
      data: {
        code:            coupon.coupon_code,
        type:            coupon.coupon_type,
        amount:          Number(coupon.coupon_amount),
        discount,
        eligibleSubtotal,
      },
    });
  } catch (err) {
    console.error('coupon/apply error:', err);
    return res.status(500).json({ success: false, message: 'Something went wrong on our end. Please try again in a moment.' });
  }
};

const remove = (req, res) => {
  delete req.sessionData.appliedCoupon;
  req.touchSession();
  return res.json({ success: true, message: 'Coupon removed.' });
};


// validateAndLockCoupon  (used inside a DB transaction in orderController.js)

async function validateAndLockCoupon(conn, sessionCoupon, userId, cartTotal, productIds, cartItems) {
  if (!sessionCoupon) return { ok: true, discount: 0 };

  // FOR UPDATE on tbl_coupons prevents two concurrent orders from both
  // passing the usage-limit check against the same coupon row.
  // Expiry checked in SQL — same reason as apply/active endpoints.
  const [[coupon]] = await conn.query(
    `SELECT *
     FROM tbl_coupons
     WHERE coupon_id = ?
       AND ${COUPON_VALID_SQL}
     LIMIT 1
     FOR UPDATE`,
    [sessionCoupon.coupon_id]
  );

  if (!coupon) {
    return { ok: false, status: 400, message: 'The coupon you applied is no longer valid (it may have expired or been removed). Please try a different coupon.' };
  }

  const result = await validateCouponRules(coupon, userId, cartTotal, productIds, conn, cartItems);
  if (!result.ok) return result;

  const eligibleSubtotal = result.eligibleSubtotal !== undefined ? result.eligibleSubtotal : cartTotal;
  const discount         = calculateDiscount(coupon, cartTotal, eligibleSubtotal, cartItems, result.eligibleProductIds);
  return { ok: true, discount, coupon, eligibleSubtotal, eligibleProductIds: result.eligibleProductIds };
}

/**
 * Record coupon usage — MUST be called inside the same DB transaction
 * as the order insert.
 */
async function recordCouponUsage(conn, sessionCoupon, orderId, userId) {
  await conn.query(
    `INSERT INTO tbl_coupons_usage (coupon_id, coupon_code, order_id, user_id)
     VALUES (?, ?, ?, ?)`,
    [sessionCoupon.coupon_id, sessionCoupon.coupon_code, orderId, userId || 0]
  );
  await conn.query(
    `UPDATE tbl_coupons SET coupon_count = coupon_count + 1 WHERE coupon_id = ?`,
    [sessionCoupon.coupon_id]
  );
}

module.exports = {
  apply,
  remove,
  active,
  validateAndLockCoupon,
  recordCouponUsage,
  calculateDiscount,
};