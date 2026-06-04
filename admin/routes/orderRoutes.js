const express = require("express");
const router  = express.Router();
const { isAuthenticated } = require("../middleware/auth");
const {
  showOrders,
  showOrder,
  updateOrderStatus,
  deleteOrder,
  showAddOrder,
  getProductVariations,
  storeOrder,
} = require("../controllers/orderController");

// ── Order CRUD ────────────────────────────────────────────────────────────────
router.get("/orders",                     isAuthenticated, showOrders);
router.get("/orders/add",                 isAuthenticated, showAddOrder);
router.post("/orders",              isAuthenticated, storeOrder);
router.get("/orders/:id",                 isAuthenticated, showOrder);
router.post("/orders/:id/status",         isAuthenticated, updateOrderStatus);
router.post("/orders/:id/delete",         isAuthenticated, deleteOrder);

// ── AJAX endpoints ────────────────────────────────────────────────────────────
router.get("/api/product-variations/:id", isAuthenticated, getProductVariations);

module.exports = router;