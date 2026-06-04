const express = require("express");
const router  = express.Router();
const { isAuthenticated } = require("../middleware/auth");
const couponController    = require("../controllers/couponController");

// List
router.get("/coupons",                isAuthenticated, couponController.index);

// Add
router.get("/coupons/add",            isAuthenticated, couponController.create);
router.post("/coupons",         isAuthenticated, couponController.store);

// Edit
router.get("/coupons/edit/:id",       isAuthenticated, couponController.edit);
router.post("/coupons/update/:id",    isAuthenticated, couponController.update);

// Delete
router.get("/coupons/delete/:id",     isAuthenticated, couponController.delete);

module.exports = router;