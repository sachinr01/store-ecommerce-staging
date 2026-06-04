const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../middleware/auth");
const pagesController = require("../controllers/pagesController");

router.get("/pages", isAuthenticated, pagesController.index);
router.get("/pages/add", isAuthenticated, pagesController.showForm);
router.get("/pages/edit/:id", isAuthenticated, pagesController.showForm);

router.post("/pages", isAuthenticated, pagesController.store);
router.post("/pages/update/:id", isAuthenticated, pagesController.update);

router.get("/pages/delete/:id", isAuthenticated, pagesController.delete);

module.exports = router;