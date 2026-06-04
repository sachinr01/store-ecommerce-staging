const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../middleware/auth");
const blogCategoryController = require("../controllers/blogCategoryController");

// ✅ All routes consistent — no /admin prefix in controller redirects
router.get("/blogs/categories", isAuthenticated, blogCategoryController.index);
router.post("/blogs/category", isAuthenticated, blogCategoryController.store);
router.post("/blogs/category/update/:id", isAuthenticated, blogCategoryController.update);
router.get("/blogs/category/delete/:id", isAuthenticated, blogCategoryController.delete);

module.exports = router;