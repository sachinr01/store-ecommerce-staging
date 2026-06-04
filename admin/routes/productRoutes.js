const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { isAuthenticated } = require("../middleware/auth");
const {
  showProducts,
  showAddProduct,
  storeProduct,
  showEditProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");


// ── Multer config ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, "public/uploads/products/");
  },
  filename: function(req, file, cb) {
    // Keep original name but make unique: timestamp + original
    var ext  = path.extname(file.originalname);
    var base = path.basename(file.originalname, ext)
                   .replace(/[^a-z0-9]/gi, "-")
                   .toLowerCase();
    cb(null, Date.now() + "-" + base + ext);
  }
});
const upload = multer({ storage: storage });


// ✅ All routes protected
router.get("/products", isAuthenticated, showProducts);
router.get("/products/add", isAuthenticated, showAddProduct);
router.post(
  "/products",
 upload.any(),
  storeProduct,
);
router.get("/products/edit/:id", isAuthenticated, showEditProduct);
router.post(
  "/products/update/:id",
  upload.any(),
  updateProduct,
);
router.post("/products/delete/:id", isAuthenticated, deleteProduct);

module.exports = router;