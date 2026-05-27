'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { notFound } from 'next/navigation';
import { getProductById, getProductBySlug, type ProductDetail } from '../lib/api';
import ProductPageShell from '../components/ProductPageShell';

/**
 * Legacy route: /product-details?id=123
 * Used for internal navigation where only an ID is available.
 * SEO is handled by the canonical /product/[slug] route.
 */
export function ProductDetailsClient({ productId, productSlug }: { productId?: string; productSlug?: string } = {}) {
  if (productSlug) {
    return <ProductDetailsWithSlug slug={productSlug} />;
  }
  return <ProductDetailsWithSearchParams productId={productId} />;
}

function ProductDetailsWithSearchParams({ productId }: { productId?: string }) {
  const searchParams = useSearchParams();
  const id = productId ?? searchParams.get('id') ?? undefined;
  return <ProductDetailsFetcher id={id} slug={undefined} />;
}

function ProductDetailsWithSlug({ slug }: { slug: string }) {
  return <ProductDetailsFetcher id={undefined} slug={slug} />;
}

function ProductDetailsFetcher({ id, slug }: { id?: string; slug?: string }) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let p: ProductDetail;
        if (slug)      p = await getProductBySlug(slug);
        else if (id)   p = await getProductById(id);
        else {
          if (!cancelled) { setError('No product id or slug provided.'); setLoading(false); }
          return;
        }
        if (!cancelled) { setProduct(p); setLoading(false); }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg || 'Failed to load product. Please try again.');
          setLoading(false);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id, slug]);

  if (loading) return (
    <div className="cpd-centered">
      <div className="cpd-spinner" />
      <p style={{ marginTop: 16, fontFamily: 'sans-serif', color: '#888' }}>Loading product…</p>
    </div>
  );
  if (error || !product) return notFound();

  return <ProductPageShell product={product} />;
}

export default function ProductDetailsPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: 80, textAlign: 'center', fontFamily: 'sans-serif', color: '#888' }}>
        Loading…
      </div>
    }>
      <ProductDetailsClient />
    </Suspense>
  );
}
