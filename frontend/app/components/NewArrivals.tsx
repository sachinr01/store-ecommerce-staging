'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { getProducts, getImageUrl, getBestSellers, type Product } from '../lib/api';
import { formatPrice, formatPriceRange } from '../lib/price';
import { getDiscountPercent, isSaleDateActive } from '../lib/helpers/pricing';
import { useWishlist } from '../lib/wishlistContext';
import { usePlaceholderImage } from '../lib/siteSettingsContext';

const toSlug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function ProductCard({ p, idx }: { p: Product; idx: number }) {
  const [hovered, setHovered] = useState(false);
  const { hasItem, addItem, removeItem } = useWishlist();
  const PLACEHOLDER = usePlaceholderImage();
  const inWishlist = hasItem(p.ID);
  const isOutOfStock =
    (p.stock_status !== 'instock' && p.stock_status !== 'onbackorder') ||
    (p.stock_qty !== null && p.stock_qty !== undefined && Number(p.stock_qty) <= 0);

  const priceMin = Number(p.price_min ?? 0);
  const priceMax = Number(p.price_max ?? p.price_min ?? 0);
  const showRange = priceMax > priceMin;
  const salePrice = p._sale_price ? Number(p._sale_price) : null;
  const regularPrice = p._regular_price ? Number(p._regular_price) : null;
  const displayPrice = salePrice ?? regularPrice ?? Number(p.price_min ?? 0);
  const discountPercent = showRange ? null : getDiscountPercent(salePrice, regularPrice);
  const isOnSale = !showRange && salePrice !== null && isSaleDateActive(p._sale_price_dates_from, p._sale_price_dates_to);
  const href = `/shop/product/${toSlug(p.slug || p.title)}`;

  return (
    <div
      className="na-card"
      style={{ animationDelay: `${idx * 60}ms` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="na-img-wrap">
        <Link href={href} tabIndex={-1} aria-hidden="true">
          <img
            src={getImageUrl(p.thumbnail_url, PLACEHOLDER)}
            alt={p.title}
            loading={idx < 4 ? 'eager' : 'lazy'}
            className={`na-img${hovered ? ' zoomed' : ''}`}
            onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
          />
        </Link>
        <div className="na-badges">
          {isOnSale && <span className="na-badge sale">Sale</span>}
          {isOutOfStock && (
            <span className="na-badge oos">Sold Out</span>
          )}
        </div>
        <button
          className={`na-wishlist${inWishlist ? ' active' : ''}`}
          aria-label={inWishlist ? `Remove ${p.title} from wishlist` : `Add ${p.title} to wishlist`}
          onClick={async e => {
            e.preventDefault();
            try {
              if (inWishlist) await removeItem(p.ID);
              else await addItem({ id: p.ID, title: p.title, price: displayPrice, image: getImageUrl(p.thumbnail_url), inStock: !isOutOfStock });
            } catch {
              // optimistic update already rolled back by context
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
            fill={inWishlist ? '#e74c3c' : 'none'} stroke={inWishlist ? '#e74c3c' : 'currentColor'} strokeWidth="1.8">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
        <div className={`na-overlay${hovered ? ' show' : ''}`} aria-hidden={!hovered}>
          <Link href={href} className="na-quick-view btn-view-product">View Product</Link>
        </div>
      </div>
      <div className="na-info">
        <Link href={href} className="na-name">{p.title}</Link>
        <div className="na-price-row">
          {!showRange && salePrice !== null && regularPrice !== null && (
            <span className="na-old-price">{formatPrice(regularPrice)}</span>
          )}
          <span className={`na-price${isOnSale ? ' sale' : ''}`}>
            {showRange ? formatPriceRange(priceMin, priceMax) : formatPrice(displayPrice)}
          </span>
          {discountPercent !== null && <span className="na-save-badge">{discountPercent}% off</span>}
        </div>
        {isOutOfStock && (
          <span className="na-stock-label out">Out of Stock</span>
        )}
      </div>
    </div>
  );
}

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
  scrollable = false,
}: {
  title: string;
  products: Product[];
  loading: boolean;
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
          ? Array.from({ length: scrollable ? 8 : 4 }).map((_, i) => <SkeletonCard key={i} />)
          : products.map((p, i) => <ProductCard key={p.ID} p={p} idx={i} />)
        }
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

  useEffect(() => {
    getProducts(new URLSearchParams({ sort_by: 'newest', limit: '12' }))
      .then(all => setProducts(all.slice(0, 12)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="na-outer na-outer-top">
      <ProductGrid title="Newly Launched Products" products={products} loading={loading} scrollable />
      <div className="na-view-all-wrap btn-view-product-wrap">
        <Link href="/shop" className="na-view-all-btn btn-view-product btn-view-product--inline">View All Products</Link>
      </div>
    </section>
  );
}

export function BestSellers() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBestSellers(5)
      .then(data => setProducts(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="na-outer na-outer-bs">
      <ProductGrid title="Best Sellers Products" products={products} loading={loading} />
      <div className="na-view-all-wrap btn-view-product-wrap">
        <Link href="/shop" className="na-view-all-btn btn-view-product btn-view-product--inline">View All Products</Link>
      </div>
    </section>
  );
}
