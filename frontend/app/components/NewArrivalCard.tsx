// Server component — no 'use client' directive.
// Only WishlistButton (imported below) is a client island.

import Link from 'next/link';
import WishlistButton from './WishlistButton';
import ProductImage from './ProductImage';
import { formatPrice, formatPriceRange } from '../lib/price';
import { getDiscountPercent, isSaleDateActive } from '../lib/helpers/pricing';
import { getImageUrl, type Product } from '../lib/api';

const toSlug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

interface NewArrivalCardProps {
  p: Product;
  idx: number;
  placeholder: string;
}

export default function NewArrivalCard({ p, idx, placeholder }: NewArrivalCardProps) {
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
  const isOnSale =
    !showRange &&
    salePrice !== null &&
    isSaleDateActive(p._sale_price_dates_from, p._sale_price_dates_to);
  const href = `/shop/product/${toSlug(p.slug || p.title)}`;
  const imgSrc = getImageUrl(p.thumbnail_url, placeholder);

  return (
    <div className="na-card" style={{ animationDelay: `${idx * 60}ms` }}>
      <div className="na-img-wrap">
        <Link href={href} tabIndex={-1} aria-hidden="true">
          <ProductImage
            src={imgSrc}
            alt={p.title}
            loading={idx < 4 ? 'eager' : 'lazy'}
            className="na-img"
            fallback={placeholder}
          />
        </Link>
        <div className="na-badges">
          {isOnSale && <span className="na-badge sale">Sale</span>}
          {isOutOfStock && <span className="na-badge oos">Sold Out</span>}
        </div>
        {/* Client island — only this button ships JS */}
        <WishlistButton
          productId={p.ID}
          title={p.title}
          price={displayPrice}
          image={imgSrc}
          inStock={!isOutOfStock}
          className="na-wishlist"
        />
        <div className="na-overlay">
          <Link href={href} className="na-quick-view btn-view-product">
            View Product
          </Link>
        </div>
      </div>
      <div className="na-info">
        <Link href={href} className="na-name">
          {p.title}
        </Link>
        <div className="na-price-row">
          {!showRange && salePrice !== null && regularPrice !== null && (
            <span className="na-old-price">{formatPrice(regularPrice)}</span>
          )}
          <span className={`na-price${isOnSale ? ' sale' : ''}`}>
            {showRange ? formatPriceRange(priceMin, priceMax) : formatPrice(displayPrice)}
          </span>
          {discountPercent !== null && (
            <span className="na-save-badge">{discountPercent}% off</span>
          )}
        </div>
        {isOutOfStock && <span className="na-stock-label out">Out of Stock</span>}
      </div>
    </div>
  );
}
