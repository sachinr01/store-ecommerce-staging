const db = require("../config/db");

const savePostMeta = async (postId, key, value) => {
  await db.query(
    `INSERT INTO tbl_postmeta (post_id, meta_key, meta_value)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
    [postId, key, value || ""],
  );
};

// ─── LIST BLOGS ─────────────────────────────
exports.index = async (req, res) => {
  try {
    const [rows] = await db.query(`
  SELECT * FROM tbl_posts
  WHERE post_type IN ('post')
  ORDER BY ID DESC
`);

    res.render("blogs/index", {
      title: "Blogs",
      blogs: rows,
      currentRoute: "/admin/blogs",
      success: req.query.success || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error(err);
    res.send(err.message);
  }
};

// ─── SHOW ADD / EDIT ────────────────────────
exports.showForm = async (req, res) => {
  try {
    const id = req.params.id;

    const [categories] = await db.query("SELECT * FROM tbl_posts_category");

    let blog = null;
    let selectedCategoryIds = [];

    if (id) {
      const [[row]] = await db.query("SELECT * FROM tbl_posts WHERE ID=?", [
        id,
      ]);

      blog = row;

      // ✅ FETCH BLOG IMAGE
      const [[thumb]] = await db.query(
        `SELECT 
            m.media_id,
            m.media_path,
            m.media_title,
            alt.meta_value AS alt_text
         FROM tbl_media m
         LEFT JOIN tbl_mediameta alt 
           ON alt.media_id = m.media_id 
           AND alt.meta_key = '_wp_attachment_image_alt'
         WHERE m.parent_id = ?
           AND m.media_type = 'blog_image'
         LIMIT 1`,
        [id],
      );

      if (thumb) {
        blog.thumbnail = thumb.media_path;
        blog.thumbnailId = thumb.media_id;
        blog.title = thumb.media_title;
        blog.alt = thumb.alt_text;
      }

      // ✅ categories
      const [categoryLinks] = await db.query(
        "SELECT category_id FROM tbl_posts_category_link WHERE post_id = ?",
        [id],
      );
      selectedCategoryIds = categoryLinks.map((link) => link.category_id);

      // ✅ FETCH SEO META
      const [metaRows] = await db.query(
        `SELECT meta_key, meta_value
          FROM tbl_postmeta
          WHERE post_id = ?`,
        [id],
      );

      metaRows.forEach((m) => {
        blog[m.meta_key] = m.meta_value;
      });
    }

    res.render("blogs/add", {
      title: id ? "Edit Blog" : "Add Blog",
      isEdit: !!id,
      blog: blog || {},
      allCategories: categories,
      selectedCategoryIds,
      currentRoute: "/admin/blogs",
      errors: null,
    });
  } catch (err) {
    console.error(err);
    res.send(err.message);
  }
};

// ─── STORE ────────────────────────────────
exports.store = async (req, res) => {
  try {
    const b = req.body;

    const slug =
      b.post_slug ||
      (b.post_title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    const result = await db.query(
      `INSERT INTO tbl_posts
      (user_id,parent_id,post_slug,post_title,post_content,post_short_desc,post_status,post_type,post_date,post_modified,menu_order)
      VALUES (?,?,?,?,?,?,?,?, ?, NOW(), ?)`,
      [
        req.session.admin.id,
        0,
        slug,
        b.post_title,
        b.post_content,
        b.post_short_desc,
        b.post_status || "draft",
        b.post_type || "post",
        b.post_date || new Date(),
        b.menu_order || 0,
      ],
    );

    const blogId = result[0].insertId;
    // SEO META SAVE
    await savePostMeta(blogId, "meta_title", b.meta_title);
    await savePostMeta(blogId, "meta_description", b.meta_description);
    await savePostMeta(blogId, "canonical_tag", b.canonical_tag);
    await savePostMeta(blogId, "meta_index", b.meta_index || "yes");

    const categories = [].concat(b.categories || []);

    for (let catId of categories) {
      try {
        await db.query(
          `INSERT INTO tbl_posts_category_link (post_id, category_id) VALUES (?, ?)`,
          [blogId, catId],
        );
      } catch (catErr) {
        console.error(`Error linking category ${catId}:`, catErr.message);
      }
    }

    // ─── BLOG IMAGE SAVE ─────────────────────
    if (b.blog_image) {
      const title = b.blog_image_title || "Blog Image";
      const alt = b.blog_image_alt || "";

      const [mediaRes] = await db.query(
        `INSERT INTO tbl_media
    (author_id, parent_id, media_title, media_path, media_status, media_type, media_mime_type, date_added, date_modified, media_order)
    VALUES (?, ?, ?, ?, 'inherit', 'blog_image', 'image/jpeg', NOW(), NOW(), 0)`,
        [
          req.session.admin.id,
          blogId, // ✅ direct relation
          title,
          b.blog_image, // ✅ URL
        ],
      );

      const mediaId = mediaRes.insertId;

      // TITLE
      await db.query(
        `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
     VALUES (?, '_wp_attachment_image_title', ?)`,
        [mediaId, title],
      );

      // ALT
      await db.query(
        `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
     VALUES (?, '_wp_attachment_image_alt', ?)`,
        [mediaId, alt],
      );
    }

    res.redirect("/admin/blogs?success=Blog added successfully");
  } catch (err) {
    console.error(err);
    res.send(err.message);
  }
};

// ─── UPDATE ───────────────────────────────
exports.update = async (req, res) => {
  try {
    const id = req.params.id;
    const b = req.body;

    await db.query(
      `UPDATE tbl_posts SET
        post_title=?,
        post_slug=?,
        post_content=?,
        post_short_desc=?,
        post_status=?,
        post_type=?,
        post_date=?,
        post_modified=NOW(),
        menu_order=?
      WHERE ID=?`,
      [
        b.post_title,
        b.post_slug,
        b.post_content,
        b.post_short_desc,
        b.post_status,
        b.post_type || "post",
        b.post_date,
        b.menu_order || 0,
        id,
      ],
    );

    // SEO META UPDATE
    await savePostMeta(id, "meta_title", b.meta_title);
    await savePostMeta(id, "meta_description", b.meta_description);
    await savePostMeta(id, "canonical_tag", b.canonical_tag);
    await savePostMeta(id, "meta_index", b.meta_index || "yes");

    await db.query(`DELETE FROM tbl_posts_category_link WHERE post_id = ?`, [
      id,
    ]);

    const categories = [].concat(b.categories || []);

    for (let catId of categories) {
      try {
        await db.query(
          `INSERT INTO tbl_posts_category_link (post_id, category_id) VALUES (?, ?)`,
          [id, catId],
        );
      } catch (catErr) {
        console.error(`Error linking category ${catId}:`, catErr.message);
      }
    }

    // ─── BLOG IMAGE UPDATE (SIMPLE) ───────────────────

    // 🔴 DELETE OLD IMAGE (ALWAYS)
    const [oldMedia] = await db.query(
      `SELECT media_id FROM tbl_media 
   WHERE parent_id = ? AND media_type = 'blog_image'
   LIMIT 1`,
      [id],
    );

    if (oldMedia.length > 0) {
      const mediaId = oldMedia[0].media_id;

      await db.query(`DELETE FROM tbl_mediameta WHERE media_id = ?`, [mediaId]);
      await db.query(`DELETE FROM tbl_media WHERE media_id = ?`, [mediaId]);
    }

    // 🟢 INSERT NEW (ONLY IF EXISTS)
    if (b.blog_image && b.blog_image.trim() !== "") {
      const title = b.blog_image_title || "Blog Image";
      const alt = b.blog_image_alt || "";

      const [mediaRes] = await db.query(
        `INSERT INTO tbl_media
    (author_id, parent_id, media_title, media_path, media_status, media_type, media_mime_type, date_added, date_modified, media_order)
    VALUES (?, ?, ?, ?, 'inherit', 'blog_image', 'image/jpeg', NOW(), NOW(), 0)`,
        [req.session.admin.id, id, title, b.blog_image],
      );

      const mediaId = mediaRes.insertId;

      await db.query(
        `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
     VALUES (?, '_wp_attachment_image_title', ?)`,
        [mediaId, title],
      );

      await db.query(
        `INSERT INTO tbl_mediameta (media_id, meta_key, meta_value)
     VALUES (?, '_wp_attachment_image_alt', ?)`,
        [mediaId, alt],
      );
    }

    res.redirect("/admin/blogs?success=Blog updated successfully");
  } catch (err) {
    console.error(err);
    res.send(err.message);
  }
};

// ─── DELETE ───────────────────────────────
exports.delete = async (req, res) => {
  try {
    const id = req.params.id;

    // 🔴 GET BLOG IMAGES
    const [mediaRows] = await db.query(
      `SELECT media_id FROM tbl_media 
       WHERE parent_id = ? AND media_type = 'blog_image'`,
      [id],
    );

    // 🔴 DELETE MEDIA META + MEDIA
    for (let m of mediaRows) {
      await db.query(`DELETE FROM tbl_mediameta WHERE media_id = ?`, [
        m.media_id,
      ]);
      await db.query(`DELETE FROM tbl_media WHERE media_id = ?`, [m.media_id]);
    }

    // 🔴 DELETE CATEGORY LINKS
    await db.query("DELETE FROM tbl_posts_category_link WHERE post_id = ?", [
      id,
    ]);

    // 🔴 DELETE POST
    await db.query("DELETE FROM tbl_posts WHERE ID=?", [id]);
    // DELETE POST META
    await db.query(`DELETE FROM tbl_postmeta WHERE post_id = ?`, [id]);

    res.redirect("/admin/blogs?success=Blog deleted successfully");
  } catch (err) {
    console.error(err);
    res.send(err.message);
  }
};
