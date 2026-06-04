import type { MetadataRoute } from 'next';
import { SITE_URL } from './lib/helpers/siteUrl';
import { getProducts } from './lib/api';
import { getBlogs } from './blog/utils/getBlogs';

// Static routes with their priorities and change frequencies
const staticRoutes: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}`,            lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
  { url: `${SITE_URL}/shop`,       lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
  { url: `${SITE_URL}/blog`,       lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.8 },
  { url: `${SITE_URL}/about-us`,   lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: `${SITE_URL}/contact-us`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: `${SITE_URL}/faqs`,       lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
  { url: `${SITE_URL}/careers`,    lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fetch all products
  const productEntries: MetadataRoute.Sitemap = await getProducts()
    .then((products) =>
      products.map((p) => ({
        url: `${SITE_URL}/shop/product/${p.slug}`,
        lastModified: p.date_added ? new Date(p.date_added) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }))
    )
    .catch(() => []);

  // Fetch all blogs
  const blogEntries: MetadataRoute.Sitemap = await getBlogs()
    .then((blogs) =>
      blogs.map((b) => ({
        url: `${SITE_URL}/blog/${b.slug}`,
        lastModified: b.date ? new Date(b.date) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }))
    )
    .catch(() => []);

  return [...staticRoutes, ...productEntries, ...blogEntries];
}
