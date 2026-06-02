import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import Script from 'next/script';
import ProductPageShell from '../../components/ProductPageShell';
import type { ProductDetail } from '../../lib/api';
import { htmlToText } from '../../lib/helpers/html';
import { buildAdminSeoMetadata } from '../../lib/helpers/seoMetadata';
import { productCanonicalUrl, resolveOgImageUrl } from '../../lib/helpers/siteUrl';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/store/api';

async function fetchProduct(slug: string): Promise<ProductDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/products/slug/${slug}`, {
      // ISR: cache page for 60s, revalidate in background — avoids hitting API on every request
      next: { revalidate: 60 },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? (json.data as ProductDetail) : null;
  } catch {
    return null;
  }
}

// Build JSON-LD Product schema for Google rich results
function buildProductJsonLd(product: ProductDetail, slug: string) {
  const price = product.regular_price ?? product.price_min;
  const salePrice = product.sale_price;
  const availability = product.stock_status === 'instock'
    ? 'https://schema.org/InStock'
    : product.stock_status === 'onbackorder'
      ? 'https://schema.org/BackOrder'
      : 'https://schema.org/OutOfStock';

  const canonicalUrl = productCanonicalUrl(slug, product.seo_canonical_tag);

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: htmlToText(product.short_description || product.description || ''),
    url: canonicalUrl,
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.thumbnail_url ? { image: [product.thumbnail_url] } : {}),
    ...(product.category_name ? { category: product.category_name } : {}),
    offers: {
      '@type': 'Offer',
      url: canonicalUrl,
      priceCurrency: 'INR',
      price: salePrice && salePrice !== '' ? salePrice : (price ?? '0'),
      availability,
      priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
  };

  // Add aggregate rating if available
  if (product.avg_rating && product.review_count && product.review_count > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.avg_rating,
      reviewCount: product.review_count,
    };
  }

  return jsonLd;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProduct(slug);
  if (!product) return {};

  const seo = buildAdminSeoMetadata(
    {
      seo_meta_title: product.seo_meta_title,
      seo_meta_description: product.seo_meta_description,
      seo_canonical_tag: product.seo_canonical_tag,
      fallbackTitle: product.title,
    },
    { absoluteTitle: true },
  );
  const shouldIndex = (product.seo_meta_index || 'yes').toLowerCase() !== 'no';
  const ogImageUrl  = resolveOgImageUrl(product.thumbnail_url);

  return {
    ...seo,
    robots: { index: shouldIndex, follow: shouldIndex },
    openGraph: {
      ...seo.openGraph,
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, alt: product.title }] } : {}),
    },
  };
}

export default async function ProductSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await fetchProduct(slug);

  if (!product) return notFound();

  const jsonLd = buildProductJsonLd(product, slug);

  return (
    <>
      {/* JSON-LD structured data for Google rich results (price, availability, ratings) */}
      <Script
        id="product-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Suspense fallback={
        <div style={{ padding: 80, textAlign: 'center', fontFamily: 'sans-serif', color: '#888' }}>
          Loading...
        </div>
      }>
        <ProductPageShell product={product} />
      </Suspense>
    </>
  );
}
