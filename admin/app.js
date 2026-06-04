const express = require('express');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static files on BOTH paths (local + VPS)
app.use('/admin/css', express.static(path.join(__dirname, 'public/css')));
app.use('/admin/js', express.static(path.join(__dirname, 'public/js')));
app.use('/admin/images', express.static(path.join(__dirname, 'public/images')));
app.use('/admin/fonts', express.static(path.join(__dirname, 'public/fonts')));
app.use('/admin/libs', express.static(path.join(__dirname, 'public/libs')));
// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ✅ Local paths working too
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/fonts', express.static(path.join(__dirname, 'public/fonts')));
app.use('/libs', express.static(path.join(__dirname, 'public/libs')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'secret123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// ✅ Auto pass admin session to all views
app.use((req, res, next) => {
    res.locals.admin = req.session.admin || null;
    res.locals.basePath = process.env.BASE_PATH || '';
    res.locals.currentRoute = req.path; // ✅ add this
    next();
});

app.use((req, res, next) => {
  res.locals.currentRoute = req.originalUrl;
  next();
});

// ✅ basePath variable for EJS templates
app.locals.basePath = process.env.BASE_PATH || '';

const authRoutes  = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const apiRoutes   = require('./api/routes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes   = require('./routes/orderRoutes');
const userRoutes    = require('./routes/userRoutes');
const siteSettingsRoutes = require('./routes/siteSettingsRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const couponRoutes = require('./routes/couponRoutes');
const blogCategoryRoutes = require('./routes/blogCategoryRoutes');
const blogRoutes = require('./routes/blogRoutes');
const pagesRoutes = require('./routes/pagesRoutes');

app.use('/admin', pagesRoutes);
app.use('/admin', blogRoutes);
app.use('/admin', blogCategoryRoutes);
app.use('/admin', couponRoutes);
app.use('/admin', categoryRoutes);
app.use('/admin', mediaRoutes);
app.use('/admin', siteSettingsRoutes);
app.use('/admin', productRoutes);
app.use('/admin', orderRoutes);
app.use('/admin', userRoutes);

app.use('/admin', authRoutes);
app.use('/admin', adminRoutes);

// CORS for frontend
app.use('/api', (req, res, next) => {
    const allowed = [
        process.env.FRONTEND_URL,
        'http://localhost:3001',
        'https://www.gaffis.org',
        ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000'] : []),
    ].filter(Boolean);
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
