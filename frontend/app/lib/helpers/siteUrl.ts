/**
 * Site URL helper — for contexts where Next.js metadataBase does NOT apply.
 *
 * Next.js automatically resolves relative paths in generateMetadata() against
 * metadataBase (set in layout.tsx). So for <title>, <meta>, alternates.canonical,
 * openGraph.url etc. — relative paths are fine and correct.
 *
 * This helper is needed for:
 *  - JSON-LD structured data (<script type="application/ld+json">) — raw script tag,
 *    metadataBase does not apply, must be absolute URLs.
 *  - Any other place outside Next.js metadata API that needs a full URL.
 *
 * Env var priority:
 *  1. SITE_URL             — server-only, not exposed to browser (set in prod deployment)
 *  2. NEXT_PUBLIC_SITE_URL — public fallback
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

/**
 * Absolute canonical URL for a product — used in JSON-LD only.
 * For generateMetadata(), use the relative path directly; Next.js handles resolution.
 */
export function productCanonicalUrl(slug: string, seoCanonicalTag?: string | null): string {
  if (seoCanonicalTag) return absoluteUrl(seoCanonicalTag);
  return absoluteUrl(`/store/shop/product/${slug}`);
}
