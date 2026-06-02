const express = require('express');
const router = express.Router();
const ctrl = require('./controller');
const auth = require('./authController');
const cart = require('./cartController');
const orders = require('./orderController');
const media = require('./mediaController');
const coupon = require('./couponController');
const wishlist = require('./wishlistController');
const { sessionMiddleware } = require('./session');
const { guestCookieMiddleware } = require('./guestCookie');
const { requireAdmin, requireAgentOrAdmin, requireLogin } = require('./authMiddleware');
const contact = require('./contactController');
const {
  authLimiter,
  passwordResetLimiter,
  contactLimiter,
  orderLimiter,
  couponLimiter,
} = require('./rateLimiters');

router.use(guestCookieMiddleware());
router.use(sessionMiddleware());

// ── Health ────────────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ success: true, message: 'API is running' }));

// ── Contact Forms ─────────────────────────────────────────────────────────────
router.post('/contact', contactLimiter, contact.submitContact);

// ── Products ──────────────────────────────────────────────────────────────────
router.get('/products/featured',      ctrl.getFeaturedProducts);
router.get('/products/on-sale',       ctrl.getOnSaleProducts);
router.get('/products/best-sellers',  ctrl.getBestSellerProducts);
router.get('/products',               ctrl.getProducts);
router.get('/products/slug/:slug',    ctrl.getProductBySlug);
router.get('/products/:id',           ctrl.getProduct);

// ── Media ─────────────────────────────────────────────────────────────────────
// NOTE: static routes before dynamic :id
router.get('/media/resolve',              media.resolveMediaIds);
router.get('/media/products',             media.getProductsWithImages);
router.get('/media/product/:productId',   media.getProductMedia);
router.get('/media/:id',                  media.getMediaById);

// ── Content (Blogs + Pages) ────────────────────────────────────────────────
router.get('/blogs',                ctrl.getBlogs);
router.get('/blogs/slug/:slug',     ctrl.getBlogBySlug);
router.get('/blog-categories',      ctrl.getBlogCategories);
router.get('/pages',            ctrl.getPages);
router.get('/pages/slug/:slug', ctrl.getPageBySlug);

// ── Attributes ────────────────────────────────────────────────────────────────
router.get('/attributes/colors',     ctrl.getColors);
router.get('/attributes/all',        ctrl.getAllAttributeGroups);
router.get('/attributes/:taxonomy',  ctrl.getAttributesByTaxonomy);

// ── Site Settings (public) ────────────────────────────────────────────────────
router.get('/site-settings', ctrl.getPublicSiteSettings);

// ── Product Categories ────────────────────────────────────────────────────────
// NOTE: static sub-routes before dynamic :slug to avoid conflicts
router.get('/product-categories',                  ctrl.getProductCategories);
router.get('/product-categories/search',           ctrl.searchProductCategories);
router.get('/product-categories/:slug/children',   ctrl.getCategoryChildren);
router.get('/product-categories/:slug/products',   ctrl.getCategoryProducts);

// ── Auth ──────────────────────────────────────────────────────────────────────
router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/login',    authLimiter, auth.login);
router.post('/auth/google',   authLimiter, auth.googleLogin);
router.post('/auth/logout',   auth.logout);
router.post('/auth/forgot-password', passwordResetLimiter, auth.requestPasswordReset);
router.post('/auth/reset-password',  passwordResetLimiter, auth.resetPassword);
router.get('/auth/me',        auth.me);
router.put('/auth/profile',   requireLogin, auth.updateProfile);

// ── Coupons ───────────────────────────────────────────────────────────────────
router.get('/coupon/active',   coupon.active);
router.post('/coupon/apply',   couponLimiter, coupon.apply);
router.post('/coupon/remove',  coupon.remove);

// ── Cart ──────────────────────────────────────────────────────────────────────
router.get('/cart',                   cart.getCart);
router.post('/cart/add',              cart.addToCart);
router.put('/cart/update/:itemId',    cart.updateCartItem);
router.delete('/cart/remove/:itemId', cart.removeCartItem);
router.delete('/cart/clear',          cart.clearCart);

// ── Wishlist ──────────────────────────────────────────────────────────────────
router.get   ('/wishlist',                    requireLogin, wishlist.getWishlist);
router.post  ('/wishlist/add',                requireLogin, wishlist.addToWishlist);
router.delete('/wishlist/remove/:productId',  requireLogin, wishlist.removeFromWishlist);
router.post  ('/wishlist/sync',               requireLogin, wishlist.syncWishlist);

// ── Orders ────────────────────────────────────────────────────────────────────
// NOTE: /orders/my MUST come before /orders/:orderId to avoid route conflict
router.post('/orders/place',      orderLimiter, orders.placeOrder);
router.post('/shipping-rate',     orders.getShippingRate);
router.get('/tracking/:awb',      orders.getTrackingStatus);
router.get('/orders/my',          requireLogin, orders.getMyOrders);
router.get('/orders/:orderId',    requireLogin, orders.getMyOrderById);

// ── Address Book ──────────────────────────────────────────────────────────────
// These routes only work with saved addresses (order_id IS NULL rows).
// Order addresses are always fetched via /orders/:orderId — never here.
//
// GET  /address/default           → fetch default saved address (pre-fill checkout form)
// PUT  /address/default/:addressId → set a saved address as default (from profile page)
// GET  /address/saved             → all saved addresses for address book page
router.get('/address/default',              requireLogin, orders.getDefaultAddress);
router.put('/address/default/:addressId',   requireLogin, orders.setDefaultAddress);
router.get('/address/saved',               requireLogin, orders.getSavedAddresses);
router.get('/address/recent',              requireLogin, orders.getRecentOrderAddresses);
router.get('/address/profile',             requireLogin, orders.getProfileAddresses);
router.put('/address/profile/:kind',       requireLogin, orders.updateProfileAddress);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get('/admin/orders',                     requireAdmin,        orders.getAllOrders);
router.put('/admin/orders/:orderId/status',     requireAdmin,        orders.updateOrderStatus);
router.get('/agent/orders',                     requireAgentOrAdmin, orders.getAllOrders);

module.exports = router;
