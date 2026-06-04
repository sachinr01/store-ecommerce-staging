/**
 * mediaController.js
 *
 * Full relationship map:
 *
 *  tbl_products p (product_type='product', parent_id=0)
 *    │
 *    ├─ tbl_productmeta  meta_key='_thumbnail_id'            → media_id  (parent thumbnail)
 *    ├─ tbl_productmeta  meta_key='_product_image_gallery'   → "id,id,id" (parent gallery)
 *    │
 *    └─ tbl_products v (product_type='product_variation', parent_id=p.ID)
 *         ├─ tbl_productmeta  meta_key='attribute_pa_color'              → color slug
 *         ├─ tbl_productmeta  meta_key='_thumbnail_id'                   → media_id (color thumb)
 *         └─ tbl_productmeta  meta_key='woo_variation_gallery_images'    → PHP serialized ids
 *
 *  tbl_media m
 *    m.pareameta (mm)                                                          │
 *    mm.media_id  = m.media_id                                                │
 *    mm.meta_key  = '_wp_attached_file' → mm.meta_value = 'products/file.jpg'─┘
 *
 *  Full image URL = /uploads/ + mm.meta_value
 */

const db   = require('../config/db');
const NODE_ENV    = process.env.NODE_ENV || 'development';
const UPLOADS_BASE = '/uploads';

const toUrl = (filePath) => (filePath ? `${UPLOADS_BASE}/${filePath}` : null);

function errRes(res, err, label) {
    console.error(`[mediaController] ${label}:`, err);
    return res.status(500).json({
        success: false,
        message: 'Server error',
        ...(NODE_ENV !== 'production' ? { error: err.message, code: err.code || null } : {}),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/media/products
//
// Returns every published parent product with its thumbnail + gallery images,
// fully resolved from tbl_productmeta → tbl_media → tbl_mediameta.
//
// Query params:
//   ?limit=20&offset=0
// ─────────────────────────────────────────────────────────────────────────────
const getProductsWithImages = async (req, res) => {
    const limit  = Math.min(parseInt(req.query.limit,  10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0,  0);

    try {
        // Step 1 – fetch all published parent products
        const [products] = await db.query(
            `SELECT
                p.ID            AS product_id,
                p.product_title AS title,
                p.product_url   AS slug,
                p.product_status,
                p.menu_order,
                thumb_pm.meta_value  AS thumbnail_id,
                gal_pm.meta_value    AS gallery_ids
             FROM tbl_products p
             LEFT JOIN tbl_productmeta thumb_pm
                    ON thumb_pm.product_id = p.ID
                   AND thumb_pm.meta_key   = '_thumbnail_id'
             LEFT JOIN tbl_productmeta gal_pm
                    ON gal_pm.product_id = p.ID
                   AND gal_pm.meta_key   = '_product_image_gallery'
             WHERE p.product_type   = 'product'
               AND p.product_status = 'publish'
               AND (p.parent_id = 0 OR p.parent_id IS NULL)
             ORDER BY p.menu_order ASC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        if (!products.length) return res.json({ success: true, count: 0, data: [] });

        // Step 2 – collect all media IDs referenced by thumbnail_id + gallery_ids
        const allMediaIds = new Set();
        for (const p of products) {
            if (p.thumbnail_id) allMediaIds.add(Number(p.thumbnail_id));
            if (p.gallery_ids) {
                p.gallery_ids.split(',').forEach(id => {
                    const n = Number(id.trim());
                    if (n > 0) allMediaIds.add(n);
                });
            }
        }

        // Step 3 – single JOIN query to resolve all media IDs at once
        const urlMap = await resolveMediaMap([...allMediaIds]);

        // Step 4 – attach resolved images to each product
        const data = products.map(p => {
            const thumbId  = p.thumbnail_id ? Number(p.thumbnail_id) : null;
            const galIds   = p.gallery_ids
                ? p.gallery_ids.split(',').map(id => Number(id.trim())).filter(Boolean)
                : [];

            return {
                product_id:    p.product_id,
                title:         p.title,
                slug:          p.slug,
                product_status: p.product_status,
                menu_order:    p.menu_order,
                thumbnail:     thumbId ? (urlMap[thumbId] || null) : null,
                gallery:       galIds.map(id => urlMap[id]).filter(Boolean),
            };
        });

        res.json({ success: true, count: data.length, data });
    } catch (err) {
        errRes(res, err, 'getProductsWithImages');
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/media/product/:productId
//
// Full image data for one product:
//   - thumbnail  (from _thumbnail_id in tbl_productmeta)
//   - gallery    (from _product_image_gallery in tbl_productmeta)
//   - attached   (all tbl_media rows where parent_id = productId)
//
// All three sources are joined through tbl_media + tbl_mediameta.
// ─────────────────────────────────────────────────────────────────────────────
const getProductMedia = async (req, res) => {
    const productId = Number(req.params.productId);
    if (!productId) return res.status(400).json({ success: false, message: 'Invalid product id' });

    try {
        // Verify product exists
        const [[product]] = await db.query(
            `SELECT ID, product_title AS title, product_url AS slug
             FROM tbl_products WHERE ID = ? AND product_status = 'publish' LIMIT 1`,
            [productId]
        );
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        // Pull _thumbnail_id and _product_image_gallery from productmeta
        const [metaRows] = await db.query(
            `SELECT meta_key, meta_value
             FROM tbl_productmeta
             WHERE product_id = ?
               AND meta_key IN ('_thumbnail_id', '_product_image_gallery')`,
            [productId]
        );

        const metaMap = {};
        for (const r of metaRows) metaMap[r.meta_key] = r.meta_value;

        const thumbnailId = metaMap['_thumbnail_id'] ? Number(metaMap['_thumbnail_id']) : null;
        const galleryIds  = metaMap['_product_image_gallery']
            ? metaMap['_product_image_gallery'].split(',').map(Number).filter(Boolean)
            : [];

        // Also fetch all media directly attached via parent_id (covers newly uploaded images)
        const [attachedRows] = await db.query(
            `SELECT
                m.media_id,
                m.media_title,
                m.media_type,
                m.media_mime_type,
                m.date_added,
                m.media_order,
                mm.meta_value AS file_path
             FROM tbl_media m
             LEFT JOIN tbl_mediameta mm
                    ON mm.media_id = m.media_id
                   AND mm.meta_key = '_wp_attached_file'
             WHERE m.parent_id = ?
             ORDER BY m.media_order ASC, m.date_added ASC`,
            [productId]
        );

        // Collect all IDs we need to resolve (thumbnail + gallery)
        const resolveIds = [...new Set([...(thumbnailId ? [thumbnailId] : []), ...galleryIds])];
        const urlMap     = await resolveMediaMap(resolveIds);

        const thumbnail = thumbnailId ? (urlMap[thumbnailId] || null) : null;
        const gallery   = galleryIds.map(id => urlMap[id]).filter(Boolean);

        // Attached images (parent_id based) – deduplicate against gallery
        const galleryIdSet = new Set(galleryIds);
        const attached = attachedRows.map(r => ({
            media_id:        r.media_id,
            media_title:     r.media_title,
            media_type:      r.media_type,
            media_mime_type: r.media_mime_type,
            date_added:      r.date_added,
            file_path:       r.file_path || null,
            url:             toUrl(r.file_path),
            is_thumbnail:    r.media_id === thumbnailId,
            in_gallery:      galleryIdSet.has(r.media_id),
        }));

        res.json({
            success: true,
            data: {
                product_id: productId,
                title:      product.title,
                slug:       product.slug,
                thumbnail,
                gallery,
                attached,
            },
        });
    } catch (err) {
        errRes(res, err, 'getProductMedia');
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/media/:id
//
// Single media item with all its meta key/value pairs.
// ─────────────────────────────────────────────────────────────────────────────
const getMediaById = async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid media id' });

    try {
        const [[media]] = await db.query(
            `SELECT
                m.media_id,
                m.author_id,
                m.parent_id,
                m.media_title,
                m.media_status,
                m.media_type,
                m.media_mime_type,
                m.date_added,
                m.date_modified,
                m.media_order,
                p.product_title AS product_title,
                p.product_url   AS product_slug
             FROM tbl_media m
             LEFT JOIN tbl_products p ON p.ID = m.parent_id
             WHERE m.media_id = ?`,
            [id]
        );
        if (!media) return res.status(404).json({ success: false, message: 'Media not found' });

        const [metaRows] = await db.query(
            `SELECT meta_id, meta_key, meta_value FROM tbl_mediameta WHERE media_id = ?`,
            [id]
        );

        const meta = {};
        for (const r of metaRows) meta[r.meta_key] = r.meta_value;

        const filePath = meta['_wp_attached_file'] || null;

        res.json({
            success: true,
            data: {
                ...media,
                file_path: filePath,
                url:       toUrl(filePath),
                meta,
            },
        });
    } catch (err) {
        errRes(res, err, 'getMediaById');
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/media/resolve?ids=1,2,3
//
// Batch-resolve media IDs → { media_id, url, file_path, ... }
// Used by the frontend to resolve thumbnail_id / gallery_ids without
// making N individual requests.
// ─────────────────────────────────────────────────────────────────────────────
const resolveMediaIds = async (req, res) => {
    const raw = String(req.query.ids || '');
    const ids = raw.split(',').map(Number).filter(n => n > 0);
    if (!ids.length) return res.status(400).json({ success: false, message: 'Provide ?ids=1,2,3' });

    try {
        const urlMap = await resolveMediaMap(ids);
        res.json({ success: true, data: urlMap });
    } catch (err) {
        errRes(res, err, 'resolveMediaIds');
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper
//
// Given an array of media_ids, returns a map:
//   { [media_id]: { media_id, media_title, media_mime_type, file_path, url } }
//
// JOIN path:
//   tbl_media  →  tbl_mediameta (meta_key = '_wp_attached_file')
//   tbl_media  →  tbl_products  (parent_id, for product context)
// ─────────────────────────────────────────────────────────────────────────────
async function resolveMediaMap(ids) {
    if (!ids || ids.length === 0) return {};
    const clean = ids.map(Number).filter(n => !isNaN(n) && n > 0);
    if (!clean.length) return {};

    const placeholders = clean.map(() => '?').join(', ');
    const [rows] = await db.query(
        `SELECT
            m.media_id,
            m.media_title,
            m.media_type,
            m.media_mime_type,
            m.date_added,
            m.parent_id,
            mm.meta_value AS file_path
         FROM tbl_media m
         LEFT JOIN tbl_mediameta mm
                ON mm.media_id = m.media_id
               AND mm.meta_key = '_wp_attached_file'
         WHERE m.media_id IN (${placeholders})`,
        clean
    );

    const map = {};
    for (const r of rows) {
        map[r.media_id] = {
            media_id:        r.media_id,
            media_title:     r.media_title,
            media_type:      r.media_type,
            media_mime_type: r.media_mime_type,
            date_added:      r.date_added,
            parent_id:       r.parent_id,
            file_path:       r.file_path || null,
            url:             toUrl(r.file_path),
        };
    }
    return map;
}

module.exports = { getProductsWithImages, getProductMedia, getMediaById, resolveMediaIds };
