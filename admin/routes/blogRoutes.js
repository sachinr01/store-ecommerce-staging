const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../middleware/auth");
const blogController = require("../controllers/blogController");

router.get("/blogs", isAuthenticated, blogController.index);
router.get("/blogs/add", isAuthenticated, blogController.showForm);
router.get("/blogs/edit/:id", isAuthenticated, blogController.showForm);

router.post("/blogs", isAuthenticated, blogController.store);
router.post("/blogs/update/:id", isAuthenticated, blogController.update);

router.get("/blogs/delete/:id", isAuthenticated, blogController.delete);

module.exports = router;