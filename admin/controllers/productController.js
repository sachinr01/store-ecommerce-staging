const db = require("../config/db");
const dd = require("../helpers/dd");
const path = require("path");
const fs = require("fs");
const { exit } = require("process");

// ─── HELPER: Load all attribute types with their values ──────────────────────
const getAttributeTypes = async (productId) => {
  if (productId) {
    // Get only taxonomies used by this product
    const [usedTaxonomies] = await db.query(
      `SELECT DISTINCT taxonomy FROM tbl_attributes_lookup WHERE product_or_parent_id = ?`,
      [productId],
    );

    if (!usedTaxonomies.length) {
      return [];
    }

    // 'pa_color' → 'color', 'pa_size' → 'size'
    const typeNames = usedTaxonomies.map(function (row) {
      return row.taxonomy.replace("pa_", "");
    });

    const ph = typeNames
      .map(function () {
        return "?";
      })
      .join(",");

    const [types] = await db.query(
      `SELECT * FROM tbl_attribute_type
       WHERE attribute_type_name IN (` +
        ph +
        `)
       ORDER BY attribute_type_order ASC`,
      typeNames,
    );

    // Load values for each type
    for (const type of types) {
      const taxonomy = "pa_" + type.attribute_type_name;

      // Get attr_ids from lookup for this product + taxonomy
      const [lookupAttrRows] = await db.query(
        `SELECT DISTINCT attr_id FROM tbl_attributes_lookup
         WHERE product_or_parent_id = ? AND taxonomy = ?
         ORDER BY attr_id ASC`,
        [productId, taxonomy],
      );

      if (!lookupAttrRows.length) {
        type.values = [];
        continue;
      }

      const attrIds = lookupAttrRows.map(function (r) {
        return r.attr_id;
      });
      const attrPh = attrIds
        .map(function () {
          return "?";
        })
        .join(",");

      // Get attr name + slug for those IDs
      const [values] = await db.query(
        `SELECT a.attr_id, a.attr_name, a.attr_slug, am.meta_value AS sort_order
         FROM tbl_attributes a
         LEFT JOIN tbl_attributemeta am ON am.attr_id = a.attr_id
           AND am.meta_key = ?
         WHERE a.attr_id IN (` +
          attrPh +
          `)
         ORDER BY CAST(am.meta_value AS UNSIGNED) ASC`,
        [`order_pa_${type.attribute_type_name}`, ...attrIds],
      );

      type.values = values; // ← set values on type
    }
    // ← return AFTER the loop, not inside it
    return types;
  } else {
    // No productId = Add page, return ALL attribute types with ALL values
    const [types] = await db.query(
      `SELECT * FROM tbl_attribute_type ORDER BY attribute_type_order ASC`,
    );

    for (const type of types) {
      const [values] = await db.query(
        `SELECT a.attr_id, a.attr_name, a.attr_slug, am.meta_value AS sort_order
         FROM tbl_attributes a
         LEFT JOIN tbl_attributemeta am ON am.attr_id = a.attr_id
           AND am.meta_key = ?
         WHERE am.meta_key = ?
         ORDER BY CAST(am.meta_value AS UNSIGNED) ASC`,
        [
          `order_pa_${type.attribute_type_name}`,
          `order_pa_${type.attribute_type_name}`,
        ],
      );
      type.values = values;
    }

    return types;
  }
};

// ─── HELPER: Upsert productmeta ───────────────────────────────────────────────
const upsertMeta = async (productId, key, value) => {
  await db.query(
    `
        INSERT INTO tbl_productmeta (product_id, meta_key, meta_value)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)
    `,
    [productId, key, value],
  );
};

// ─── LIST PRODUCTS ────────────────────────────────────────────────────────────
const showProducts = async (req, res) => {
  try {
    const status = req.query.status || null;
    const type = req.query.type || null;

    let where = "WHERE p.parent_id = 0";
    const params = [];

    if (status) {
      where += " AND p.product_status = ?";
      params.push(status);
    }

    if (type) {
      where += " AND p.product_type = ?";
      params.push(type);
    }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM tbl_products p ${where}`,
      params,
    );

    const [products] = await db.query(
      `
  SELECT 
  p.*,

  (
    SELECT pm.meta_value
    FROM tbl_productmeta pm
    WHERE pm.product_id = p.ID
      AND pm.meta_key = '_regular_price'
    ORDER BY pm.meta_id DESC
    LIMIT 1
  ) AS regular_price,

  (
    SELECT pm.meta_value
    FROM tbl_productmeta pm
    WHERE pm.product_id = p.ID
      AND pm.meta_key = '_sale_price'
    ORDER BY pm.meta_id DESC
    LIMIT 1
  ) AS sale_price,

  (
    SELECT pm.meta_value
    FROM tbl_productmeta pm
    WHERE pm.product_id = p.ID
      AND pm.meta_key = '_sku'
    ORDER BY pm.meta_id DESC
    LIMIT 1
  ) AS sku,

  (
    SELECT pm.meta_value
    FROM tbl_productmeta pm
    WHERE pm.product_id = p.ID
      AND pm.meta_key = '_stock'
    ORDER BY pm.meta_id DESC
    LIMIT 1
  ) AS stock,

  (
    SELECT pm.meta_value
    FROM tbl_productmeta pm
    WHERE pm.product_id = p.ID
      AND pm.meta_key = '_stock_status'
    ORDER BY pm.meta_id DESC
    LIMIT 1
  ) AS stock_status,

  (
    SELECT m2.media_path
    FROM tbl_media m2
    WHERE m2.parent_id = p.ID
      AND m2.media_type = 'product_image'
    ORDER BY m2.media_id ASC
    LIMIT 1
  ) AS thumbnail

FROM tbl_products p

${where}

ORDER BY p.product_date_added DESC

  `,
      params,
    );

    res.render("products/index", {
      title: "Products",
      products,
      totalProducts: total,
      success: req.query.success || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error("Products Error:", err.message);
    res.status(500).send("Server Error: " + err.message);
  }
};

// ─── SHOW ADD FORM ────────────────────────────────────────────────────────────
const showAddProduct = async (req, res) => {
  try {
    const attributeTypes = await getAttributeTypes();

    const [categories] = await db.query("SELECT * FROM tbl_products_category");

    res.render("products/add", {
      title: "Add Product",
      allCategories: categories,
      product: false,
      variations: [],
      attributeTypes,
      selectedAttributes: {},
      errors: null,
    });
  } catch (err) {
    console.error("Add Product Error:", err.message);
    res.status(500).send("Server Error: " + err.message);
  }
};

// ─── SHOW EDIT PRODUCT ────────────────────────────────────────────────────────
const showEditProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // STEP 1: Get main product
    const [[product]] = await db.query(
      "SELECT * FROM tbl_products WHERE ID = ?",
      [id],
    );
    if (!product) {
      return res.redirect("/store/admin/products?error=Product not found");
    }

    // STEP 2: Get main product meta
    const [mainMetaRows] = await db.query(
      "SELECT meta_key, meta_value FROM tbl_productmeta WHERE product_id = ?",
      [id],
    );
    const mainMeta = {};
    mainMetaRows.forEach((row) => {
      mainMeta[row.meta_key] = row.meta_value;
    });

    product.sku = mainMeta["_sku"] || "";
    product.regular_price =
      mainMeta["_regular_price"] || mainMeta["_price"] || "";
    product.sale_price = mainMeta["_sale_price"] || "";
    product.stock = mainMeta["_stock"] || "";
    product.stock_status = mainMeta["_stock_status"] || "instock";
    product.weight = mainMeta["_weight"] || "";
    product.length = mainMeta["_length"] || "";
    product.width = mainMeta["_width"] || "";
    product.backorders = mainMeta["_backorders"] || "no";
    product.product_features = mainMeta["_product_features"] || "";
    product.product_material = mainMeta["_product_material"] || "";
    product.product_collection = mainMeta["_product_collection"] || "";
    product.product_included = mainMeta["_product_included"] || "";
    product.product_care = mainMeta["_product_care"] || "";
    product.product_more_info = mainMeta["_product_more_info"] || "";
    product.meta_title = mainMeta["meta_title"] || "";
    product.meta_description = mainMeta["meta_description"] || "";
    product.canonical_tag = mainMeta["canonical_tag"] || "";
    product.meta_index = mainMeta["meta_index"] || "";
    product.sale_price_dates_from = mainMeta["_sale_price_dates_from"] || "";
    product.sale_price_dates_to   = mainMeta["_sale_price_dates_to"]   || "";
    product.weight   = mainMeta["weight"]   || "";
    product.length   = mainMeta["length"]   || "";
    product.breadth  = mainMeta["breadth"]  || "";
    product.height   = mainMeta["height"]   || "";

    // ── Main product thumbnail ──────────────────────────────
    // Read media_path directly from tbl_media(no _wp_attached_file in mediameta)
    product.thumbnail = "";
    product.thumbnailId = mainMeta["_thumbnail_id"] || "";

    if (product.thumbnailId) {
      const [[thumbMedia]] = await db.query(
        `SELECT 
      m.media_path,
      m.media_title,
      alt.meta_value   AS alt_text
      FROM tbl_media m
      LEFT JOIN tbl_mediameta alt 
        ON alt.media_id = m.media_id 
        AND alt.meta_key = '_wp_attachment_image_alt'
      WHERE m.media_id = ?
       AND m.media_type = 'product_image'`,
        [product.thumbnailId],
      );
      if (thumbMedia && thumbMedia.media_path) {
        product.thumbnail = thumbMedia.media_path || "";
        product.title = thumbMedia.media_title || "";
        product.alt = thumbMedia.alt_text || "";
      }
    }

    // ── Main product gallery images ─────────────────────────
    // All product_image rows for this parent except the thumbnail
    const [galleryRows] = await db.query(
      `SELECT m.media_id, m.media_title, m.media_path,
              alt.meta_value   AS alt_text
       FROM tbl_media m
       LEFT JOIN tbl_mediameta alt ON alt.media_id = m.media_id AND alt.meta_key = '_wp_attachment_image_alt'
       WHERE m.parent_id = ? AND m.media_type = 'product_image'
       ORDER BY m.media_id ASC`,
      [id],
    );
    product.gallery = galleryRows
      .filter(
        (r) =>
          r.media_path && String(r.media_id) !== String(product.thumbnailId),
      )
      .map((r) => ({
        media_id: r.media_id,
        url: r.media_path,
        title: r.media_title || "",
        alt: r.alt_text || "",
      }));

    // STEP 3: Get all variation products + their meta
    const [variationProducts] = await db.query(
      "SELECT * FROM tbl_products WHERE parent_id = ? ORDER BY menu_order ASC",
      [id],
    );

    const variations = [];

    for (const v of variationProducts) {
      const [varMetaRows] = await db.query(
        "SELECT meta_key, meta_value FROM tbl_productmeta WHERE product_id = ?",
        [v.ID],
      );
      const vm = {};
      varMetaRows.forEach((row) => {
        vm[row.meta_key] = row.meta_value;
      });

      v.sku = vm["_sku"] || "";
      v.regular_price = vm["_regular_price"] || vm["_price"] || "";
      v.sale_price = vm["_sale_price"] || "";
      v.stock = vm["_stock"] || "0";
      v.stock_status = vm["_stock_status"] || "instock";
      v.weight = vm["_weight"] || "";
      v.manage_stock = vm["_manage_stock"] || "no";
      v.downloadable = vm["_downloadable"] || "no";
      v.virtual = vm["_virtual"] || "no";
      v.enabled = vm["_variation_is_active"] || "yes";
      v.variation_description = vm["_variation_description"] || "";

      v.thumbnail_url = "";
      v.thumbnailId = vm["_thumbnail_id"] || "";
      v.gallery = [];

      // Build attr_meta from meta keys starting with "attribute_pa_"
      v.attr_meta = {};
      varMetaRows
        .filter((row) => row.meta_key.startsWith("attribute_pa_"))
        .sort((a, b) => a.meta_key.localeCompare(b.meta_key))
        .forEach((row) => {
          v.attr_meta[row.meta_key] = row.meta_value;
        });

      // Build combo string
      v.combo = Object.entries(v.attr_meta)
        .map((entry) => entry[0].replace("attribute_", "") + ":" + entry[1])
        .join(",");

      // Get attr_ids from lookup
      const [vLookupRows] = await db.query(
        "SELECT DISTINCT attr_id FROM tbl_attributes_lookup WHERE product_id = ? ORDER BY attr_id ASC",
        [v.ID],
      );
      v.attr_ids = vLookupRows.map((r) => r.attr_id).join(",");

      // Fallback: resolve from slugs if lookup empty
      if (!vLookupRows.length && Object.keys(v.attr_meta).length) {
        const slugs = Object.values(v.attr_meta).filter(Boolean);
        if (slugs.length) {
          const ph = slugs.map(() => "?").join(",");
          const [slugRows] = await db.query(
            "SELECT attr_id FROM tbl_attributes WHERE attr_slug IN (" +
              ph +
              ")",
            slugs,
          );
          v.attr_ids = slugRows.map((r) => r.attr_id).join(",");
        }
      }

      // ── Variation thumbnail: read media_path from tbl_media──
      if (v.thumbnailId) {
        const [[vThumb]] = await db.query(
          `SELECT 
      m.media_path,
      m.media_title,
      alt.meta_value AS alt_text
      FROM tbl_media m
      LEFT JOIN tbl_mediameta alt 
        ON alt.media_id = m.media_id 
        AND alt.meta_key = '_wp_attachment_image_alt'
      WHERE m.media_id = ?
       AND m.media_type = 'product_image'`,
          [v.thumbnailId],
        );

        if (vThumb && vThumb.media_path) {
          v.thumbnail_url = vThumb.media_path || "";
          v.title = vThumb.media_title || "";
          v.alt = vThumb.alt_text || "";
        }
      }

      // ── Variation gallery images ─────────────────────────────
      const [vGalleryRows] = await db.query(
        `SELECT m.media_id, m.media_title, m.media_path,
                alt.meta_value AS alt_text
         FROM tbl_media m
         LEFT JOIN tbl_mediameta alt ON alt.media_id = m.media_id AND alt.meta_key = '_wp_attachment_image_alt'
         WHERE m.parent_id = ? AND m.media_type = 'product_image'
         ORDER BY m.media_id ASC`,
        [v.ID],
      );
      v.gallery = vGalleryRows
        .filter(
          (r) => r.media_path && String(r.media_id) !== String(v.thumbnailId),
        )
        .map((r) => ({
          media_id: r.media_id,
          url: r.media_path,
          title: r.media_title || "",
          alt: r.alt_text || "",
        }));

      variations.push(v);
    }

    // STEP 4: Build selectedAttributes from tbl_attributes_lookup
    const selectedAttributes = {};
    const [lookupRows] = await db.query(
      `SELECT DISTINCT taxonomy, attr_id, is_variation_attribute
       FROM tbl_attributes_lookup
       WHERE product_or_parent_id = ?
       ORDER BY taxonomy, attr_id`,
      [id],
    );

    for (const row of lookupRows) {
      if (!selectedAttributes[row.taxonomy]) {
        selectedAttributes[row.taxonomy] = {
          value_ids: [],
          is_variation: row.is_variation_attribute,
        };
      }
      selectedAttributes[row.taxonomy].value_ids.push(String(row.attr_id));
    }

    // STEP 5: Get attribute types with all their values
    const attributeTypes = await getAttributeTypes();

    const [categories] = await db.query("SELECT * FROM tbl_products_category");

    const [productCatRows] = await db.query(
      "SELECT category_id FROM tbl_products_category_link WHERE product_id = ?",
      [id],
    );

    product.categories = productCatRows.map((r) => r.category_id);

    // STEP 6: Render
    res.render("products/add", {
      title: "Edit Product",
      allCategories: categories,
      product,
      variations,
      attributeTypes,
      selectedAttributes,
      isEdit: true,
      errors: null,
    });
  } catch (err) {
    console.error("showEditProduct error:", err.message);
    res.status(500).send("Server Error: " + err.message);
  }
};

// ─── STORE NEW PRODUCT ────────────────────────────────────────────────────────
const storeProduct = async (req, res) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const body = req.body;
    const authorId = req.session.admin.id;

    const slug =
      body.product_url ||
      (body.product_title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    const guid = Date.now() + "-" + Math.random().toString(36).substr(2, 9);

    // ═══════════════════════════════════════════════════════
    // STEP 1: INSERT MAIN PRODUCT
    // ═══════════════════════════════════════════════════════
    const [result] = await conn.query(
      `INSERT INTO tbl_products
         (author_id, parent_id, product_url, product_title, product_content,
          product_short_desc, product_status, product_type, product_password, guid, menu_order,
          product_date_added, product_date_modified)
       VALUES (?, 0, ?, ?, ?, ?, ?, ?, '', ?, ?, NOW(), NOW())`,
      [
        authorId,
        slug,
        body.product_title,
        body.product_content || "",
        body.product_short_desc || "",
        body.product_status || "draft",
        body.product_type || "product",
        guid,
        body.menu_order || 0,
      ],
    );
    const productId = result.insertId;

    // STEP 2: Categories (move here)

    const categories = [].concat(body.categories || []);

    for (let catId of categories) {
      await conn.query(
        `INSERT INTO tbl_products_category_link (product_id, category_id) VALUES (?, ?)`,
        [productId, catId],
      );
    }

    // ═══════════════════════════════════════════════════════
    // STEP 2: INSERT MAIN PRODUCT META
    // ═══════════════════════════════════════════════════════
    const insertMeta = async (pid, key, value) => {
      await conn.query(
        "INSERT INTO tbl_productmeta (product_id, meta_key, meta_value) VALUES (?, ?, ?)",
        [pid, key, value || ""],
      );
    };

    await insertMeta(productId, "_sku", body.sku);
    await insertMeta(productId, "_regular_price", body.regular_price);
    await insertMeta(productId, "_sale_price", body.sale_price);
    await insertMeta(
      productId,
      "_price",
      body.sale_price || body.regular_price,
    );
    await insertMeta(
      productId,
      "_sale_price_dates_from",
      body.sale_price_dates_from,
    );
    await insertMeta(
      productId,
      "_sale_price_dates_to",
      body.sale_price_dates_to,
    );
    await insertMeta(productId, "_stock", body.stock || "0");
    await insertMeta(
      productId,
      "_stock_status",
      body.stock_status || "instock",
    );
    await insertMeta(
      productId,
      "_product_features",
      body.product_features || "",
    );
    await insertMeta(
      productId,
      "_product_material",
      body.product_material || "",
    );
    await insertMeta(
      productId,
      "_product_collection",
      body.product_collection || "",
    );
    await insertMeta(
      productId,
      "_product_included",
      body.product_included || "",
    );
    await insertMeta(productId, "_product_care", body.product_care || "");
    await insertMeta(
      productId,
      "_product_more_info",
      body.product_more_info || "",
    );
    await insertMeta(productId, "meta_title", body.meta_title || "");
    await insertMeta(
      productId,
      "meta_description",
      body.meta_description || "",
    );
    await insertMeta(productId, "canonical_tag", body.canonical_tag || "");
    await insertMeta(productId, "meta_index", body.meta_index || "");

    await insertMeta(productId, "weight", body.weight || "0");
    await insertMeta(productId, "length", body.length || "0");
    await insertMeta(productId, "breadth", body.breadth || "0");
    await insertMeta(productId, "height", body.height || "0");

    // ═══════════════════════════════════════════════════════
    // STEP 3: MAIN FEATURED IMAGE
    // field: featured_image
    // save to tbl_media+ tbl_mediameta, store media_id in _thumbnail_id
    // ═══════════════════════════════════════════════════════
    if (req.files) {
      // =========================
      // ✅ MAIN IMAGE
      // =========================
      const mainImageFile = req.files?.find(
        (f) => f.fieldname === "featured_image",
      );

      const mainImageUrl = body.featured_image; // ✅ from hidden input

      if (mainImageFile || mainImageUrl) {
        const title =
          body.featured_image_title || mainImageFile?.originalname || "Image";

        const alt = body.featured_image_alt || "";

        const savedPath = mainImageFile
          ? "uploads/products/" + mainImageFile.filename
          : mainImageUrl; // ✅ use URL if no file

        const [mediaRes] = await conn.query(
          `INSERT INTO tbl_media
     (author_id, parent_id, media_title, media_path, media_status, media_type, media_mime_type, date_added, date_modified, media_order)
     VALUES (?, ?, ?, ?, 'inherit', 'product_image', ?, NOW(), NOW(), 0)`,
          [
            authorId,
            productId,
            title,
            savedPath,
            mainImageFile?.mimetype || "image/jpeg",
          ],
        );

        const mediaId = mediaRes.insertId;

        // ALT
        await conn.query(
          `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
     VALUES (?, '_wp_attachment_image_alt', ?)`,
          [mediaId, alt],
        );

        // TITLE
        await conn.query(
          `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
     VALUES (?, '_wp_attachment_image_title', ?)`,
          [mediaId, title],
        );

        await insertMeta(productId, "_thumbnail_id", mediaId);
      }

      // =========================
      // ✅ GALLERY IMAGES
      // =========================
      const galleryFiles = req.files.filter(
        (f) => f.fieldname === "gallery_image[]",
      );

      const titles = [].concat(body.gallery_image_titles || []);
      const alts = [].concat(body.gallery_image_alts || []);

      // 🔥 MEDIA MODAL SUPPORT (like update)
      const galleryUrls = [].concat(body.gallery_image || []);
      const galleryTitlesModal = [].concat(body.gallery_image_titles || []);
      const galleryAltsModal = [].concat(body.gallery_image_alts || []);

      for (let i = 0; i < galleryUrls.length; i++) {
        const [mediaRes] = await conn.query(
          `INSERT INTO tbl_media
            (author_id, parent_id, media_title, media_path, media_status, media_type, media_mime_type, date_added, date_modified, media_order)
            VALUES (?, ?, ?, ?, 'inherit', 'product_image', 'image/jpeg', NOW(), NOW(), 0)`,
          [
            authorId,
            productId,
            galleryTitlesModal[i] || "Image",
            galleryUrls[i],
          ],
        );

        const mediaId = mediaRes.insertId;

        await conn.query(
          `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
     VALUES (?, '_wp_attachment_image_alt', ?)`,
          [mediaId, galleryAltsModal[i] || ""],
        );

        await conn.query(
          `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
     VALUES (?, '_wp_attachment_image_title', ?)`,
          [mediaId, galleryTitlesModal[i] || ""],
        );
      }
    }

    // ═══════════════════════════════════════════════════════
    // STEP 5: ATTRIBUTES
    // selected_attr_type[]   = attribute_type_id
    // selected_attr_values[] = comma-separated attr_ids
    // attr_for_variation[]   = "1" if used for variations
    // ═══════════════════════════════════════════════════════
    const attrTypeIds = [].concat(body.selected_attr_type || []);
    const attrValuesCsv = [].concat(body.selected_attr_values || []);
    const attrForVar = [].concat(body.attr_for_variation || []);

    for (let i = 0; i < attrTypeIds.length; i++) {
      const typeId = attrTypeIds[i];
      const isVariation = attrForVar.includes("1") ? 1 : 0;
      const valueIds = (attrValuesCsv[i] || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

      if (!valueIds.length) continue;

      const [[attrType]] = await conn.query(
        "SELECT attribute_type_name FROM tbl_attribute_type WHERE attribute_type_id = ?",
        [typeId],
      );
      if (!attrType) continue;

      const taxonomy = "pa_" + attrType.attribute_type_name;

      // Save attribute slugs on main product meta
      const [attrRows] = await conn.query(
        `SELECT attr_id, attr_slug FROM tbl_attributes WHERE attr_id IN (${valueIds.map(() => "?").join(",")})`,
        valueIds,
      );
      await insertMeta(
        productId,
        "attribute_" + taxonomy,
        attrRows.map((a) => a.attr_slug).join("|"),
      );

      // Insert into lookup
      for (const attrRow of attrRows) {
        await conn.query(
          `INSERT IGNORE INTO tbl_attributes_lookup
             (product_id, product_or_parent_id, taxonomy, attr_id, is_variation_attribute, in_stock)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [productId, productId, taxonomy, attrRow.attr_id, isVariation],
        );
      }
    }

    // ═══════════════════════════════════════════════════════
    // STEP 6: VARIATIONS
    // var_attr_combo[] = "pa_color:white,pa_size:xl"
    // var_attr_ids[]   = "93,119"
    // ═══════════════════════════════════════════════════════
    const combos = [].concat(body.var_attr_combo || []);
    const varSkus = [].concat(body.var_sku || []);
    const varPrices = [].concat(body.var_regular_price || []);
    const varSales = [].concat(body.var_sale_price || []);
    const varStocks = [].concat(body.var_stock || []);
    const varStatuses = [].concat(body.var_stock_status || []);
    const varWeights = [].concat(body.var_weight || []);
    const varDescs = [].concat(body.var_description || []);
    const varAttrIds = [].concat(body.var_attr_ids || []);

    if (body.product_type === "product_variation" && combos.length) {
      for (let i = 0; i < combos.length; i++) {
        const combo = combos[i];
        const inStock = varStatuses[i] === "instock" ? 1 : 0;

        // Build label: "pa_color:white,pa_size:xl" → "White / Xl"
        const label = combo
          .split(",")
          .map(function (part) {
            var val = (part.split(":")[1] || "").trim();
            return val.charAt(0).toUpperCase() + val.slice(1);
          })
          .join(" / ");

        const varGuid =
          Date.now() +
          "-var-" +
          i +
          "-" +
          Math.random().toString(36).substr(2, 5);

        const [varResult] = await conn.query(
          `INSERT INTO tbl_products
             (author_id, parent_id, product_url, product_title, product_short_desc,
              product_status, product_type, guid, menu_order,
              product_date_added, product_date_modified)
           VALUES (?, ?, ?, ?, ?, 'publish', 'product_variation', ?, ?, NOW(), NOW())`,
          [
            authorId,
            productId,
            slug + "-var-" + (i + 1),
            body.product_title + " - " + label,
            combo,
            varGuid,
            i,
          ],
        );
        const varId = varResult.insertId;

        // Variation meta
        await insertMeta(varId, "_sku", varSkus[i] || "");
        await insertMeta(varId, "_regular_price", varPrices[i] || "");
        await insertMeta(varId, "_sale_price", varSales[i] || "");
        await insertMeta(varId, "_price", varSales[i] || varPrices[i] || "");
        await insertMeta(varId, "_stock", varStocks[i] || "0");
        await insertMeta(varId, "_stock_status", varStatuses[i] || "instock");
        await insertMeta(varId, "_weight", varWeights[i] || "");
        await insertMeta(varId, "_variation_description", varDescs[i] || "");

        // Attribute meta: "pa_color:white,pa_size:xl"
        const comboParts = combo.split(",");
        for (const part of comboParts) {
          const colonIdx = part.indexOf(":");
          if (colonIdx === -1) continue;
          const taxKey = part.substring(0, colonIdx).trim(); // "pa_color"
          const taxVal = part.substring(colonIdx + 1).trim(); // "white"
          await insertMeta(varId, "attribute_" + taxKey, taxVal);
        }

        // Variation lookup
        const attrIdList = (varAttrIds[i] || "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);

        for (const attrId of attrIdList) {
          const [amRows] = await conn.query(
            "SELECT meta_key FROM tbl_attributemeta WHERE attr_id = ? AND meta_key LIKE 'order_pa_%' LIMIT 1",
            [attrId],
          );
          if (!amRows.length) continue;
          const taxonomy = amRows[0].meta_key.replace("order_", "");

          await conn.query(
            `INSERT IGNORE INTO tbl_attributes_lookup
               (product_id, product_or_parent_id, taxonomy, attr_id, is_variation_attribute, in_stock)
             VALUES (?, ?, ?, ?, 1, ?)`,
            [varId, productId, taxonomy, attrId, inStock],
          );
        }

        if (req.files) {
          // =========================
          // ✅ VARIATION MAIN IMAGE
          // =========================
          const varImageFile = req.files.find(function (f) {
            return (
              f.fieldname === "var_featured_image_new_" + i ||
              f.fieldname === "var_featured_image_" + varId
            );
          });

          if (varImageFile) {
            const savedPath = "uploads/products/" + varImageFile.filename;

            // ✅ GET TITLE + ALT FROM FORM
            const title =
              body["var_featured_image_title_" + varId] ||
              varImageFile.originalname;
            const alt = body["var_featured_image_alt_" + varId] || "";

            const [mediaRes] = await conn.query(
              `INSERT INTO tbl_media
                (author_id, parent_id, media_title, media_path, media_status, media_type, media_mime_type, date_added, date_modified, media_order)
                VALUES (?, ?, ?, ?, 'inherit', 'product_image', ?, NOW(), NOW(), 0)`,
              [authorId, varId, title, savedPath, varImageFile.mimetype],
            );

            const mediaId = mediaRes.insertId;

            // ✅ ALT TEXT
            await conn.query(
              `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
               VALUES (?, '_wp_attachment_image_alt', ?)`,
              [mediaId, alt],
            );
            // ✅ title TEXT
            await conn.query(
              `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
               VALUES (?, '_wp_attachment_image_title', ?)`,
              [mediaId, title],
            );

            await insertMeta(varId, "_thumbnail_id", mediaId);
          }

          // =========================
          // ✅ VARIATION GALLERY
          // =========================
          const varGalleryFiles = req.files.filter(function (f) {
            return (
              f.fieldname === "var_gallery_image_new_" + i + "[]" ||
              f.fieldname === "var_gallery_image_" + varId + "[]"
            );
          });

          const galleryTitles = body["var_gallery_image_titles_" + varId]
            ? [].concat(body["var_gallery_image_titles_" + varId])
            : [];

          const galleryAlts = body["var_gallery_image_alts_" + varId]
            ? [].concat(body["var_gallery_image_alts_" + varId])
            : [];

          for (let g = 0; g < varGalleryFiles.length; g++) {
            const file = varGalleryFiles[g];

            const savedPath = "uploads/products/" + file.filename;

            const title = galleryTitles[g] || file.originalname;
            const alt = galleryAlts[g] || "";

            const [mediaRes] = await conn.query(
              `INSERT INTO tbl_media
              (author_id, parent_id, media_title, media_path, media_status, media_type, media_mime_type, date_added, date_modified, media_order)
              VALUES (?, ?, ?, ?, 'inherit', 'product_image', ?, NOW(), NOW(), 0)`,
              [authorId, varId, title, savedPath, file.mimetype],
            );

            const mediaId = mediaRes.insertId;

            // ✅ ALT TEXT
            await conn.query(
              `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
               VALUES (?, '_wp_attachment_image_alt', ?)`,
              [mediaId, alt],
            );

            // ✅ title TEXT
            await conn.query(
              `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
               VALUES (?, '_wp_attachment_image_title', ?)`,
              [mediaId, title],
            );
          }
        }
      }
    }

    await conn.commit();
    res.redirect("/store/admin/products?success=Product added successfully");
  } catch (err) {
    await conn.rollback();
    console.error("Store Product Error:", err.message, err.stack);
    res.redirect(
      "/store/admin/products/add?error=" + encodeURIComponent(err.message),
    );
  } finally {
    conn.release();
  }
};

// Update product handler
const updateProduct = async (req, res) => {
  const conn = await db.getConnection();

  try {
    const { id } = req.params;
    const body = req.body;

    await conn.beginTransaction();

    // ═══════════════════════════════════════════════════════
    // HELPER: upsert meta
    // ═══════════════════════════════════════════════════════
    const updateMeta = async (pid, key, value) => {
      try {
        await conn.query(
          `INSERT INTO tbl_productmeta (product_id, meta_key, meta_value)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
          [pid, key, value || ""],
        );
      } catch (metaErr) {
        console.error(
          `updateMeta FAILED — pid:${pid} key:${key} value:${value}`,
          metaErr.message,
        );
        throw metaErr;
      }
    };

    // ═══════════════════════════════════════════════════════
    // STEP 1: UPDATE MAIN PRODUCT
    // using correct column names from tbl_products
    // ═══════════════════════════════════════════════════════
    const slug =
      body.product_url ||
      (body.product_title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    // Check if this product has variations
    const [varCheck] = await conn.query(
      "SELECT COUNT(*) AS cnt FROM tbl_products WHERE parent_id = ?",
      [id],
    );
    const hasVariations = varCheck[0].cnt > 0;

    // product_type: if has variations → 'product_variation', else use form value
    const productType = "product";

    await conn.query(
      `UPDATE tbl_products SET
         product_title = ?,
         product_url = ?,
         product_content = ?,
         product_short_desc = ?,
         product_status = ?,
         product_type = ?,
         menu_order = ?,
         product_date_modified = NOW()
       WHERE ID = ?`,
      [
        body.product_title,
        slug,
        body.product_content || "",
        body.product_short_desc || "",
        body.product_status || "draft",
        productType,
        body.menu_order || 0,
        id,
      ],
    );

    // STEP 2: Categories (move here)
    await conn.query(
      `DELETE FROM tbl_products_category_link WHERE product_id = ?`,
      [id],
    );

    const categories = [].concat(body.categories || []);

    for (let catId of categories) {
      await conn.query(
        `INSERT INTO tbl_products_category_link (product_id, category_id) VALUES (?, ?)`,
        [id, catId],
      );
    }

    // ═══════════════════════════════════════════════════════
    // STEP 2: UPDATE MAIN PRODUCT META
    // ═══════════════════════════════════════════════════════
    await updateMeta(id, "_sku", body.sku);
    await updateMeta(id, "_regular_price", body.regular_price);
    await updateMeta(id, "_sale_price", body.sale_price);
    await updateMeta(id, "_sale_price_dates_from", body.sale_price_dates_from);
    await updateMeta(id, "_sale_price_dates_to", body.sale_price_dates_to);
    await updateMeta(id, "_price", body.sale_price || body.regular_price);
    await updateMeta(id, "_stock", body.stock);
    await updateMeta(id, "_stock_status", body.stock_status || "instock");
    await updateMeta(id, "_product_features", body.product_features || "");
    await updateMeta(id, "_product_material", body.product_material || "");
    await updateMeta(id, "_product_collection", body.product_collection || "");
    await updateMeta(id, "_product_included", body.product_included || "");
    await updateMeta(id, "_product_care", body.product_care || "");
    await updateMeta(id, "_product_more_info", body.product_more_info || "");
    await updateMeta(id, "meta_title", body.meta_title || body.sku);
    await updateMeta(id, "meta_description", body.meta_description || "");
    await updateMeta(id, "canonical_tag", body.canonical_tag || "");
    await updateMeta(id, "meta_index", body.meta_index || "");
    await updateMeta(id, "weight", body.weight || "0");
    await updateMeta(id, "length", body.length || "0");
    await updateMeta(id, "breadth", body.breadth || "0");
    await updateMeta(id, "height", body.height || "0");

    // ─────────────────────────────────────────
    // ✅ DELETE OLD MEDIA (FIXED - ALWAYS RUN)
    // ─────────────────────────────────────────
    const [oldMediaRows] = await conn.query(
      "SELECT media_id FROM tbl_media WHERE parent_id = ? AND media_type = 'product_image'",
      [id],
    );

    const oldMediaIds = oldMediaRows.map((r) => r.media_id);

    if (oldMediaIds.length > 0) {
      const placeholders = oldMediaIds.map(() => "?").join(",");

      // 🔥 DELETE META FIRST
      const [metaDel] = await conn.query(
        `DELETE FROM tbl_mediameta WHERE media_id IN (${placeholders})`,
        oldMediaIds,
      );

      // 🔥 DELETE MEDIA
      const [mediaDel] = await conn.query(
        `DELETE FROM tbl_media WHERE media_id IN (${placeholders})`,
        oldMediaIds,
      );
    }

    await updateMeta(id, "_thumbnail_id", "");

    // ═══════════════════════════════════════════════════════
    // STEP 3: MAIN IMAGE
    // file field name: "featured_image"
    // save original filename to tbl_media+ tbl_mediameta
    // ═══════════════════════════════════════════════════════
    if (req.files) {
      // =========================
      // ✅ MAIN IMAGE (FILE OR URL)
      // =========================

      // If uploaded via file
      const mainImageFile = req.files?.find(
        (f) => f.fieldname === "featured_image",
      );

      if (mainImageFile || body.featured_image) {
        const title =
          body.featured_image_title || mainImageFile?.originalname || "Image";
        const alt = body.featured_image_alt || "";

        let savedPath = "";

        if (mainImageFile) {
          savedPath = "uploads/products/" + mainImageFile.filename;
        } else {
          savedPath = body.featured_image; // from media modal (URL)
        }

        const [mediaRes] = await conn.query(
          `INSERT INTO tbl_media
          (author_id, parent_id, media_title, media_path, media_status, media_type, media_mime_type, date_added, date_modified, media_order)
          VALUES (?, ?, ?, ?, 'inherit', 'product_image', ?, NOW(), NOW(), 0)`,
          [
            req.session.admin.id,
            id,
            title,
            savedPath,
            mainImageFile?.mimetype || "image/jpeg",
          ],
        );

        const mediaId = mediaRes.insertId;

        // ✅ title
        await conn.query(
          `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
         VALUES (?, '_wp_attachment_image_title', ?)`,
          [mediaId, title],
        );

        // ✅ ALT
        await conn.query(
          `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
         VALUES (?, '_wp_attachment_image_alt', ?)`,
          [mediaId, alt],
        );

        await updateMeta(id, "_thumbnail_id", mediaId);
      }

      // ═══════════════════════════════════════════════════════
      // STEP 4: PRODUCT GALLERY IMAGES
      // file field name: "gallery_images[]"
      // ═══════════════════════════════════════════════════════

      // =========================
      // ✅ GALLERY (FILE + MEDIA MODAL)
      // =========================

      // FROM FILES
      const galleryFiles =
        req.files?.filter((f) => f.fieldname === "gallery_image[]") || [];

      // FROM MEDIA MODAL
      const galleryUrls = [].concat(body.gallery_image || []);
      const galleryTitles = [].concat(body.gallery_image_titles || []);
      const galleryAlts = [].concat(body.gallery_image_alts || []);

      if (galleryFiles.length || galleryUrls.length) {
        // 🔹 FILES
        for (let i = 0; i < galleryFiles.length; i++) {
          const file = galleryFiles[i];

          const [mediaRes] = await conn.query(
            `INSERT INTO tbl_media (author_id, parent_id, media_title, media_path, media_status, media_type, media_mime_type, date_added, date_modified, media_order)
           VALUES (?, ?, ?, ?, 'inherit', 'product_image', ?, NOW(), NOW(), 0)`,
            [
              req.session.admin.id,
              id,
              file.originalname,
              "uploads/products/" + file.filename,
              file.mimetype,
            ],
          );

          const mediaId = mediaRes.insertId;

          await conn.query(
            `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
           VALUES (?, '_wp_attachment_image_alt', ?)`,
            [mediaId, galleryAlts[i] || ""],
          );

          await conn.query(
            "INSERT INTO tbl_mediameta (media_id, meta_key, meta_value) VALUES (?, '_wp_attachment_image_title', ?)",
            [mediaId, galleryTitles[i] || file.originalname],
          );
        }

        // 🔹 MEDIA MODAL
        for (let i = 0; i < galleryUrls.length; i++) {
          const [mediaRes] = await conn.query(
            `INSERT INTO tbl_media (author_id, parent_id, media_title, media_path, media_status, media_type, media_mime_type, date_added, date_modified, media_order)
           VALUES (?, ?, ?, ?, 'inherit', 'product_image', 'image/jpeg', NOW(), NOW(), 0)`,
            [
              req.session.admin.id,
              id,
              galleryTitles[i] || "Image",
              galleryUrls[i],
            ],
          );

          const mediaId = mediaRes.insertId;

          await conn.query(
            `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
           VALUES (?, '_wp_attachment_image_alt', ?)`,
            [mediaId, galleryAlts[i] || ""],
          );

          await conn.query(
            `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
           VALUES (?, '_wp_attachment_image_title', ?)`,
            [mediaId, galleryTitles[i] || ""],
          );
        }
      }

      // ═══════════════════════════════════════════════════════
      // STEP 5: ATTRIBUTES
      // selected_attr_type[]   = attribute_type_id (e.g. "1")
      // selected_attr_values[] = comma-separated attr_ids (e.g. "93,116,125")
      // attr_for_variation[]   = "1" if used for variations (only checked ones sent)
      //
      // Strategy: delete existing lookup for this parent, re-insert
      // ═══════════════════════════════════════════════════════
      await conn.query(
        `DELETE FROM tbl_attributes_lookup WHERE product_or_parent_id = ? AND product_id = ?`,
        [id, id],
      );

      const attrTypeIds = [].concat(body.selected_attr_type || []);
      const attrValuesCsv = [].concat(body.selected_attr_values || []);
      const attrForVar = [].concat(body.attr_for_variation || []);

      for (let i = 0; i < attrTypeIds.length; i++) {
        const typeId = attrTypeIds[i];
        const isVariation = attrForVar.includes("1") ? 1 : 0;
        const valueIds = (attrValuesCsv[i] || "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);

        if (!valueIds.length) continue;

        // Get taxonomy name from type id
        const [[attrType]] = await conn.query(
          "SELECT attribute_type_name FROM tbl_attribute_type WHERE attribute_type_id = ?",
          [typeId],
        );
        if (!attrType) continue;

        const taxonomy = "pa_" + attrType.attribute_type_name;

        for (const attrId of valueIds) {
          await conn.query(
            `INSERT IGNORE INTO tbl_attributes_lookup
             (product_id, product_or_parent_id, taxonomy, attr_id, is_variation_attribute, in_stock)
           VALUES (?, ?, ?, ?, ?, 1)`,
            [id, id, taxonomy, attrId, isVariation],
          );
        }

        // Update attribute meta on main product
        const [attrRows] = await conn.query(
          `SELECT attr_slug FROM tbl_attributes WHERE attr_id IN (${valueIds.map(() => "?").join(",")})`,
          valueIds,
        );
        await updateMeta(
          id,
          "attribute_" + taxonomy,
          attrRows.map((r) => r.attr_slug).join("|"),
        );
      }

      // ═══════════════════════════════════════════════════════
      // STEP 6: VARIATIONS
      // var_product_id[] = existing variation ID (update) or empty (insert)
      // var_attr_combo[] = "pa_color:white,pa_size:xl"
      // var_attr_ids[]   = "93,119"
      // ═══════════════════════════════════════════════════════
      const combos = [].concat(body.var_attr_combo || []);
      const existingIds = [].concat(body.var_product_id || []);
      const varSkus = [].concat(body.var_sku || []);
      const varPrices = [].concat(body.var_regular_price || []);
      const varSalePrices = [].concat(body.var_sale_price || []);
      const varStocks = [].concat(body.var_stock || []);
      const varStatuses = [].concat(body.var_stock_status || []);
      const varWeights = [].concat(body.var_weight || []);
      const varDescs = [].concat(body.var_description || []);
      const varAttrIds = [].concat(body.var_attr_ids || []);

      for (let i = 0; i < combos.length; i++) {
        const combo = combos[i];
        const existVid = existingIds[i];
        let vid;

        if (existVid && existVid !== "" && existVid !== "0") {
          // ── UPDATE existing variation ──────────────────────────
          vid = existVid;

          // Build label from combo: "pa_color:white,pa_size:xl" → "White / Xl"
          const label = combo
            .split(",")
            .map(function (part) {
              var val = part.split(":")[1] || "";
              return val.charAt(0).toUpperCase() + val.slice(1);
            })
            .join(" / ");

          await conn.query(
            `UPDATE tbl_products SET
             product_title = ?,
             product_short_desc = ?,
             product_date_modified = NOW()
           WHERE ID = ?`,
            [body.product_title + " - " + label, combo, vid],
          );
        } else {
          // ── INSERT new variation ───────────────────────────────
          const label = combo
            .split(",")
            .map(function (part) {
              var val = part.split(":")[1] || "";
              return val.charAt(0).toUpperCase() + val.slice(1);
            })
            .join(" / ");

          const [ins] = await conn.query(
            `INSERT INTO tbl_products
             (author_id, parent_id, product_url, product_title, product_short_desc,
              product_status, product_type, product_date_added, product_date_modified, menu_order)
           VALUES (?, ?, ?, ?, ?, 'publish', 'product_variation', NOW(), NOW(), ?)`,
            [
              req.session.admin.id,
              id,
              slug + "-var-" + (i + 1),
              body.product_title + " - " + label,
              combo,
              i,
            ],
          );
          vid = ins.insertId;
        }

        // ── Variation meta ───────────────────────────────────────
        await updateMeta(vid, "_sku", varSkus[i] || "");
        await updateMeta(vid, "_regular_price", varPrices[i] || "");
        await updateMeta(vid, "_sale_price", varSalePrices[i] || "");
        await updateMeta(vid, "_price", varSalePrices[i] || varPrices[i] || "");
        await updateMeta(vid, "_stock", varStocks[i] || "0");
        await updateMeta(vid, "_stock_status", varStatuses[i] || "instock");
        await updateMeta(vid, "_variation_description", varDescs[i] || "");

        // ── Attribute meta on variation ─────────────────────────
        // combo = "pa_color:white,pa_size:xl"
        const comboParts = combo.split(",");
        for (const part of comboParts) {
          const colonIdx = part.indexOf(":");
          if (colonIdx === -1) continue;
          const taxKey = part.substring(0, colonIdx).trim(); // "pa_color"
          const taxVal = part.substring(colonIdx + 1).trim(); // "white"
          await updateMeta(vid, "attribute_" + taxKey, taxVal);
        }

        // ── Variation lookup ────────────────────────────────────
        // Delete old entries for this variation, re-insert
        await conn.query(
          "DELETE FROM tbl_attributes_lookup WHERE product_id = ?",
          [vid],
        );

        const attrIdList = (varAttrIds[i] || "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
        for (const attrId of attrIdList) {
          // Get taxonomy from tbl_attributemeta
          const [amRows] = await conn.query(
            "SELECT meta_key FROM tbl_attributemeta WHERE attr_id = ? AND meta_key LIKE 'order_pa_%' LIMIT 1",
            [attrId],
          );
          if (!amRows.length) continue;
          const taxonomy = amRows[0].meta_key.replace("order_", ""); // "pa_color"
          const inStock = varStatuses[i] === "instock" ? 1 : 0;

          await conn.query(
            `INSERT IGNORE INTO tbl_attributes_lookup
             (product_id, product_or_parent_id, taxonomy, attr_id, is_variation_attribute, in_stock)
           VALUES (?, ?, ?, ?, 1, ?)`,
            [vid, id, taxonomy, attrId, inStock],
          );
        }

        // ─────────────────────────────────────────
        // ✅ DELETE OLD VARIATION MEDIA (MAIN + GALLERY)

        const [oldVarMediaRows] = await conn.query(
          "SELECT media_id FROM tbl_media WHERE parent_id = ? AND media_type = 'product_image'",
          [vid],
        );

        const oldVarMediaIds = oldVarMediaRows.map((r) => r.media_id);

        if (oldVarMediaIds.length > 0) {
          const placeholders = oldVarMediaIds.map(() => "?").join(",");

          const [metaDel] = await conn.query(
            `DELETE FROM tbl_mediameta WHERE media_id IN (${placeholders})`,
            oldVarMediaIds,
          );

          const [mediaDel] = await conn.query(
            `DELETE FROM tbl_media WHERE media_id IN (${placeholders})`,
            oldVarMediaIds,
          );
        }

        // Remove old thumbnail
        await updateMeta(vid, "_thumbnail_id", "");

        // ── Variation main image ────────────────────────────────
        // field name: var_image_{variation_ID}

        // ── Variation main image ────────────────────────────────
        if (req.files || body) {
          const varImageFile = req.files?.find(
            (f) => f.fieldname === "var_featured_image_" + vid,
          );

          const varImageUrl = body["var_featured_image_" + vid];
          const varTitle = body["var_featured_image_title_" + vid];
          const varAlt = body["var_featured_image_alt_" + vid];

          if (varImageFile || varImageUrl) {
            const title = varTitle || varImageFile?.originalname || "Image";
            const alt = varAlt || "";

            const savedPath = varImageFile
              ? "uploads/products/" + varImageFile.filename
              : varImageUrl;

            const [mediaRes] = await conn.query(
              `INSERT INTO tbl_media
                (author_id, parent_id, media_title, media_path, media_status, media_type, media_mime_type, date_added, date_modified, media_order)
                VALUES (?, ?, ?, ?, 'inherit', 'product_image', ?, NOW(), NOW(), 0)`,
              [
                req.session.admin.id,
                vid,
                title,
                savedPath,
                varImageFile?.mimetype || "image/jpeg",
              ],
            );

            const mediaId = mediaRes.insertId;

            await conn.query(
              `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
              VALUES (?, '_wp_attachment_image_alt', ?)`,
              [mediaId, alt],
            );

            await conn.query(
              `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
              VALUES (?, '_wp_attachment_image_title', ?)`,
              [mediaId, title],
            );

            await updateMeta(vid, "_thumbnail_id", mediaId);
          }
        }

        // =========================
        // ✅ VARIATION GALLERY
        const varGalleryUrls = body["var_gallery_image_" + vid]
          ? Array.isArray(body["var_gallery_image_" + vid])
            ? body["var_gallery_image_" + vid]
            : [body["var_gallery_image_" + vid]]
          : [];

        const varGalleryTitles = body["var_gallery_image_titles_" + vid]
          ? Array.isArray(body["var_gallery_image_titles_" + vid])
            ? body["var_gallery_image_titles_" + vid]
            : [body["var_gallery_image_titles_" + vid]]
          : [];

        const varGalleryAlts = body["var_gallery_image_alts_" + vid]
          ? Array.isArray(body["var_gallery_image_alts_" + vid])
            ? body["var_gallery_image_alts_" + vid]
            : [body["var_gallery_image_alts_" + vid]]
          : [];

        for (let g = 0; g < varGalleryUrls.length; g++) {
          if (!varGalleryUrls[g]) continue;

          const title = varGalleryTitles[g] || "Image";
          const alt = varGalleryAlts[g] || "";

          const [mediaRes] = await conn.query(
            `INSERT INTO tbl_media 
     (author_id, parent_id, media_title, media_path, media_status, media_type, media_mime_type, date_added, date_modified, media_order)
     VALUES (?, ?, ?, ?, 'inherit', 'product_image', 'image/jpeg', NOW(), NOW(), 0)`,
            [req.session.admin.id, vid, title, varGalleryUrls[g]],
          );

          const mediaId = mediaRes.insertId;

          await conn.query(
            `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
     VALUES (?, '_wp_attachment_image_alt', ?)`,
            [mediaId, alt],
          );

          await conn.query(
            `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
     VALUES (?, '_wp_attachment_image_title', ?)`,
            [mediaId, title],
          );
        }
      }
    }

    await conn.commit();
    res.redirect("/store/admin/products?success=Product updated successfully");
  } catch (err) {
    await conn.rollback();
    console.error("❌ Update Product Error:", err.message);
    console.error("SQL:", err.sql || "N/A");
    console.error("Stack:", err.stack);
    res.redirect(
      `/store/admin/products/edit/${req.params.id}?error=` +
        encodeURIComponent(err.message),
    );
  } finally {
    conn.release();
  }
};

// ─── DELETE PRODUCT ───────────────────────────────────────────────────────────
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(
      "DELETE FROM tbl_attributes_lookup WHERE product_or_parent_id = ?",
      [id],
    );
    await db.query("DELETE FROM tbl_products WHERE parent_id = ?", [id]);
    await db.query("DELETE FROM tbl_products WHERE ID = ?", [id]);
    res.redirect("/store/admin/products?success=Product deleted successfully");
  } catch (err) {
    console.error("Delete Product Error:", err.message);
    res.redirect(
      "/store/admin/products?error=" + encodeURIComponent(err.message),
    );
  }
};

// ─── API: Attribute values by type (AJAX) ────────────────────────────────────
const getAttributeValues = async (req, res) => {
  try {
    const { typeId } = req.params;
    const [[attrType]] = await db.query(
      "SELECT * FROM tbl_attribute_type WHERE attribute_type_id = ?",
      [typeId],
    );
    if (!attrType) return res.json({ success: false, values: [] });

    const [values] = await db.query(
      `
            SELECT a.attr_id, a.attr_name, a.attr_slug
            FROM tbl_attributes a
            INNER JOIN tbl_attributemeta am ON am.attr_id = a.attr_id
            WHERE am.meta_key = ?
            ORDER BY CAST(am.meta_value AS UNSIGNED) ASC
        `,
      [`order_pa_${attrType.attribute_type_name}`],
    );

    res.json({ success: true, type: attrType, values });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};

module.exports = {
  showProducts,
  showAddProduct,
  storeProduct,
  showEditProduct,
  updateProduct,
  deleteProduct,
  getAttributeValues,
};
