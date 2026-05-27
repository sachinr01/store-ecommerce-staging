// Server component — no 'use client' directive.
// Only WishlistButton is a client island.

import Link from 'next/link';
import WishlistButton from '../components/WishlistButton';
import ProductImage from '../components/ProductImage';
import { formatPrice, formatPriceRange } from '../lib/price';
import { getDiscountPercent, isSaleDateActive } from '../lib/helpers/pricing';
import { getImageUrl, type Product } from '../lib/api';

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

interface ShopProductCardProps {
  product: Product;
  idx: number;
  listMode?: boolean;
  placeholder: string;
}

export default function ShopProductCard({
  product,
  idx,
  listMode,
  placeholder,
}: ShopProductCardProps) {
  const isOutOfStock =
    (product.stock_status !== 'instock' && product.stock_status !== 'onbackorder') ||
    (product.stock_qty !== null &&
      product.stock_qty !== undefined &&
      Number(product.stock_qty) <= 0);

  const slugBase = toSlug(product.slug || product.title) || 'product';
  const productHref = `/shop/product/${slugBase}`;

  const priceMin = Number(product.price_min ?? 0);
  const priceMax = Number(product.price_max ?? product.price_min ?? 0);
  const showRange = priceMin > 0 && priceMax > priceMin;
  const salePrice = product._sale_price ? Number(product._sale_price) : null;
  const regularPrice = product._regular_price ? Number(product._regular_price) : null;
  const displayPrice = salePrice ?? regularPrice ?? (priceMin > 0 ? priceMin : null);
  const isOnSale =
    !showRange &&
    salePrice !== null &&
    salePrice > 0 &&
    isSaleDateActive(product._sale_price_dates_from, product._sale_price_dates_to);
  const priceStr = showRange
    ? formatPriceRange(priceMin, priceMax)
    : displayPrice
    ? formatPrice(displayPrice)
    : '';
  const discountPercent = showRange ? null : getDiscountPercent(salePrice, regularPrice);
  const imgSrc = getImageUrl(product.thumbnail_url, placeholder);

  return (
    <div
      className="csp-card"
      style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
    >
      <div className="csp-img-wrap">
        <Link href={productHref} tabIndex={-1} aria-hidden="true">
          <ProductImage
            src={imgSrc}
            alt={product.title}
            className="csp-img"
            loading={idx < 8 ? 'eager' : 'lazy'}
            fallback={placeholder}
          />
        </Link>

        <div className="csp-badges">
          {isOnSale && <span className="csp-badge sale">Sale</span>}
          {isOutOfStock && <span className="csp-badge oos">Sold Out</span>}
        </div>

        {/* Client island — only this button ships JS */}
        <WishlistButton
          productId={product.ID}
          title={product.title}
          price={displayPrice ?? 0}
          image={imgSrc}
          inStock={!isOutOfStock}
          className="csp-wishlist"
        />

        <div className="csp-overlay">
          <Link href={productHref} className="csp-quick-view btn-view-product">
            View Product
          </Link>
        </div>
      </div>

      <div className="csp-info">
        <Link href={productHref} className="csp-name">
          {product.title}
        </Link>
        <div className="csp-price-row">
          {!showRange && salePrice !== null && regularPrice !== null && (
            <span className="csp-old-price" aria-label="Regular price">
              {formatPrice(regularPrice)}
            </span>
          )}
          <span className={`csp-price${isOnSale ? ' sale' : ''}`}>{priceStr}</span>
          {discountPercent !== null && (
            <span className="csp-save-badge">{discountPercent}% off</span>
          )}
        </div>
        {isOutOfStock && <span className="csp-stock-label out">Out of Stock</span>}
        {listMode && product.short_description && (
          <p className="csp-list-desc">
            {product.short_description.replace(/<[^>]+>/g, '')}
          </p>
        )}
      </div>
    </div>
  );
}
