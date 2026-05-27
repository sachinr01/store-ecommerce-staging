import type { Metadata, Viewport } from "next";
import "./css/styles.css";
import { CartProvider } from "./lib/cartContext";
import { WishlistProvider } from "./lib/wishlistContext";
import { AuthProvider } from "./lib/authContext";
import { SiteSettingsProvider } from "./lib/siteSettingsContext";
import { SITE_URL } from "./lib/helpers/siteUrl";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Nestcase';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    'Discover Nestcase premium bone-ash-free crockery, lead-free glassware, 304 food-grade stainless steel cutlery, bottles and bar accessories. Shop health-friendly dinnerware at Nestcase for a stylish and healthy lifestyle.',
  metadataBase: new URL(SITE_URL),
  openGraph: {
    siteName: SITE_NAME,
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="no-js" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/v4-shims.min.css" />
        <link rel="stylesheet" type="text/css" href="/store/js/specific/revolution-slider/css/settings.css" media="screen" />
        <link href="https://fonts.googleapis.com/css?family=Open+Sans:100,400,600,700,300" rel="stylesheet" type="text/css" />
        <link href="https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,300;0,400;0,700;1,300;1,400&display=swap" rel="stylesheet" />
        <link rel="shortcut icon" href="/store/images/favicon.png" type="image/x-icon" />
        <link rel="apple-touch-icon" href="/store/images/favicon.png" type="image/x-icon" />
      </head>
      <body className="responsive" id="demo-shop" suppressHydrationWarning>
        <div className="all_content" suppressHydrationWarning>
          <CartProvider>
            <AuthProvider>
              <WishlistProvider>
                <SiteSettingsProvider>
                  {children}
                </SiteSettingsProvider>
              </WishlistProvider>
            </AuthProvider>
          </CartProvider>
        </div>

        {/* Load scripts in the same order as original */}
        <script src="/store/js/core/jquery-2.1.1.min.js"></script>
        <script src="/store/js/core/load.js"></script>
        <script src="/store/js/core/jquery.easing.1.3.js"></script>
        <script src="/store/js/core/modernizr-2.8.2.min.js"></script>
        <script src="/store/js/core/imagesloaded.pkgd.min.js"></script>
        <script src="/store/js/core/respond.src.js"></script>
        <script src="/store/js/libs.js"></script>
        <script src="/store/js/specific/bigvideo.js"></script>
        <script dangerouslySetInnerHTML={{
          __html: `
            // Override any revolution slider calls to prevent errors
            if (typeof jQuery !== 'undefined') {
              (function($) {
                // Store original revolution function if it exists
                var originalRevolution = $.fn.revolution;
                
                // Override to safely handle missing slider
                $.fn.revolution = function(options) {
                  if (this.length === 0) {
                    return this;
                  }
                  if (typeof originalRevolution === 'function') {
                    try {
                      return originalRevolution.call(this, options);
                    } catch(e) {
                      console.log('Revolution slider skipped:', e.message);
                      return this;
                    }
                  }
                  return this;
                };
              })(jQuery);
            }
          `
        }} />
        <script src="/store/js/main.js"></script>
      </body>
    </html>
  );
}
