# Nestcase — Full-Stack E-Commerce Platform

A full-stack e-commerce platform for premium dinnerware, glassware, cutlery, and bar accessories. Built with Next.js on the frontend and Express.js on the backend.

---

## Tech Stack

### Frontend
- **Next.js 16** / React 19 / TypeScript 5
- **Tailwind CSS 4** for styling
- **Font Awesome 7** for icons
- React Context API — Cart, Wishlist, Auth, Site Settings

### Backend
- **Express.js 5** / Node.js
- **MySQL2** with connection pooling
- **EJS** for admin panel templating
- **Multer** for file uploads
- **Bcrypt** for password hashing
- **Express-session** for auth sessions
- **Razorpay** for payments
- **Brevo** for transactional email
- **Shiprocket** for shipping

---

## Project Structure

```
project/
│
├── frontend/                        # Next.js storefront (port 3001)
│   ├── app/
│   │   ├── components/              # Reusable UI components
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── MobileNavbar.tsx
│   │   │   ├── Slider.tsx
│   │   │   ├── Banners.tsx
│   │   │   ├── NewArrivals.tsx
│   │   │   ├── PopularProducts.tsx
│   │   │   ├── ProductCard.tsx
│   │   │   ├── LatestPosts.tsx
│   │   │   ├── GiftingWorld.tsx
│   │   │   ├── SalesEvent.tsx
│   │   │   ├── TrustBar.tsx
│   │   │   ├── AccountSidebar.tsx
│   │   │   └── EnquiryForm.tsx
│   │   ├── lib/                     # Context providers & utilities
│   │   │   ├── api.ts
│   │   │   ├── authContext.tsx
│   │   │   ├── cartContext.tsx
│   │   │   ├── wishlistContext.tsx
│   │   │   ├── siteSettingsContext.tsx
│   │   │   ├── price.ts
│   │   │   └── pages.ts
│   │   ├── (footer)/                # Dynamic footer pages (slug-based)
│   │   ├── about-us/
│   │   ├── b2b-connect/
│   │   ├── blog/
│   │   ├── careers/
│   │   ├── cart/
│   │   ├── checkout/
│   │   ├── contact-us/
│   │   ├── faqs/
│   │   ├── my-account/
│   │   ├── orders/
│   │   ├── product/
│   │   ├── product-details/
│   │   ├── reset-password/
│   │   ├── shop/
│   │   ├── wishlist/
│   │   ├── css/                     # Global styles
│   │   ├── layout.tsx               # Root layout
│   │   ├── page.tsx                 # Home page
│   │   ├── error.tsx
│   │   └── not-found.tsx
│   └── package.json
│
└── admin/                           # Express backend + admin panel (port 3000)
    ├── api/                         # REST API controllers
    │   ├── authController.js
    │   ├── authMiddleware.js
    │   ├── cartController.js
    │   ├── contactController.js
    │   ├── couponController.js
    │   ├── mediaController.js
    │   ├── orderController.js
    │   ├── wishlistController.js
    │   ├── guestCookie.js
    │   ├── session.js
    │   └── routes.js
    ├── controllers/                 # Admin panel controllers
    │   ├── authController.js
    │   ├── blogController.js
    │   ├── blogCategoryController.js
    │   ├── categoryController.js
    │   ├── couponController.js
    │   ├── dashboardController.js
    │   ├── mediaController.js
    │   ├── orderController.js
    │   ├── pagesController.js
    │   ├── productController.js
    │   ├── siteSettingsController.js
    │   └── userController.js
    ├── routes/                      # Express route definitions
    │   ├── admin.js
    │   ├── auth.js
    │   ├── blogRoutes.js
    │   ├── blogCategoryRoutes.js
    │   ├── categoryRoutes.js
    │   ├── couponRoutes.js
    │   ├── mediaRoutes.js
    │   ├── orderRoutes.js
    │   ├── pagesRoutes.js
    │   ├── productRoutes.js
    │   ├── siteSettingsRoutes.js
    │   └── userRoutes.js
    ├── views/                       # EJS templates
    │   ├── auth/
    │   ├── blogs/
    │   ├── category/
    │   ├── coupons/
    │   ├── dashboard/
    │   ├── orders/
    │   ├── pages/
    │   ├── partials/
    │   ├── products/
    │   ├── site-settings/
    │   └── users/
    ├── config/
    │   ├── db.js                    # MySQL connection pool
    │   └── razorpay.js
    ├── middleware/
    │   └── auth.js
    ├── helpers/
    │   └── dd.js
    ├── public/                      # Static assets
    │   ├── css/
    │   ├── js/
    │   ├── images/
    │   └── uploads/
    ├── app.js                       # Express entry point
    └── package.json
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- MySQL 8+

### Backend

```bash
cd admin
npm install
npm run dev     # http://localhost:3000
```

### Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:3001
```

---

## Features

### Storefront
- Home page with hero slider, new arrivals, popular products, blog preview
- Shop with product filtering and search
- Product detail pages
- Shopping cart and checkout with Razorpay
- User accounts — register, login, Google OAuth, password reset
- Order history and tracking
- Wishlist
- Blog with categories and dynamic routing
- B2B Connect, About Us, Careers, Contact Us, FAQs
- Dynamic footer pages (slug-based)

### Admin Panel
- Dashboard with sales overview
- Product and category management
- Order management and status updates
- User management
- Blog and blog category management
- Coupon and discount management
- Media/file upload management
- Site settings configuration
- Dynamic pages management

---

## API

Base URL: `/store/api`

| Endpoint | Description |
|---|---|
| `/auth/*` | Login, register, logout, Google OAuth |
| `/cart/*` | Cart operations |
| `/wishlist/*` | Wishlist management |
| `/orders/*` | Order creation and tracking |
| `/products/*` | Product listing and details |
| `/coupons/*` | Coupon validation |
| `/contact` | Contact form |
| `/media/*` | File uploads |
| `/session` | Session info |

---

## Scripts

### Frontend
```bash
npm run dev      # Dev server on port 3001
npm run build    # Production build
npm start        # Production server on port 3001
npm run lint     # ESLint
```

### Backend
```bash
npm run dev      # Dev server with nodemon on port 3000
npm start        # Production server on port 3000
```

---

## Deployment

1. Update `FRONTEND_URL` and `NEXT_PUBLIC_API_URL` to your production URLs
2. Enable `SESSION_SECURE=true` in production
3. Use a managed MySQL instance with SSL enabled
4. Build the frontend: `npm run build && npm start`
5. Run the backend behind a reverse proxy (nginx recommended)
