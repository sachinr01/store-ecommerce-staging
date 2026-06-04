import type { MetadataRoute } from 'next';
import { SITE_URL } from './lib/helpers/siteUrl';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/cart',
          '/checkout',
          '/my-account',
          '/orders',
          '/wishlist',
          '/reset-password',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
