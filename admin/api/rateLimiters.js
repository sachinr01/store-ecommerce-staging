const rateLimit = require('express-rate-limit');

const onLimitReached = (req, res) => {
  res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
};

// Auth: login, register, password reset — brute-force targets
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});

// Password reset specifically — tighter window
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});

// Contact form — spam prevention
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});

// Order placement — abuse / fraud prevention
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});

// Coupon apply — enumeration prevention
const couponLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});

module.exports = { authLimiter, passwordResetLimiter, contactLimiter, orderLimiter, couponLimiter };
