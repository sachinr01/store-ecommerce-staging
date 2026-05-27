import type { MetadataRoute } from 'next';
import { SITE_URL } from './lib/helpers/siteUrl';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/store/',
        disallow: [
          '/store/cart',
          '/store/checkout',
          '/store/my-account',
          '/store/orders',
          '/store/wishlist',
          '/store/reset-password',
        ],
      },
    ],
    sitemap: `${SITE_URL}/store/sitemap.xml`,
  };
}
