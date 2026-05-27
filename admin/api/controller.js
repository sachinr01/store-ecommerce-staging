const db = require('../config/db');
const NODE_ENV = process.env.NODE_ENV || 'development';

// Retry once on transient connection errors (ECONNRESET, ENOTFOUND, PROTOCOL_CONNECTION_LOST)
const RETRYABLE = new Set(['ECONNRESET', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ECONNREFUSED']);
const ATTRIBUTE_TAXONOMIES = new Set(['pa_color','pa_material','pa_style','pa_occasion','pa_feature','pa_size']);

// Human-readable label for each taxonomy prefix
const TAXONOMY_LABELS = {
  pa_color:    'Color',
  pa_material: 'Material',
  pa_style:    'Style',
  pa_occasion: 'Occasion',
  pa_feature:  'Feature',
  pa_size:     'Size',
};

const toSlug = (value) =>
    String(value ?? '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

const stripShortcodes = (value = '') => String(value || '').replace(/\[[^\]]+\]/g, ' ');

const sanitizeContent = (value) => String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');

const sanitizeSummary = (value) => String(value || '')
    .replace(/<[^>]+>/g, '')
    .trim();




const formatPostDate = (value) => {
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
};

const normalizePost = (row) => {
    const rawContent = stripShortcodes(row.post_content || '');
    const rawSummary = stripShortcodes(row.post_short_desc || '');
    const safeContent = sanitizeContent(rawContent).trim();
    const safeSummary = sanitizeSummary(rawSummary);
    // Image comes exclusively from tbl_media where media_type='blog_img' and parent_id=post.ID
    // Returns null when no image has been uploaded — frontend handles the null gracefully
    return {
        slug:                  row.post_slug,
        title:                 row.post_title,
        content:               safeContent,
        summary:               safeSummary,
        date:                  formatPostDate(row.post_date),
        image:                 row.blog_img_path || null,
        author_name:           row.author_name || 'Admin',
        primary_category_name: row.primary_category_name || null,
        primary_category_id:   row.primary_category_id   || null,
        // SEO fields — dynamically fetched from tbl_postmeta, latest row per key (ORDER BY meta_id DESC)
        seo_meta_title:        row.seo_meta_title        || null,
        seo_meta_description:  row.seo_meta_description  || null,
        seo_canonical_tag:     row.seo_canonical_tag     || null,
        seo_meta_index:        row.seo_meta_index        || 'yes',  // default YES if not set by admin
    };
};

const normalizePage = (row) => {
    const rawContent = stripShortcodes(row.post_content || '');
    const rawSummary = stripShortcodes(row.post_short_desc || '');
    const safeContent = sanitizeContent(rawContent).trim();
    const safeSummary = sanitizeSummary(rawSummary);
    return {
        slug:                 row.post_slug,
        title:                row.post_title,
        content:              safeContent,
        summary:              safeSummary,
        date:                 formatPostDate(row.post_date),
        menu_order:           row.menu_order ?? 0,
        // Page image — fetched from tbl_media where media_type='blog_image' AND parent_id=page.ID
        // Same mechanism as blog images; admin uploads via Page Image section
        image:                row.page_img_path || null,
        // SEO fields — dynamically fetched from tbl_postmeta per page
        // ORDER BY meta_id DESC picks the LATEST saved value (admin can save multiple times)
        seo_meta_title:       row.seo_meta_title       || null,
        seo_meta_description: row.seo_meta_description || null,
        seo_canonical_tag:    row.seo_canonical_tag    || null,
        seo_meta_index:       row.seo_meta_index       || 'yes', // default YES if not set by admin
    };
};

async function withRetry(fn) {
    try {
        return await fn();
    } catch (err) {
        if (RETRYABLE.has(err.code)) {
            console.warn(`DB connection error (${err.code}), retrying once...`);
            await new Promise(r => setTimeout(r, 1000));
            return await fn();
        }
        throw err;
    }
}

// GET /store/api/site-settings
// Returns public-safe site settings (no secrets)
const PUBLIC_SETTINGS_KEYS = [
    'placeholder_image',
    'store_name',
    'store_currency',
    'enable_reviews',
    'enable_ratings',
];
const getPublicSiteSettings = async (req, res) => {
    try {
        const [rows] = await withRetry(() => db.query(
            `SELECT option_name, option_value FROM tbl_site_options WHERE option_name IN (${PUBLIC_SETTINGS_KEYS.map(() => '?').join(',')})`,
            PUBLIC_SETTINGS_KEYS
        ));
        const data = {};
        rows.forEach(r => { data[r.option_name] = r.option_value; });
        res.json({ success: true, data });
    } catch (err) {
        console.error('getPublicSiteSettings error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

//  shared product list query builder 
async function queryProductList(extraWhere = '', orderBy = 'p.menu_order ASC', limit = null, params = [], extraHaving = '') {
    const parsedLimit = parseInt(limit, 10);
    const limitClause = Number.isFinite(parsedLimit) ? `LIMIT ${parsedLimit}` : '';
    const havingClause = extraHaving ? `HAVING ${extraHaving}` : '';
    const [rows] = await db.query(`
        SELECT
            p.ID,
            p.product_title       AS title,
            p.product_url         AS slug,
            p.product_short_desc  AS short_description,
            p.menu_order,
            p.product_date_added  AS date_added,
            (
                SELECT MIN(CAST((
                    SELECT pm.meta_value
                    FROM tbl_productmeta pm
                    WHERE pm.product_id = p2.ID
                      AND pm.meta_key = '_price'
                      AND pm.meta_value != ''
                    ORDER BY pm.meta_id DESC
                    LIMIT 1
                ) AS DECIMAL(10,2)))
                FROM tbl_products p2
                WHERE
                    CASE
                        WHEN EXISTS (SELECT 1 FROM tbl_products v WHERE v.parent_id = p.ID AND v.product_type = 'product_variation')
                        THEN p2.parent_id = p.ID AND p2.product_type = 'product_variation'
                        ELSE p2.ID = p.ID AND p2.product_type = 'product'
                    END
            ) AS price_min,
            (
                SELECT MAX(CAST((
                    SELECT pm.meta_value
                    FROM tbl_productmeta pm
                    WHERE pm.product_id = p2.ID
                      AND pm.meta_key = '_price'
                      AND pm.meta_value != ''
                    ORDER BY pm.meta_id DESC
                    LIMIT 1
                ) AS DECIMAL(10,2)))
                FROM tbl_products p2
                WHERE
                    CASE
                        WHEN EXISTS (SELECT 1 FROM tbl_products v WHERE v.parent_id = p.ID AND v.product_type = 'product_variation')
                        THEN p2.parent_id = p.ID AND p2.product_type = 'product_variation'
                        ELSE p2.ID = p.ID AND p2.product_type = 'product'
                    END
            ) AS price_max,
            (
                SELECT pm.meta_value
                FROM tbl_productmeta pm
                WHERE pm.product_id = p.ID
                  AND pm.meta_key = '_regular_price'
                ORDER BY pm.meta_id DESC
                LIMIT 1
            ) AS _regular_price,
            (
                SELECT pm.meta_value
                FROM tbl_productmeta pm
                WHERE pm.product_id = p.ID
                  AND pm.meta_key = '_sale_price'
                ORDER BY pm.meta_id DESC
                LIMIT 1
            ) AS _sale_price,
            (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_sale_price_dates_from' ORDER BY meta_id DESC LIMIT 1) AS _sale_price_dates_from,
            (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_sale_price_dates_to'   ORDER BY meta_id DESC LIMIT 1) AS _sale_price_dates_to,
            (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_thumbnail_id' ORDER BY meta_id DESC LIMIT 1) AS thumbnail_id,
            (
                SELECT m2.media_path
                FROM tbl_productmeta pm
                JOIN tbl_media m2 ON m2.media_id = CAST(pm.meta_value AS UNSIGNED)
                WHERE pm.product_id = p.ID AND pm.meta_key = '_thumbnail_id'
                ORDER BY pm.meta_id DESC
                LIMIT 1
            ) AS thumbnail_url,
            (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_product_image_gallery' LIMIT 1) AS gallery_ids,
            (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_sku'           LIMIT 1) AS sku,
            (
                -- For variable products: 'instock' if ANY variation is instock, else 'outofstock'
                -- For simple products: use the parent's own _stock_status, default 'instock' if missing
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM tbl_products v WHERE v.parent_id = p.ID AND v.product_type = 'product_variation'
                    ) THEN (
                        CASE WHEN EXISTS (
                            SELECT 1
                            FROM tbl_products v
                            JOIN tbl_productmeta pm ON pm.product_id = v.ID AND pm.meta_key = '_stock_status'
                            WHERE v.parent_id = p.ID AND v.product_type = 'product_variation'
                              AND pm.meta_value = 'instock'
                        ) THEN 'instock' ELSE 'outofstock' END
                    )
                    ELSE COALESCE((SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_stock_status' ORDER BY meta_id DESC LIMIT 1), 'instock')
                END
            ) AS stock_status,
            (
                -- For simple products: return _stock qty. For variable products: NULL (stock is per-variation)
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM tbl_products v WHERE v.parent_id = p.ID AND v.product_type = 'product_variation'
                    ) THEN NULL
                    ELSE (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_stock' ORDER BY meta_id DESC LIMIT 1)
                END
            ) AS stock_qty,
            (SELECT CAST(meta_value AS UNSIGNED) FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = 'total_sales' LIMIT 1) AS total_sales,
            (
                SELECT GROUP_CONCAT(DISTINCT a.attr_slug ORDER BY a.attr_slug SEPARATOR ',')
                FROM tbl_attributes_lookup al
                JOIN tbl_attributes a ON a.attr_id = al.attr_id
                WHERE al.taxonomy = 'pa_color'
                  AND al.product_or_parent_id IN (
                      SELECT ID FROM tbl_products
                      WHERE ID = p.ID
                         OR (parent_id = p.ID AND product_type = 'product_variation')
                  )
                        ) AS color_slugs,
            (
                SELECT GROUP_CONCAT(DISTINCT a.attr_slug ORDER BY a.attr_slug SEPARATOR ',')
                FROM tbl_attributes_lookup al
                JOIN tbl_attributes a ON a.attr_id = al.attr_id
                WHERE al.taxonomy = 'pa_material'
                  AND al.product_or_parent_id IN (
                      SELECT ID FROM tbl_products
                      WHERE ID = p.ID
                         OR (parent_id = p.ID AND product_type = 'product_variation')
                  )
            ) AS material_slugs,
            (
                SELECT GROUP_CONCAT(DISTINCT a.attr_slug ORDER BY a.attr_slug SEPARATOR ',')
                FROM tbl_attributes_lookup al
                JOIN tbl_attributes a ON a.attr_id = al.attr_id
                WHERE al.taxonomy = 'pa_style'
                  AND al.product_or_parent_id IN (
                      SELECT ID FROM tbl_products
                      WHERE ID = p.ID
                         OR (parent_id = p.ID AND product_type = 'product_variation')
                  )
            ) AS style_slugs,
            (
                SELECT GROUP_CONCAT(DISTINCT a.attr_slug ORDER BY a.attr_slug SEPARATOR ',')
                FROM tbl_attributes_lookup al
                JOIN tbl_attributes a ON a.attr_id = al.attr_id
                WHERE al.taxonomy = 'pa_occasion'
                  AND al.product_or_parent_id IN (
                      SELECT ID FROM tbl_products
                      WHERE ID = p.ID
                         OR (parent_id = p.ID AND product_type = 'product_variation')
                  )
            ) AS occasion_slugs,
            (
                SELECT GROUP_CONCAT(DISTINCT a.attr_slug ORDER BY a.attr_slug SEPARATOR ',')
                FROM tbl_attributes_lookup al
                JOIN tbl_attributes a ON a.attr_id = al.attr_id
                WHERE al.taxonomy = 'pa_feature'
                  AND al.product_or_parent_id IN (
                      SELECT ID FROM tbl_products
                      WHERE ID = p.ID
                         OR (parent_id = p.ID AND product_type = 'product_variation')
                  )
            ) AS feature_slugs,
            (
                SELECT GROUP_CONCAT(DISTINCT a.attr_slug ORDER BY a.attr_slug SEPARATOR ',')
                FROM tbl_attributes_lookup al
                JOIN tbl_attributes a ON a.attr_id = al.attr_id
                WHERE al.taxonomy = 'pa_size'
                  AND al.product_or_parent_id IN (
                      SELECT ID FROM tbl_products
                      WHERE ID = p.ID
                         OR (parent_id = p.ID AND product_type = 'product_variation')
                  )
            ) AS size_slugs
        FROM tbl_products p
        WHERE p.product_type   = 'product'
          AND p.product_status = 'publish'
          AND (p.parent_id = 0 OR p.parent_id IS NULL)
          ${extraWhere}
        ${havingClause}
        ORDER BY ${orderBy}
        ${limitClause}
    `, params);
    return rows;
}

//  GET /store/api/products 
// All published parent products ordered by menu_order.
// Query params: ?limit=N
const getProducts = async (req, res) => {
    try {
        const getArray = (key) => {
            const value = req.query[key];
            if (!value) return [];
            return Array.isArray(value) ? value : [value];
        };

        const getSingle = (key) => {
            const value = req.query[key];
            return Array.isArray(value) ? value[0] : value;
        };

        const productTypes = getArray('filter.p.product_type').map(toSlug).filter(Boolean);
        const colors = getArray('filter.p.m.pa_color').map(toSlug).filter(Boolean);
        const materials = getArray('filter.p.m.pa_material').map(toSlug).filter(Boolean);
        const styles = getArray('filter.p.m.pa_style').map(toSlug).filter(Boolean);
        const occasions = getArray('filter.p.m.pa_occasion').map(toSlug).filter(Boolean);
        const features = getArray('filter.p.m.pa_feature').map(toSlug).filter(Boolean);

        const priceGte = getSingle('filter.v.price.gte');
        const priceLte = getSingle('filter.v.price.lte');
        const sortBy = String(getSingle('sort_by') || 'best-selling');
        const searchTerm = (getSingle('search') || '').trim().slice(0, 200);

        const whereParts = [];
        const params = [];

        if (searchTerm) {
            const like = `%${searchTerm}%`;
            whereParts.push(`AND (p.product_title LIKE ? OR p.product_url LIKE ? OR p.product_short_desc LIKE ? OR EXISTS (SELECT 1 FROM tbl_productmeta pm_sku WHERE pm_sku.product_id = p.ID AND pm_sku.meta_key = '_sku' AND pm_sku.meta_value LIKE ?))`);
            params.push(like, like, like, like);
        }

        if (productTypes.length > 0) {
            const placeholders = productTypes.map(() => '?').join(', ');
            whereParts.push(`AND p.product_url IN (${placeholders})`);
            params.push(...productTypes);
        }

        const addAttrFilter = (taxonomy, values) => {
            if (!values || values.length === 0) return;
            const placeholders = values.map(() => '?').join(', ');
            whereParts.push(`
                AND EXISTS (
                    SELECT 1
                    FROM tbl_attributes_lookup al
                    JOIN tbl_attributes a ON a.attr_id = al.attr_id
                    WHERE al.taxonomy = ?
                      AND a.attr_slug IN (${placeholders})
                      AND al.product_or_parent_id IN (
                          SELECT ID FROM tbl_products
                          WHERE ID = p.ID
                             OR (parent_id = p.ID AND product_type = 'product_variation')
                      )
                )
            `);
            params.push(taxonomy, ...values);
        };

        addAttrFilter('pa_color', colors);
        addAttrFilter('pa_material', materials);
        addAttrFilter('pa_style', styles);
        addAttrFilter('pa_occasion', occasions);
        addAttrFilter('pa_feature', features);

        const havingParts = [];
        if (priceGte !== undefined && priceGte !== '') {
            havingParts.push('price_max >= ?');
            params.push(Number(priceGte));
        }
        if (priceLte !== undefined && priceLte !== '') {
            havingParts.push('price_min <= ?');
            params.push(Number(priceLte));
        }
        const extraHaving = havingParts.join(' AND ');

        let orderBy = 'p.menu_order ASC';
        if (sortBy === 'best-selling') orderBy = 'total_sales DESC, p.menu_order ASC';
        if (sortBy === 'price-ascending') orderBy = 'price_min ASC, p.menu_order ASC';
        if (sortBy === 'price-descending') orderBy = 'price_min DESC, p.menu_order ASC';
        if (sortBy === 'title-ascending') orderBy = 'p.product_title ASC';
        if (sortBy === 'newest') orderBy = 'p.product_date_added DESC, p.ID DESC';
        if (sortBy === 'menu-order') orderBy = 'p.menu_order ASC';

        const extraWhere = whereParts.length ? `\n          ${whereParts.join('\n          ')}` : '';

        const products = await withRetry(() =>
            queryProductList(extraWhere, orderBy, req.query.limit || null, params, extraHaving)
        );
        res.json({ success: true, count: products.length, data: products });
    } catch (err) {
        console.error('getProducts error:', err);
        res.status(500).json({ success: false, message: 'Server error', ...(NODE_ENV !== 'production' ? { error: err.message || String(err), code: err.code || null } : {}) });
    }
};

//  GET /store/api/products/featured 
// Top-selling products  used by NewArrivals section.
// Query params: ?limit=N  (default 4)
const getFeaturedProducts = async (req, res) => {
    try {
        const limit = req.query.limit || 4;
        const products = await withRetry(() => queryProductList('', 'total_sales DESC, p.menu_order ASC', limit));
        res.json({ success: true, count: products.length, data: products });
    } catch (err) {
        console.error('getFeaturedProducts error:', err);
        res.status(500).json({ success: false, message: 'Server error', ...(NODE_ENV !== 'production' ? { error: err.message || String(err), code: err.code || null } : {}) });
    }
};

//  GET /store/api/products/on-sale 
// Products that have a valid sale price lower than the regular price.
// Query params: ?limit=N
const getOnSaleProducts = async (req, res) => {
    try {
        // A product is "on sale" when:
        //  1. It has a sale_price > 0 that is less than regular_price, AND
        //  2. Today falls within the optional sale date window
        //     (no dates set = always active; partial dates = open-ended range)
        const saleDateCheck = `
            AND (
                -- No start date set, OR today >= start date
                COALESCE((
                    SELECT pm_from.meta_value FROM tbl_productmeta pm_from
                    WHERE pm_from.product_id = v.ID AND pm_from.meta_key = '_sale_price_dates_from'
                    ORDER BY pm_from.meta_id DESC LIMIT 1
                ), '') = ''
                OR CURDATE() >= STR_TO_DATE((
                    SELECT pm_from.meta_value FROM tbl_productmeta pm_from
                    WHERE pm_from.product_id = v.ID AND pm_from.meta_key = '_sale_price_dates_from'
                    ORDER BY pm_from.meta_id DESC LIMIT 1
                ), '%Y-%m-%d')
            )
            AND (
                -- No end date set, OR today <= end date
                COALESCE((
                    SELECT pm_to.meta_value FROM tbl_productmeta pm_to
                    WHERE pm_to.product_id = v.ID AND pm_to.meta_key = '_sale_price_dates_to'
                    ORDER BY pm_to.meta_id DESC LIMIT 1
                ), '') = ''
                OR CURDATE() <= STR_TO_DATE((
                    SELECT pm_to.meta_value FROM tbl_productmeta pm_to
                    WHERE pm_to.product_id = v.ID AND pm_to.meta_key = '_sale_price_dates_to'
                    ORDER BY pm_to.meta_id DESC LIMIT 1
                ), '%Y-%m-%d')
            )`;

        // Also handle simple (non-variable) products on sale
        const simpleOnSale = `
            OR (
                NOT EXISTS (SELECT 1 FROM tbl_products v2 WHERE v2.parent_id = p.ID AND v2.product_type = 'product_variation')
                AND CAST(COALESCE((
                    SELECT pm_s.meta_value FROM tbl_productmeta pm_s
                    WHERE pm_s.product_id = p.ID AND pm_s.meta_key = '_sale_price' AND pm_s.meta_value != ''
                    ORDER BY pm_s.meta_id DESC LIMIT 1
                ), '0') AS DECIMAL(10,2)) > 0
                AND CAST(COALESCE((
                    SELECT pm_s.meta_value FROM tbl_productmeta pm_s
                    WHERE pm_s.product_id = p.ID AND pm_s.meta_key = '_sale_price' AND pm_s.meta_value != ''
                    ORDER BY pm_s.meta_id DESC LIMIT 1
                ), '0') AS DECIMAL(10,2)) < CAST(COALESCE((
                    SELECT pm_r.meta_value FROM tbl_productmeta pm_r
                    WHERE pm_r.product_id = p.ID AND pm_r.meta_key = '_regular_price' AND pm_r.meta_value != ''
                    ORDER BY pm_r.meta_id DESC LIMIT 1
                ), '0') AS DECIMAL(10,2))
                AND (
                    COALESCE((SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_sale_price_dates_from' ORDER BY meta_id DESC LIMIT 1), '') = ''
                    OR CURDATE() >= STR_TO_DATE((SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_sale_price_dates_from' ORDER BY meta_id DESC LIMIT 1), '%Y-%m-%d')
                )
                AND (
                    COALESCE((SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_sale_price_dates_to' ORDER BY meta_id DESC LIMIT 1), '') = ''
                    OR CURDATE() <= STR_TO_DATE((SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_sale_price_dates_to' ORDER BY meta_id DESC LIMIT 1), '%Y-%m-%d')
                )
            )`;

        const products = await withRetry(() => queryProductList(
            `AND (
                EXISTS (
                    SELECT 1
                    FROM tbl_products v
                    WHERE v.parent_id = p.ID
                      AND v.product_type = 'product_variation'
                      AND CAST(COALESCE((
                            SELECT pm_sale.meta_value FROM tbl_productmeta pm_sale
                            WHERE pm_sale.product_id = v.ID AND pm_sale.meta_key = '_sale_price' AND pm_sale.meta_value != ''
                            ORDER BY pm_sale.meta_id DESC LIMIT 1
                          ), '0') AS DECIMAL(10,2)) > 0
                      AND CAST(COALESCE((
                            SELECT pm_sale.meta_value FROM tbl_productmeta pm_sale
                            WHERE pm_sale.product_id = v.ID AND pm_sale.meta_key = '_sale_price' AND pm_sale.meta_value != ''
                            ORDER BY pm_sale.meta_id DESC LIMIT 1
                          ), '0') AS DECIMAL(10,2)) < CAST(COALESCE((
                            SELECT pm_regular.meta_value FROM tbl_productmeta pm_regular
                            WHERE pm_regular.product_id = v.ID AND pm_regular.meta_key = '_regular_price' AND pm_regular.meta_value != ''
                            ORDER BY pm_regular.meta_id DESC LIMIT 1
                          ), '0') AS DECIMAL(10,2))
                      ${saleDateCheck}
                )
                ${simpleOnSale}
            )`,
            'p.menu_order ASC',
            req.query.limit || null
        ));
        res.json({ success: true, count: products.length, data: products });
    } catch (err) {
        console.error('getOnSaleProducts error:', err);
        res.status(500).json({ success: false, message: 'Server error', ...(NODE_ENV !== 'production' ? { error: err.message || String(err), code: err.code || null } : {}) });
    }
};

// Best-selling products based on total units sold (SUM of _qty per product).
// Query params: ?limit=N (default 5)
const getBestSellerProducts = async (req, res) => {
    try {
        const limit    = Math.min(parseInt(req.query.limit) || 5, 20);
        const catSlug  = req.query.category ? String(req.query.category).trim() : null;

        // Resolve category slug → IDs (including children) when requested
        let catFilter = '';
        let params    = [];

        if (catSlug) {
            const [[cat]] = await db.query(
                `SELECT category_id FROM tbl_products_category WHERE category_slug = ? LIMIT 1`,
                [catSlug]
            );
            if (!cat) return res.json({ success: true, count: 0, data: [] });

            const [children] = await db.query(
                `SELECT category_id FROM tbl_products_category WHERE parent_id = ?`,
                [cat.category_id]
            );
            const catIds = [cat.category_id, ...children.map(c => c.category_id)];
            const ph     = catIds.map(() => '?').join(', ');
            catFilter    = `AND EXISTS (
                SELECT 1 FROM tbl_products_category_link cl
                WHERE cl.product_id = p.ID AND cl.category_id IN (${ph})
            )`;
            params = [...catIds];
        }

        const [rows] = await db.query(`
            SELECT
                p.ID,
                p.product_title AS title,
                p.product_url   AS slug,
                p.product_date_added AS date_added,
                SUM(CAST(qty_meta.meta_value AS UNSIGNED)) AS total_sales,
                (
                    SELECT m2.media_path
                    FROM tbl_productmeta pm2
                    JOIN tbl_media m2 ON m2.media_id = CAST(pm2.meta_value AS UNSIGNED)
                    WHERE pm2.product_id = p.ID AND pm2.meta_key = '_thumbnail_id'
                    ORDER BY pm2.meta_id DESC LIMIT 1
                ) AS thumbnail_url,
                CAST(COALESCE((
                    SELECT pm3.meta_value FROM tbl_productmeta pm3
                    WHERE pm3.product_id = p.ID AND pm3.meta_key = '_price'
                    AND pm3.meta_value != '' ORDER BY pm3.meta_id DESC LIMIT 1
                ), '0') AS DECIMAL(10,2)) AS price_min,
                CAST(COALESCE((
                    SELECT pm4.meta_value FROM tbl_productmeta pm4
                    WHERE pm4.product_id = p.ID AND pm4.meta_key = '_regular_price'
                    AND pm4.meta_value != '' ORDER BY pm4.meta_id DESC LIMIT 1
                ), '0') AS DECIMAL(10,2)) AS _regular_price,
                CAST(COALESCE((
                    SELECT pm5.meta_value FROM tbl_productmeta pm5
                    WHERE pm5.product_id = p.ID AND pm5.meta_key = '_sale_price'
                    AND pm5.meta_value != '' ORDER BY pm5.meta_id DESC LIMIT 1
                ), NULL) AS DECIMAL(10,2)) AS _sale_price,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_sale_price_dates_from' ORDER BY meta_id DESC LIMIT 1) AS _sale_price_dates_from,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_sale_price_dates_to'   ORDER BY meta_id DESC LIMIT 1) AS _sale_price_dates_to,
                COALESCE((
                    SELECT pm6.meta_value FROM tbl_productmeta pm6
                    WHERE pm6.product_id = p.ID AND pm6.meta_key = '_stock_status'
                    ORDER BY pm6.meta_id DESC LIMIT 1
                ), 'instock') AS stock_status
            FROM tbl_order_itemmeta oim
            INNER JOIN tbl_order_items oi ON oi.order_item_id = oim.order_item_id
            INNER JOIN tbl_orders o ON o.order_id = oi.order_id
            INNER JOIN tbl_products p ON p.ID = oim.meta_value
            INNER JOIN tbl_order_itemmeta qty_meta
                ON qty_meta.order_item_id = oim.order_item_id
               AND qty_meta.meta_key = '_qty'
            WHERE oim.meta_key = '_product_id'
              AND p.product_status = 'publish'
              AND (p.parent_id = 0 OR p.parent_id IS NULL)
              AND o.order_type = 'shop_order'
              ${catFilter}
            GROUP BY p.ID
            ORDER BY total_sales DESC
            LIMIT ?
        `, [...params, limit]);

        const data = rows.map(r => ({
            ID:             r.ID,
            title:          r.title,
            slug:           r.slug,
            date_added:     r.date_added,
            total_sales:    r.total_sales,
            thumbnail_url:  r.thumbnail_url || null,
            price_min:      r.price_min,
            price_max:      r.price_min,
            _regular_price: r._regular_price,
            _sale_price:    r._sale_price,
            _sale_price_dates_from: r._sale_price_dates_from || null,
            _sale_price_dates_to:   r._sale_price_dates_to   || null,
            stock_status:   r.stock_status,
        }));

        res.json({ success: true, count: data.length, data });
    } catch (err) {
        console.error('getBestSellerProducts error:', err);
        res.status(500).json({ success: false, message: 'Server error', ...(NODE_ENV !== 'production' ? { error: err.message || String(err), code: err.code || null } : {}) });
    }
};

//  GET /store/api/products/:id 
// Single product with full description, all variations, colors and sizes.
const getProduct = async (req, res) => {
    const { id } = req.params;

    try {
        // Parent product
        const [[product]] = await withRetry(() => db.query(`
            SELECT
                p.ID,
                p.product_title       AS title,
                p.product_url         AS slug,
                p.product_content     AS description,
                p.product_short_desc  AS short_description,
                p.product_date_added  AS date_added,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_thumbnail_id' ORDER BY meta_id DESC LIMIT 1) AS thumbnail_id,
                (
                    SELECT m2.media_path
                    FROM tbl_productmeta pm
                    JOIN tbl_media m2 ON m2.media_id = CAST(pm.meta_value AS UNSIGNED)
                    WHERE pm.product_id = p.ID AND pm.meta_key = '_thumbnail_id'
                    ORDER BY pm.meta_id DESC
                    LIMIT 1
                )                     AS thumbnail_url,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_product_image_gallery' LIMIT 1) AS gallery_ids,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_sku' ORDER BY meta_id DESC LIMIT 1) AS sku,
                COALESCE((SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_stock_status' ORDER BY meta_id DESC LIMIT 1), 'instock') AS stock_status,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_stock' ORDER BY meta_id DESC LIMIT 1) AS stock_qty,
                (SELECT CAST(meta_value AS UNSIGNED) FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = 'total_sales' ORDER BY meta_id DESC LIMIT 1) AS total_sales,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_price' ORDER BY meta_id DESC LIMIT 1) AS price,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_regular_price' ORDER BY meta_id DESC LIMIT 1) AS regular_price,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_sale_price' ORDER BY meta_id DESC LIMIT 1) AS sale_price,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_sale_price_dates_from' ORDER BY meta_id DESC LIMIT 1) AS sale_price_dates_from,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_sale_price_dates_to'   ORDER BY meta_id DESC LIMIT 1) AS sale_price_dates_to,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_product_features' ORDER BY meta_id DESC LIMIT 1) AS product_features,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_product_material' ORDER BY meta_id DESC LIMIT 1) AS product_material,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_product_collection' ORDER BY meta_id DESC LIMIT 1) AS product_collection,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_product_care' ORDER BY meta_id DESC LIMIT 1) AS product_care,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_product_included' ORDER BY meta_id DESC LIMIT 1) AS product_included,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_product_more_info' ORDER BY meta_id DESC LIMIT 1) AS product_more_info,
                -- SEO fields — set by admin in Product SEO Settings, stored in tbl_productmeta
                -- ORDER BY meta_id DESC LIMIT 1 always returns the LATEST saved value
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = 'meta_title'       ORDER BY meta_id DESC LIMIT 1) AS seo_meta_title,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = 'meta_description' ORDER BY meta_id DESC LIMIT 1) AS seo_meta_description,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = 'canonical_tag'    ORDER BY meta_id DESC LIMIT 1) AS seo_canonical_tag,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = 'meta_index'       ORDER BY meta_id DESC LIMIT 1) AS seo_meta_index,
                (SELECT CAST(meta_value AS DECIMAL(3,2)) FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_wc_average_rating' ORDER BY meta_id DESC LIMIT 1) AS avg_rating,
                (SELECT CAST(meta_value AS UNSIGNED) FROM tbl_productmeta WHERE product_id = p.ID AND meta_key = '_wc_review_count' ORDER BY meta_id DESC LIMIT 1) AS review_count
            FROM tbl_products p
            WHERE p.ID = ?
              AND p.product_type   = 'product'
              AND p.product_status = 'publish'
        `, [id]));

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // All variations with price, sale price, color, size, stock, sku, thumbnail
        const [variations] = await withRetry(() => db.query(`
            SELECT
                v.ID,
                v.product_title       AS title,
                v.menu_order,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = v.ID AND meta_key = '_price' ORDER BY meta_id DESC LIMIT 1) AS price,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = v.ID AND meta_key = '_regular_price' ORDER BY meta_id DESC LIMIT 1) AS regular_price,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = v.ID AND meta_key = '_sale_price' ORDER BY meta_id DESC LIMIT 1) AS sale_price,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = v.ID AND meta_key = 'attribute_pa_color' ORDER BY meta_id DESC LIMIT 1) AS color,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = v.ID AND meta_key = 'attribute_pa_size' ORDER BY meta_id DESC LIMIT 1) AS size,
                COALESCE((SELECT meta_value FROM tbl_productmeta WHERE product_id = v.ID AND meta_key = '_stock_status' ORDER BY meta_id DESC LIMIT 1), 'instock') AS stock_status,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = v.ID AND meta_key = '_stock'            ORDER BY meta_id DESC LIMIT 1) AS stock_qty,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = v.ID AND meta_key = '_thumbnail_id' ORDER BY meta_id DESC LIMIT 1) AS thumbnail_id,
                (
                    SELECT m2.media_path
                    FROM tbl_productmeta pm
                    JOIN tbl_media m2 ON m2.media_id = CAST(pm.meta_value AS UNSIGNED)
                    WHERE pm.product_id = v.ID AND pm.meta_key = '_thumbnail_id'
                    LIMIT 1
                ) AS thumbnail_url,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = v.ID AND meta_key = '_sku' ORDER BY meta_id DESC LIMIT 1) AS sku,
                (SELECT meta_value FROM tbl_productmeta WHERE product_id = v.ID AND meta_key = '_variation_description' ORDER BY meta_id DESC LIMIT 1) AS variation_description
            FROM tbl_products v
            WHERE v.parent_id = ? AND v.product_type = 'product_variation'
            ORDER BY v.menu_order ASC
        `, [id]));

        // Fetch all images for each variation (for full gallery switch on color select)
        const variationIds = variations.map(v => v.ID);
        const variationImages = {};
        if (variationIds.length) {
            const [varImgRows] = await withRetry(() => db.query(
                `SELECT m.parent_id AS variation_id, m.media_path AS file_path
                 FROM tbl_media m
                 WHERE m.parent_id IN (${variationIds.map(() => '?').join(',')})
                 ORDER BY m.parent_id, m.media_id ASC`,
                variationIds
            ));
            for (const row of varImgRows) {
                if (!variationImages[row.variation_id]) variationImages[row.variation_id] = [];
                variationImages[row.variation_id].push(row.file_path);
            }
        }
        // Attach image_urls array to each variation
        for (const v of variations) {
            v.image_urls = variationImages[v.ID] || [];
        }

        // Unique colors available for this product (with in-stock flag)
        const [colors] = await withRetry(() => db.query(`
            SELECT DISTINCT
                a.attr_id,
                a.attr_name,
                a.attr_slug,
                MAX(al.in_stock) AS in_stock
            FROM tbl_attributes_lookup al
            JOIN tbl_attributes a ON a.attr_id = al.attr_id
            WHERE al.product_or_parent_id = ? AND al.taxonomy = 'pa_color'
            GROUP BY a.attr_id
            ORDER BY a.attr_name ASC
        `, [id]));

        // Unique sizes available for this product (with in-stock flag)
        const [sizes] = await withRetry(() => db.query(`
            SELECT DISTINCT
                a.attr_id,
                a.attr_name,
                a.attr_slug,
                MAX(al.in_stock) AS in_stock
            FROM tbl_attributes_lookup al
            JOIN tbl_attributes a ON a.attr_id = al.attr_id
            WHERE al.product_or_parent_id = ? AND al.taxonomy = 'pa_size'
            GROUP BY a.attr_id
            ORDER BY a.attr_name ASC
        `, [id]));

        // Price range — for variable products use ONLY variation prices
        // For simple products (no variations) use the parent _price
        // Effective price = sale_price if sale < regular, else regular_price
        const effectiveVarPrices = variations.map(v => {
            const reg  = parseFloat(v.regular_price) || 0;
            const sale = parseFloat(v.sale_price)    || 0;
            const eff  = (sale > 0 && sale < reg) ? sale : (reg || parseFloat(v.price) || 0);
            return eff;
        }).filter(p => p > 0);

        const prices = variations.length > 0
            ? effectiveVarPrices
            : (product.price ? [parseFloat(product.price)] : []);

        const price_min = prices.length ? Math.min(...prices) : null;
        const price_max = prices.length ? Math.max(...prices) : null;

        // gallery_urls = all parent_id images EXCEPT the _thumbnail_id one
        // The featured image (thumbnail_url) is shown separately on the product page
        const [allMediaRows] = await withRetry(() => db.query(
            `SELECT m.media_id,
                    m.media_path AS file_path,
                    CASE WHEN m.media_id = ? THEN 1 ELSE 0 END AS is_thumbnail
             FROM tbl_media m
             WHERE m.parent_id = ?
             AND m.media_type = 'product_image'
             ORDER BY is_thumbnail DESC, m.media_id ASC`,
            [product.thumbnail_id ? Number(product.thumbnail_id) : 0, id]
        ));
        const gallery_urls = allMediaRows
            .filter(r => r.file_path)
            .map(r => ({ file_path: r.file_path, is_thumbnail: r.is_thumbnail === 1 }));

        // Compute stock_status dynamically from variations (more reliable than parent meta)
        // For variable products: instock if ANY variation is instock/onbackorder
        // For simple products: keep the parent's own stock_status
        if (variations.length > 0) {
            const anyVarInStock = variations.some(
                v => v.stock_status === 'instock' || v.stock_status === 'onbackorder'
            );
            product.stock_status = anyVarInStock ? 'instock' : 'outofstock';
        }

        res.json({
            success: true,
            data: {
                ...product,
                price_min,
                price_max,
                gallery_urls,
                variations,
                attributes: { colors, sizes }
            }
        });
    } catch (err) {
        console.error('getProduct error:', err);
        res.status(500).json({ success: false, message: 'Server error', ...(NODE_ENV !== 'production' ? { error: err.message || String(err), code: err.code || null } : {}) });
    }
};

//  GET /store/api/attributes/colors 
// All distinct color attributes used across published products.
const getColors = async (req, res) => {
    try {
        const [rows] = await withRetry(() => db.query(`
            SELECT
                MIN(a.attr_id) AS attr_id,
                a.attr_name,
                MIN(a.attr_slug) AS attr_slug
            FROM tbl_attributes a
            JOIN tbl_attributes_lookup al ON al.attr_id = a.attr_id
            JOIN tbl_products p ON p.ID = al.product_or_parent_id
            WHERE al.taxonomy = 'pa_color'
              AND p.product_status = 'publish'
            GROUP BY a.attr_name
            ORDER BY a.attr_name ASC
        `));
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('getColors error:', err);
        res.status(500).json({ success: false, message: 'Server error', ...(NODE_ENV !== 'production' ? { error: err.message || String(err), code: err.code || null } : {}) });
    }
};

// GET /store/api/attributes/:taxonomy
// Returns distinct attributes for the given taxonomy (pa_color, pa_material, pa_style, pa_occasion, pa_feature)
const getAttributesByTaxonomy = async (req, res) => {
    const raw = String(req.params.taxonomy ?? '').toLowerCase().trim();
    const taxonomy = raw.startsWith('pa_') ? raw : `pa_${raw}`;

    if (!ATTRIBUTE_TAXONOMIES.has(taxonomy)) {
        return res.status(400).json({ success: false, message: 'Unsupported taxonomy' });
    }

    try {
        const [rows] = await withRetry(() => db.query(`
            SELECT
                MIN(a.attr_id) AS attr_id,
                a.attr_name,
                MIN(a.attr_slug) AS attr_slug
            FROM tbl_attributes a
            JOIN tbl_attributes_lookup al ON al.attr_id = a.attr_id
            JOIN tbl_products p ON p.ID = al.product_or_parent_id
            WHERE al.taxonomy = ?
              AND p.product_status = 'publish'
            GROUP BY a.attr_name
            ORDER BY a.attr_name ASC
        `, [taxonomy]));
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('getAttributesByTaxonomy error:', err);
        res.status(500).json({ success: false, message: 'Server error', ...(NODE_ENV !== 'production' ? { error: err.message || String(err), code: err.code || null } : {}) });
    }
};
// GET /store/api/attributes/all
// Returns ALL taxonomies that have at least one attribute linked to a published product.
// Each entry: { taxonomy, label, options: [{ attr_id, attr_name, attr_slug }] }
// Adding a new taxonomy to tbl_attributes_lookup automatically shows it here.
const getAllAttributeGroups = async (req, res) => {
    try {
        const taxPh = [...ATTRIBUTE_TAXONOMIES].map(() => '?').join(',');
        const [rows] = await withRetry(() => db.query(`
            SELECT
                al.taxonomy,
                MIN(a.attr_id)   AS attr_id,
                a.attr_name,
                MIN(a.attr_slug) AS attr_slug
            FROM tbl_attributes a
            JOIN tbl_attributes_lookup al ON al.attr_id = a.attr_id
            JOIN tbl_products p ON p.ID = al.product_or_parent_id
            WHERE p.product_status = 'publish'
              AND al.taxonomy IN (${taxPh})
            GROUP BY al.taxonomy, a.attr_name
            ORDER BY al.taxonomy ASC, a.attr_name ASC
        `, [...ATTRIBUTE_TAXONOMIES]));

        // Group by taxonomy
        const grouped = {};
        for (const row of rows) {
            if (!grouped[row.taxonomy]) {
                grouped[row.taxonomy] = {
                    taxonomy: row.taxonomy,
                    label: TAXONOMY_LABELS[row.taxonomy]
                        || row.taxonomy.replace(/^pa_/, '').replace(/-/g, ' ')
                            .replace(/\b\w/g, c => c.toUpperCase()),
                    options: [],
                };
            }
            grouped[row.taxonomy].options.push({
                attr_id:   row.attr_id,
                attr_name: row.attr_name,
                attr_slug: row.attr_slug,
            });
        }

        res.json({ success: true, data: Object.values(grouped) });
    } catch (err) {
        console.error('getAllAttributeGroups error:', err);
        res.status(500).json({ success: false, message: 'Server error', ...(NODE_ENV !== 'production' ? { error: err.message || String(err), code: err.code || null } : {}) });
    }
};

// GET /store/api/product-categories
// Returns all categories with product_count via tbl_products_category_link (product_id column)
const getProductCategories = async (req, res) => {
    try {
        const [rows] = await withRetry(() => db.query(
            `SELECT
                c.category_id,
                c.parent_id,
                c.category_slug,
                c.category_name,
                c.category_desc,
                COUNT(DISTINCT l.product_id) AS product_count
             FROM tbl_products_category c
             LEFT JOIN tbl_products_category_link l ON l.category_id = c.category_id
             GROUP BY c.category_id, c.parent_id, c.category_slug, c.category_name, c.category_desc
             ORDER BY c.parent_id ASC, c.category_id ASC`
        ));
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('getProductCategories error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /store/api/product-categories/search?q=term&limit=N
// Returns categories whose name matches the search term
const searchProductCategories = async (req, res) => {
    try {
        const q = (req.query.q || '').trim().slice(0, 200);
        const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);
        if (!q) return res.json({ success: true, data: [] });
        const like = `%${q}%`;
        const [rows] = await withRetry(() => db.query(
            `SELECT
                c.category_id,
                c.category_slug,
                c.category_name,
                CAST(COUNT(DISTINCT l.product_id) AS UNSIGNED) AS product_count
             FROM tbl_products_category c
             LEFT JOIN tbl_products_category_link l ON l.category_id = c.category_id
             WHERE c.category_name LIKE ?
               AND (c.parent_id = 0 OR c.parent_id IS NULL)
             GROUP BY c.category_id, c.category_slug, c.category_name
             ORDER BY product_count DESC
             LIMIT ?`,
            [like, limit]
        ));
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('searchProductCategories error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /store/api/product-categories/:slug/children
// Returns child categories of a given slug with product_count
const getCategoryChildren = async (req, res) => {
    try {
        const { slug } = req.params;
        const [[parent]] = await withRetry(() => db.query(
            `SELECT category_id, parent_id, category_slug, category_name, category_desc
             FROM tbl_products_category WHERE category_slug = ? LIMIT 1`,
            [slug]
        ));
        if (!parent) return res.json({ success: true, parent: null, data: [] });

        const [rows] = await withRetry(() => db.query(
            `SELECT
                c.category_id,
                c.parent_id,
                c.category_slug,
                c.category_name,
                c.category_desc,
                COUNT(DISTINCT l.product_id) AS product_count
             FROM tbl_products_category c
             LEFT JOIN tbl_products_category_link l ON l.category_id = c.category_id
             WHERE c.parent_id = ?
             GROUP BY c.category_id, c.parent_id, c.category_slug, c.category_name, c.category_desc
             ORDER BY c.category_id ASC`,
            [parent.category_id]
        ));
        res.json({ success: true, parent, data: rows });
    } catch (err) {
        console.error('getCategoryChildren error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /store/api/product-categories/:slug/products
// Returns products linked via tbl_products_category_link.product_id → tbl_products.ID
// Includes the category and its direct children
const getCategoryProducts = async (req, res) => {
    try {
        const { slug } = req.params;

        // Resolve category by slug
        const [[cat]] = await withRetry(() => db.query(
            `SELECT category_id, category_name, category_slug, parent_id, category_desc
             FROM tbl_products_category WHERE category_slug = ? LIMIT 1`,
            [slug]
        ));
        if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });

        // Collect this category + all direct children IDs
        const [children] = await withRetry(() => db.query(
            `SELECT category_id FROM tbl_products_category WHERE parent_id = ?`,
            [cat.category_id]
        ));
        const catIds = [cat.category_id, ...children.map(c => c.category_id)];
        const ph = catIds.map(() => '?').join(', ');

        // Fetch published products linked via tbl_products_category_link.product_id
        const [products] = await withRetry(() => db.query(
            `SELECT DISTINCT
                p.ID,
                p.product_title  AS title,
                p.product_url    AS slug,
                p.product_short_desc AS short_description,
                p.menu_order,
                p.product_date_added AS date_added,
                c.category_slug  AS category_slug,
                c.category_name  AS category_name,
                (
                    SELECT m.media_path
                    FROM tbl_productmeta pm
                    JOIN tbl_media m ON m.media_id = CAST(pm.meta_value AS UNSIGNED)
                    WHERE pm.product_id = p.ID AND pm.meta_key = '_thumbnail_id'
                    ORDER BY pm.meta_id DESC LIMIT 1
                ) AS thumbnail_url,
                (SELECT pm.meta_value FROM tbl_productmeta pm WHERE pm.product_id = p.ID AND pm.meta_key = '_regular_price' ORDER BY pm.meta_id DESC LIMIT 1) AS _regular_price,
                (SELECT pm.meta_value FROM tbl_productmeta pm WHERE pm.product_id = p.ID AND pm.meta_key = '_sale_price'    ORDER BY pm.meta_id DESC LIMIT 1) AS _sale_price,
                (SELECT pm.meta_value FROM tbl_productmeta pm WHERE pm.product_id = p.ID AND pm.meta_key = '_sku'           ORDER BY pm.meta_id DESC LIMIT 1) AS sku,
                (
                    SELECT MIN(CAST((
                        SELECT pm2.meta_value FROM tbl_productmeta pm2
                        WHERE pm2.product_id = p2.ID AND pm2.meta_key = '_price' AND pm2.meta_value != ''
                        ORDER BY pm2.meta_id DESC LIMIT 1
                    ) AS DECIMAL(10,2)))
                    FROM tbl_products p2
                    WHERE
                        CASE
                            WHEN EXISTS (SELECT 1 FROM tbl_products v WHERE v.parent_id = p.ID AND v.product_type = 'product_variation')
                            THEN p2.parent_id = p.ID AND p2.product_type = 'product_variation'
                            ELSE p2.ID = p.ID AND p2.product_type = 'product'
                        END
                ) AS price_min,
                (
                    SELECT MAX(CAST((
                        SELECT pm2.meta_value FROM tbl_productmeta pm2
                        WHERE pm2.product_id = p2.ID AND pm2.meta_key = '_price' AND pm2.meta_value != ''
                        ORDER BY pm2.meta_id DESC LIMIT 1
                    ) AS DECIMAL(10,2)))
                    FROM tbl_products p2
                    WHERE
                        CASE
                            WHEN EXISTS (SELECT 1 FROM tbl_products v WHERE v.parent_id = p.ID AND v.product_type = 'product_variation')
                            THEN p2.parent_id = p.ID AND p2.product_type = 'product_variation'
                            ELSE p2.ID = p.ID AND p2.product_type = 'product'
                        END
                ) AS price_max,
                (
                    CASE
                        WHEN EXISTS (SELECT 1 FROM tbl_products v WHERE v.parent_id = p.ID AND v.product_type = 'product_variation')
                        THEN (
                            CASE WHEN EXISTS (
                                SELECT 1 FROM tbl_products v
                                JOIN tbl_productmeta pm ON pm.product_id = v.ID AND pm.meta_key = '_stock_status'
                                WHERE v.parent_id = p.ID AND v.product_type = 'product_variation' AND pm.meta_value = 'instock'
                            ) THEN 'instock' ELSE 'outofstock' END
                        )
                        ELSE COALESCE((SELECT pm.meta_value FROM tbl_productmeta pm WHERE pm.product_id = p.ID AND pm.meta_key = '_stock_status' ORDER BY pm.meta_id DESC LIMIT 1), 'instock')
                    END
                ) AS stock_status,
                (
                    CASE
                        WHEN EXISTS (SELECT 1 FROM tbl_products v WHERE v.parent_id = p.ID AND v.product_type = 'product_variation')
                        THEN NULL
                        ELSE (SELECT pm.meta_value FROM tbl_productmeta pm WHERE pm.product_id = p.ID AND pm.meta_key = '_stock' ORDER BY pm.meta_id DESC LIMIT 1)
                    END
                ) AS stock_qty
             FROM tbl_products p
             JOIN tbl_products_category_link l ON l.product_id = p.ID
             JOIN tbl_products_category c ON c.category_id = l.category_id
             WHERE l.category_id IN (${ph})
               AND p.product_type   = 'product'
               AND p.product_status = 'publish'
               AND (p.parent_id = 0 OR p.parent_id IS NULL)
             ORDER BY p.menu_order ASC, p.product_date_added DESC`,
            catIds
        ));

        res.json({ success: true, category: cat, count: products.length, data: products });
    } catch (err) {
        console.error('getCategoryProducts error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /store/api/products/slug/:slug
const getProductBySlug = async (req, res) => {
    const { slug } = req.params;
    try {
        const [[product]] = await withRetry(() => db.query(`
            SELECT p.ID FROM tbl_products p
            WHERE p.product_url = ? AND p.product_type = 'product' AND p.product_status = 'publish'
            LIMIT 1
        `, [slug]));
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        req.params.id = String(product.ID);
        return getProduct(req, res);
    } catch (err) {
        console.error('getProductBySlug error:', err);
        res.status(500).json({ success: false, message: 'Server error', ...(NODE_ENV !== 'production' ? { error: err.message || String(err), code: err.code || null } : {}) });
    }
};

// Shared SQL fragment: fetch post with its primary category in one query.
// Image source: tbl_media where media_type = 'blog_img' AND parent_id = post ID.
// When admin saves a blog with an image, it inserts a row into tbl_media with
// media_type='blog_img' and parent_id = the post's ID — this query picks it up automatically.
const POST_WITH_CATEGORY_SQL = `
    SELECT
        p.ID,
        p.post_slug,
        p.post_title,
        p.post_content,
        p.post_short_desc,
        p.post_date,
        u.display_name          AS author_name,
        pc.category_name        AS primary_category_name,
        pc.category_id          AS primary_category_id,
        (
            SELECT bm.media_path
            FROM tbl_media bm
            WHERE bm.parent_id  = p.ID
              AND bm.media_type = 'blog_image'
            ORDER BY bm.media_id ASC
            LIMIT 1
        ) AS blog_img_path,
        (SELECT pm1.meta_value FROM tbl_postmeta pm1 WHERE pm1.post_id = p.ID AND pm1.meta_key = 'meta_title'       ORDER BY pm1.meta_id DESC LIMIT 1) AS seo_meta_title,
        (SELECT pm2.meta_value FROM tbl_postmeta pm2 WHERE pm2.post_id = p.ID AND pm2.meta_key = 'meta_description' ORDER BY pm2.meta_id DESC LIMIT 1) AS seo_meta_description,
        (SELECT pm3.meta_value FROM tbl_postmeta pm3 WHERE pm3.post_id = p.ID AND pm3.meta_key = 'canonical_tag'    ORDER BY pm3.meta_id DESC LIMIT 1) AS seo_canonical_tag,
        (SELECT pm4.meta_value FROM tbl_postmeta pm4 WHERE pm4.post_id = p.ID AND pm4.meta_key = 'meta_index'       ORDER BY pm4.meta_id DESC LIMIT 1) AS seo_meta_index
    FROM tbl_posts p
    LEFT JOIN tbl_users u
        ON u.ID = p.user_id
    LEFT JOIN (
        SELECT post_id, MIN(category_id) AS category_id
        FROM tbl_posts_category_link
        GROUP BY post_id
    ) pl ON pl.post_id = p.ID
    LEFT JOIN tbl_posts_category pc
        ON pc.category_id = pl.category_id
`;

const DEFAULT_BLOG_LIMIT = 24;
const MAX_BLOG_LIMIT = 100;

const clampBlogLimit = (value) => {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BLOG_LIMIT;
    return Math.min(parsed, MAX_BLOG_LIMIT);
};

// GET /store/api/blogs
const getBlogs = async (req, res) => {
    try {
        const limit = clampBlogLimit(req.query.limit);
        const categorySlug = req.query.category ? String(req.query.category).trim() : null;
        const limitClause = Number.isFinite(limit) ? 'LIMIT ?' : '';

        let rows;
        if (categorySlug) {
            // Resolve slug to category_id using the same toSlug() logic as getBlogCategories,
            // so ALL special characters are handled consistently.
            const [allCats] = await db.query(
                'SELECT category_id, category_name FROM tbl_posts_category'
            );
            const matchedCat = allCats.find((c) => toSlug(c.category_name) === categorySlug);
            if (!matchedCat) {
                return res.json({ success: true, count: 0, data: [] });
            }
            const params = [matchedCat.category_id, ...(Number.isFinite(limit) ? [limit] : [])];
            [rows] = await withRetry(() => db.query(`
                ${POST_WITH_CATEGORY_SQL}
                WHERE p.post_type = 'post' AND p.post_status = 'publish'
                  AND EXISTS (
                      SELECT 1
                      FROM tbl_posts_category_link fl
                      WHERE fl.post_id = p.ID AND fl.category_id = ?
                  )
                ORDER BY p.menu_order ASC, p.post_date DESC
                ${limitClause}
            `, params));
        } else {
            const params = Number.isFinite(limit) ? [limit] : [];
            [rows] = await withRetry(() => db.query(`
                ${POST_WITH_CATEGORY_SQL}
                WHERE p.post_type = 'post' AND p.post_status = 'publish'
                ORDER BY p.menu_order ASC, p.post_date DESC
                ${limitClause}
            `, params));
        }

        const data = rows.map((row) => normalizePost(row));
        res.json({ success: true, count: data.length, data });
    } catch (err) {
        console.error('getBlogs error:', err);
        res.status(500).json({ success: false, message: 'Server error', ...(NODE_ENV !== 'production' ? { error: err.message || String(err), code: err.code || null } : {}) });
    }
};

// GET /store/api/blog-categories
const getBlogCategories = async (req, res) => {
    try {
        const [rows] = await withRetry(() => db.query(`
            SELECT c.category_id, c.category_name,
                   COUNT(DISTINCT p.ID) AS post_count
            FROM tbl_posts_category c
            LEFT JOIN tbl_posts_category_link l ON l.category_id = c.category_id
            LEFT JOIN tbl_posts p ON p.ID = l.post_id
                AND p.post_type = 'post' AND p.post_status = 'publish'
            GROUP BY c.category_id, c.category_name
            ORDER BY c.category_name ASC
        `));
        const data = rows.map((row) => ({
            category_id:   row.category_id,
            category_name: row.category_name,
            category_slug: toSlug(row.category_name),
            post_count:    Number(row.post_count) || 0,
        }));
        res.json({ success: true, count: data.length, data });
    } catch (err) {
        console.error('getBlogCategories error:', err);
        res.status(500).json({ success: false, message: 'Server error', ...(NODE_ENV !== 'production' ? { error: err.message || String(err), code: err.code || null } : {}) });
    }
};

// GET /store/api/blogs/slug/:slug
const getBlogBySlug = async (req, res) => {
    const { slug } = req.params;
    try {
        const [[row]] = await withRetry(() => db.query(`
            ${POST_WITH_CATEGORY_SQL}
            WHERE p.post_type = 'post' AND p.post_status = 'publish' AND p.post_slug = ?
            LIMIT 1
        `, [slug]));
        if (!row) return res.status(404).json({ success: false, message: 'Blog not found' });
        res.json({ success: true, data: normalizePost(row) });
    } catch (err) {
        console.error('getBlogBySlug error:', err);
        res.status(500).json({ success: false, message: 'Server error', ...(NODE_ENV !== 'production' ? { error: err.message || String(err), code: err.code || null } : {}) });
    }
};

// GET /store/api/pages
const getPages = async (_req, res) => {
    try {
        const [rows] = await withRetry(() => db.query(`
            SELECT
                p.post_slug, p.post_title, p.post_content, p.post_short_desc, p.post_date,
                p.menu_order,
                (
                    SELECT m.media_path FROM tbl_media m
                    WHERE m.parent_id = p.ID AND m.media_type = 'blog_image'
                    ORDER BY m.media_id DESC LIMIT 1
                ) AS page_img_path,
                (SELECT pm1.meta_value FROM tbl_postmeta pm1 WHERE pm1.post_id = p.ID AND pm1.meta_key = 'meta_title'       ORDER BY pm1.meta_id DESC LIMIT 1) AS seo_meta_title,
                (SELECT pm2.meta_value FROM tbl_postmeta pm2 WHERE pm2.post_id = p.ID AND pm2.meta_key = 'meta_description' ORDER BY pm2.meta_id DESC LIMIT 1) AS seo_meta_description,
                (SELECT pm3.meta_value FROM tbl_postmeta pm3 WHERE pm3.post_id = p.ID AND pm3.meta_key = 'canonical_tag'    ORDER BY pm3.meta_id DESC LIMIT 1) AS seo_canonical_tag,
                (SELECT pm4.meta_value FROM tbl_postmeta pm4 WHERE pm4.post_id = p.ID AND pm4.meta_key = 'meta_index'       ORDER BY pm4.meta_id DESC LIMIT 1) AS seo_meta_index
            FROM tbl_posts p
            WHERE p.post_type = 'page' AND p.post_status = 'publish'
            ORDER BY p.menu_order ASC, p.post_date DESC
        `));
        const data = rows.map((row) => normalizePage(row));
        res.json({ success: true, count: data.length, data });
    } catch (err) {
        console.error('getPages error:', err);
        res.status(500).json({ success: false, message: 'Server error', ...(NODE_ENV !== 'production' ? { error: err.message || String(err), code: err.code || null } : {}) });
    }
};

// GET /store/api/pages/slug/:slug
const getPageBySlug = async (req, res) => {
    const { slug } = req.params;
    try {
        const [[row]] = await withRetry(() => db.query(`
            SELECT
                p.post_slug, p.post_title, p.post_content, p.post_short_desc, p.post_date,
                (
                    SELECT m.media_path FROM tbl_media m
                    WHERE m.parent_id = p.ID AND m.media_type = 'blog_image'
                    ORDER BY m.media_id DESC LIMIT 1
                ) AS page_img_path,
                (SELECT pm1.meta_value FROM tbl_postmeta pm1 WHERE pm1.post_id = p.ID AND pm1.meta_key = 'meta_title'       ORDER BY pm1.meta_id DESC LIMIT 1) AS seo_meta_title,
                (SELECT pm2.meta_value FROM tbl_postmeta pm2 WHERE pm2.post_id = p.ID AND pm2.meta_key = 'meta_description' ORDER BY pm2.meta_id DESC LIMIT 1) AS seo_meta_description,
                (SELECT pm3.meta_value FROM tbl_postmeta pm3 WHERE pm3.post_id = p.ID AND pm3.meta_key = 'canonical_tag'    ORDER BY pm3.meta_id DESC LIMIT 1) AS seo_canonical_tag,
                (SELECT pm4.meta_value FROM tbl_postmeta pm4 WHERE pm4.post_id = p.ID AND pm4.meta_key = 'meta_index'       ORDER BY pm4.meta_id DESC LIMIT 1) AS seo_meta_index
            FROM tbl_posts p
            WHERE p.post_type = 'page' AND p.post_status = 'publish' AND p.post_slug = ?
            LIMIT 1
        `, [slug]));
        if (!row) return res.status(404).json({ success: false, message: 'Page not found' });
        res.json({ success: true, data: normalizePage(row) });
    } catch (err) {
        console.error('getPageBySlug error:', err);
        res.status(500).json({ success: false, message: 'Server error', ...(NODE_ENV !== 'production' ? { error: err.message || String(err), code: err.code || null } : {}) });
    }
};

module.exports = {
    getPublicSiteSettings,
    getProducts,
    getFeaturedProducts,
    getOnSaleProducts,
    getBestSellerProducts,
    getProduct,
    getProductBySlug,
    getColors,
    getAttributesByTaxonomy,
    getAllAttributeGroups,
    getProductCategories,
    searchProductCategories,
    getCategoryChildren,
    getCategoryProducts,
    getBlogs,
    getBlogBySlug,
    getBlogCategories,
    getPages,
    getPageBySlug,
};