/**
 * Site URL helper — for contexts where Next.js metadataBase does NOT apply.
 */
export const SITE_URL = (
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'http://localhost:3001'
).replace(/\/$/, '');

/**
 * Makes a path absolute using SITE_URL.
 * If the value is already an absolute URL, returns it unchanged.
 */
export function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Absolute URL for Open Graph images (product thumbnail, blog hero, etc.). */
export function resolveOgImageUrl(filePath: string | null | undefined): string | undefined {
  const trimmed = filePath?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/')) return absoluteUrl(trimmed);
  if (trimmed.startsWith('uploads/')) return absoluteUrl(`/${trimmed}`);
  if (trimmed.startsWith('store/')) return absoluteUrl(`/${trimmed}`);
  // DB paths like "products/file.jpg" or wrongly stored "images/2.jpg"
  return absoluteUrl(`/uploads/${trimmed}`);
}

/** Backend SEO field — only when admin set it; omit the meta tag otherwise. */
export function resolveSeoField(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export const resolveSeoCanonical = resolveSeoField;

/**
 * Absolute product URL for JSON-LD — uses admin canonical when set, else the product path.
 * Not used for <link rel="canonical">; see resolveSeoCanonical for metadata.
 */
export function productCanonicalUrl(slug: string, seoCanonicalTag?: string | null): string {
  const custom = resolveSeoCanonical(seoCanonicalTag);
  if (custom) return absoluteUrl(custom);
  return absoluteUrl(`/store/shop/product/${slug}`);
}
