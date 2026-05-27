'use client';
// This file stays 'use client' only because it fetches data client-side
// via useEffect. The actual card rendering is delegated to NewArrivalCard
// (a server component), keeping the JS bundle minimal.

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { getProducts, getBestSellers, type Product } from '../lib/api';
import { usePlaceholderImage } from '../lib/siteSettingsContext';
import NewArrivalCard from './NewArrivalCard';

function SkeletonCard() {
  return (
    <div className="na-card na-skeleton">
      <div className="na-img-wrap na-skel-img" />
      <div className="na-info">
        <div className="na-skel-line na-skel-w70" />
        <div className="na-skel-line na-skel-w40 na-skel-mt6" />
        <div className="na-skel-line na-skel-w30 na-skel-mt10" />
      </div>
    </div>
  );
}

function ProductGrid({
  title,
  products,
  loading,
  placeholder,
  scrollable = false,
}: {
  title: string;
  products: Product[];
  loading: boolean;
  placeholder: string;
  scrollable?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollProducts = (direction: 'prev' | 'next') => {
    const row = scrollRef.current;
    if (!row) return;
    row.scrollBy({
      left: row.clientWidth * (direction === 'next' ? 0.85 : -0.85),
      behavior: 'smooth',
    });
  };

  return (
    <div className={`na-section${scrollable ? ' na-scroll-section' : ''}`}>
      <h3 className="na-section-title">{title}</h3>
      {scrollable && (
        <button
          className="na-scroll-btn na-scroll-btn-prev"
          type="button"
          aria-label={`Scroll ${title} left`}
          onClick={() => scrollProducts('prev')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}
      <div ref={scrollRef} className={`na-grid${scrollable ? ' na-grid-scroll' : ''}`}>
        {loading
          ? Array.from({ length: scrollable ? 8 : 5 }).map((_, i) => <SkeletonCard key={i} />)
          : products.map((p, i) => (
              <NewArrivalCard key={p.ID} p={p} idx={i} placeholder={placeholder} />
            ))}
      </div>
      {scrollable && (
        <button
          className="na-scroll-btn na-scroll-btn-next"
          type="button"
          aria-label={`Scroll ${title} right`}
          onClick={() => scrollProducts('next')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function NewArrivals() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const PLACEHOLDER = usePlaceholderImage();

  useEffect(() => {
    getProducts(new URLSearchParams({ sort_by: 'newest', limit: '12' }))
      .then(all => setProducts(all.slice(0, 12)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="na-outer na-outer-top">
      <ProductGrid
        title="Newly Launched Products"
        products={products}
        loading={loading}
        placeholder={PLACEHOLDER}
        scrollable
      />
      <div className="na-view-all-wrap btn-view-product-wrap">
        <Link href="/shop" className="na-view-all-btn btn-view-product btn-view-product--inline">
          View All Products
        </Link>
      </div>
    </section>
  );
}

export function BestSellers() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const PLACEHOLDER = usePlaceholderImage();

  useEffect(() => {
    getBestSellers(5)
      .then(data => setProducts(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="na-outer na-outer-bs">
      <ProductGrid
        title="Best Sellers Products"
        products={products}
        loading={loading}
        placeholder={PLACEHOLDER}
      />
      <div className="na-view-all-wrap btn-view-product-wrap">
        <Link href="/shop" className="na-view-all-btn btn-view-product btn-view-product--inline">
          View All Products
        </Link>
      </div>
    </section>
  );
}
