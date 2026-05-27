'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getImageUrl, type ProductDetail } from '../lib/api';
import Header from './Header';
import Footer from './Footer';
import { formatPrice, formatPriceRange } from '../lib/price';
import { getDiscountPercent, isSaleDateActive } from '../lib/helpers/pricing';
import { sanitizeHtml } from '../lib/helpers/html';
import {
  getSwatchStyle,
  hasColors as productHasColors,
  hasSizes as productHasSizes,
  hasFullSelection as productHasFullSelection,
  resolveVariation,
  colorHasStock,
  sizeHasStock,
  isVariationInStock,
  resolveInStock,
} from '../lib/product/variations';
import { useCart } from '../lib/cartContext';
import { useWishlist } from '../lib/wishlistContext';
import { usePlaceholderImage } from '../lib/siteSettingsContext';
import StarRating from './StarRating';




function AccordionItem({ label, content }: { label: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`cpd-acc-item${open ? ' open' : ''}`}>
      <button className="cpd-acc-header" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <h5 className="cpd-acc-label">{label}</h5>
        <svg className="cpd-acc-chevron" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && <div className="cpd-acc-body" dangerouslySetInnerHTML={{ __html: content }} />}
    </div>
  );
}

/**
 * ProductPageShell — receives a fully-loaded ProductDetail from the server.
 * No data fetching here; all interactivity only (cart, wishlist, variant selection).
 */
export default function ProductPageShell({ product }: { product: ProductDetail }) {
  const { addItem }    = useCart();
  const { hasItem: inWishlist, addItem: addToWishlist, removeItem: removeFromWishlist } = useWishlist();
  const PLACEHOLDER = usePlaceholderImage();

  const [mainImage,     setMainImage]     = useState(0);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize,  setSelectedSize]  = useState('');
  const [quantity,      setQuantity]      = useState(1);
  const [addedFlash,    setAddedFlash]    = useState(false);
  const [pinned,        setPinned]        = useState(false);

  useEffect(() => {
    const onScroll = () => setPinned(window.scrollY > 400);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setMainImage(0); }, [selectedColor]);

  /* -- Variation logic -- */
  const hasColors = productHasColors(product);
  const hasSizes  = productHasSizes(product);
  const sel       = { selectedColor, selectedSize };

  const hasFullSelection = productHasFullSelection(product, sel);
  const bestMatch        = resolveVariation(product, sel);

  const currentRegular   = bestMatch ? Number(bestMatch.regular_price || 0) || null : null;
  const currentSalePrice = bestMatch?.sale_price && bestMatch.sale_price !== '' ? Number(bestMatch.sale_price) : null;

  const priceMin = Number(product.price_min ?? 0);
  const priceMax = Number(product.price_max ?? 0);

  const saleDateActive  = isSaleDateActive(product.sale_price_dates_from, product.sale_price_dates_to);
  const simpleRegular   = !product.variations.length && product.regular_price ? Number(product.regular_price) : null;
  const simpleSalePrice = !product.variations.length && product.sale_price && saleDateActive ? Number(product.sale_price) : null;

  const displayRegular   = bestMatch ? currentRegular : (simpleRegular ?? null);
  const displaySalePrice = bestMatch ? currentSalePrice : simpleSalePrice;
  const displayMRP       = displaySalePrice !== null && displayRegular !== null ? displayRegular : null;
  const displayPrice     = displaySalePrice ?? displayRegular ?? (product.variations.length > 0 ? null : (hasFullSelection ? priceMin : null));
  const showRange        = product.variations.length > 0 && !bestMatch && priceMax > priceMin;
  const priceRangeStr    = formatPriceRange(priceMin, priceMax);

  const isAddToCartEnabled = !product.variations.length || hasFullSelection;

  const inStock    = resolveInStock(product, sel, bestMatch);
  const canAddToCart = isAddToCartEnabled && inStock;

  const shortDescHtml     = sanitizeHtml(product.short_description || '', { normalizeSpecLists: false });
  const variationDescHtml = sanitizeHtml(bestMatch?.variation_description || '', { normalizeSpecLists: false });
  const hasVariationDesc  = variationDescHtml.trim().length > 0;
  const fullDescHtml      = hasVariationDesc
    ? variationDescHtml
    : sanitizeHtml(product.description || product.short_description || '', { normalizeSpecLists: false });

  const accordionItems = [
    { id: 'acc1', label: 'Features',   content: sanitizeHtml(product.product_features   || '', { normalizeSpecLists: false }) },
    { id: 'acc2', label: 'Material',   content: sanitizeHtml(product.product_material   || '', { normalizeSpecLists: false }) },
    { id: 'acc3', label: 'Collection', content: sanitizeHtml(product.product_collection || '', { normalizeSpecLists: false }) },
    { id: 'acc4', label: 'Included',   content: sanitizeHtml(product.product_included   || '', { normalizeSpecLists: false }) },
    { id: 'acc5', label: 'Care',       content: sanitizeHtml(product.product_care       || '', { normalizeSpecLists: false }) },
    { id: 'acc6', label: 'More Info',  content: sanitizeHtml(product.product_more_info  || '', { normalizeSpecLists: false }) },
  ].filter(item => item.content.trim());

  const handleAddToCart = async () => {
    if (!canAddToCart) return;
    try {
      await addItem({
        productId: product.ID,
        variationId: bestMatch?.ID,
        color: selectedColor || undefined,
        size: selectedSize || undefined,
        quantity,
        image: productImage,
      });
      setAddedFlash(true);
      setTimeout(() => setAddedFlash(false), 2000);
    } catch (err) {
      console.error('Add to cart failed:', err);
    }
  };

  const toggleWishlist = async () => {
    try {
      if (inWishlist(product.ID)) {
        await removeFromWishlist(product.ID);
      } else {
        await addToWishlist({
          id: product.ID,
          title: product.title,
          price: Number(displayPrice) || 0,
          image: productImage,
          inStock,
        });
      }
    } catch { /* optimistic update rolled back by context */ }
  };

  const sortedGallery = [...(product.gallery_urls ?? [])].sort(
    (a, b) => (b.is_thumbnail ? 1 : 0) - (a.is_thumbnail ? 1 : 0)
  );

  const defaultImages = sortedGallery.length > 0
    ? sortedGallery.map(g => getImageUrl(g.file_path, PLACEHOLDER))
    : (product.thumbnail_url ? [getImageUrl(product.thumbnail_url, PLACEHOLDER)] : [PLACEHOLDER]);

  const selectedVariationImages = (() => {
    if (!selectedColor && !selectedSize) return null;
    const norm = (v: string) => v.toLowerCase().trim().replace(/\s+/g, '-');
    const variation = product.variations.find(v => {
      const colorMatch = !selectedColor || norm(v.color ?? '') === norm(selectedColor);
      const sizeMatch  = !selectedSize  || norm(v.size  ?? '') === norm(selectedSize);
      return colorMatch && sizeMatch && v.image_urls?.length > 0;
    });
    if (!variation?.image_urls?.length) return null;
    return variation.image_urls.map(p => getImageUrl(p, PLACEHOLDER));
  })();

  const allImages    = selectedVariationImages ?? defaultImages;
  const productImage = allImages[0];

  return (
    <>
      <Header />

      {/* ── Breadcrumb ── */}
      <nav className="cpd-breadcrumb">
        <Link href="/">Home</Link>
        <span className="cpd-sep">›</span>
        <Link href="/shop">Shop</Link>
        <span className="cpd-sep">›</span>
        <span>{product.title}</span>
      </nav>

      {/* ── Main two-column layout ── */}
      <div className="cpd-wrap">

        {/* ════ LEFT: Gallery ════ */}
        <div className="cpd-gallery-col">
          <div className="cpd-thumbs-strip">
            {allImages.slice(0, 5).map((img, idx) => {
              const isLast = idx === 4 && allImages.length > 5;
              const remaining = allImages.length - 5;
              return (
                <button key={idx} onClick={() => setMainImage(idx)}
                  className={`cpd-thumb${mainImage === idx ? ' active' : ''}`}>
                  <img src={img} alt={`${product.title} - image ${idx + 1}`} loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
                  {isLast && <span className="cpd-thumb-more">+{remaining}</span>}
                </button>
              );
            })}
          </div>

          <div className="cpd-main-img-wrap">
            <img src={allImages[mainImage]} alt={product.title} className="cpd-main-img"
              onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}/>

            {allImages.length > 1 && (
              <>
                <button className={`cpd-img-arrow prev${allImages.length > 5 ? ' desktop-visible' : ''}`}
                  onClick={() => setMainImage(i => Math.max(0, i - 1))} aria-label="Previous image">‹</button>
                <button className={`cpd-img-arrow next${allImages.length > 5 ? ' desktop-visible' : ''}`}
                  onClick={() => setMainImage(i => Math.min(allImages.length - 1, i + 1))} aria-label="Next image">›</button>
              </>
            )}

            {displaySalePrice && <span className="cpd-sale-badge">Sale</span>}

            <button className="cpd-img-wishlist" onClick={toggleWishlist} title="Add to Wishlist">
              <svg width="18" height="18" viewBox="0 0 24 24"
                fill={inWishlist(product.ID) ? '#e74c3c' : 'none'}
                stroke={inWishlist(product.ID) ? '#e74c3c' : '#666'} strokeWidth="1.8">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>

            {allImages.length > 1 && (
              <div className={`cpd-img-dots${allImages.length > 5 ? ' desktop-visible' : ''}`}>
                {allImages.map((_, i) => (
                  <button key={i} onClick={() => setMainImage(i)}
                    className={`cpd-dot${mainImage === i ? ' active' : ''}`}
                    aria-label={`View image ${i + 1}`} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ════ RIGHT: Info ════ */}
        <div className="cpd-info-col">

          <div className="cpd-heading-row">
            <h1 className="cpd-title">{product.title}</h1>
            <span className={`cpd-stock-badge${
              !inStock ? ' out'
              : (bestMatch?.stock_status === 'onbackorder' || (!product.variations.length && product.stock_status === 'onbackorder')) ? ' backorder'
              : ' in'
            }`}>
              {!inStock
                ? '✗ Out of Stock'
                : (bestMatch?.stock_status === 'onbackorder' || (!product.variations.length && product.stock_status === 'onbackorder'))
                  ? '⏳ Available on Backorder'
                  : '✓ In Stock'}
            </span>
          </div>

          {/* Price */}
          <div className="cpd-price-block">
            {showRange ? (
              <span className="cpd-price">{priceRangeStr}</span>
            ) : displayMRP ? (
              <>
                <span className="cpd-old-price">{formatPrice(displayMRP)}</span>
                <span className="cpd-price sale">{formatPrice(displayPrice)}</span>
                {displayMRP != null && displayMRP > 0 && displayPrice != null && displayPrice > 0 && (
                  <span className="cpd-save-badge">
                    {(() => { const d = getDiscountPercent(displayPrice, displayMRP); return d ? `${d}% off` : null; })()}
                  </span>
                )}
              </>
            ) : displayPrice ? (
              <span className="cpd-price">{formatPrice(displayPrice)}</span>
            ) : (
              <span className="cpd-price">{priceRangeStr}</span>
            )}
          </div>

          <div className="cpd-divider" />

          {(hasVariationDesc || shortDescHtml) && (
            <div className="cpd-short-desc"
              dangerouslySetInnerHTML={{ __html: hasVariationDesc ? variationDescHtml : shortDescHtml }} />
          )}

          {/* ── Color selector ── */}
          {hasColors && product.attributes.colors.length > 0 && (
            <div className="cpd-option-block">
              <div className="cpd-option-label">
                <span>Colour</span>
                {selectedColor && <span className="cpd-option-selected">— {selectedColor}</span>}
              </div>
              <div className="cpd-color-row">
                {product.attributes.colors.map(c => {
                  const swatch = getSwatchStyle(c);
                  const colorInStock = product.variations.length > 0 ? colorHasStock(product, c.attr_slug, selectedSize) : true;
                  return (
                    <button key={c.attr_id}
                      title={!colorInStock ? `${c.attr_name} — Out of Stock` : c.attr_name}
                      onClick={() => { if (colorInStock) setSelectedColor(selectedColor === c.attr_slug ? '' : c.attr_slug); }}
                      className={`cpd-color-swatch${selectedColor === c.attr_slug ? ' active' : ''}${swatch.isLight ? ' light' : ''}${!colorInStock ? ' oos' : ''}`}
                      style={swatch.style}>
                      {selectedColor === c.attr_slug && (
                        <svg className="cpd-swatch-check" viewBox="0 0 24 24" fill="none"
                          stroke={swatch.isLight ? '#111' : '#fff'} strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Size selector ── */}
          {hasSizes && product.attributes.sizes.length > 0 && (
            <div className="cpd-option-block">
              <div className="cpd-option-label">
                <span>Size</span>
                {selectedSize && <span className="cpd-option-selected">— {selectedSize.toUpperCase()}</span>}
                {selectedSize && (
                  <button className="cpd-clear-btn" onClick={() => setSelectedSize('')}>Clear</button>
                )}
              </div>
              <div className="cpd-size-row">
                {product.attributes.sizes.map(s => {
                  const sizeInStock = sizeHasStock(product, s.attr_slug, selectedColor);
                  return (
                    <button key={s.attr_id}
                      title={!sizeInStock ? `${s.attr_name} — Out of Stock` : s.attr_name}
                      onClick={() => { if (sizeInStock) setSelectedSize(selectedSize === s.attr_slug ? '' : s.attr_slug); }}
                      className={`cpd-size-pill${selectedSize === s.attr_slug ? ' active' : ''}${!sizeInStock ? ' oos' : ''}`}>
                      {s.attr_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {bestMatch && (
            <div className="cpd-variation-info">
              <span className={`cpd-var-stock${isVariationInStock(bestMatch) ? ' in' : ' out'}`}>
                {isVariationInStock(bestMatch) ? '✓ Available' : '✗ Out of Stock'}
              </span>
              {bestMatch.sku && <span className="cpd-var-sku">SKU: {bestMatch.sku}</span>}
            </div>
          )}

          <div className="cpd-divider" />

          {/* ── Qty + Add to Cart + Wishlist ── */}
          <div className="cpd-cart-row">
            <div className="cpd-qty-wrap">
              <button className="cpd-qty-btn" onClick={() => setQuantity(q => Math.max(1, q - 1))}>−</button>
              <input type="number" className="cpd-qty-input" value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} />
              <button className="cpd-qty-btn" onClick={() => setQuantity(q => q + 1)}>+</button>
            </div>

            <button type="button" disabled={!canAddToCart} onClick={handleAddToCart}
              className={`cpd-atc-btn${canAddToCart ? ' ready' : ''}${addedFlash ? ' flash' : ''}`}>
              {addedFlash ? '✓ Added to Cart!' :
                !inStock ? 'Out of Stock' :
                  (!hasColors || selectedColor
                    ? (!hasSizes || selectedSize ? 'Add to Cart' : 'Select Size')
                    : 'Select Colour')}
            </button>

            <button className={`cpd-wishlist-btn${inWishlist(product.ID) ? ' active' : ''}`}
              onClick={toggleWishlist}
              title={inWishlist(product.ID) ? 'Remove from Wishlist' : 'Add to Wishlist'}>
              <svg width="18" height="18" viewBox="0 0 24 24"
                fill={inWishlist(product.ID) ? '#e74c3c' : 'none'}
                stroke={inWishlist(product.ID) ? '#e74c3c' : 'currentColor'} strokeWidth="1.8">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          </div>

          {addedFlash && (
            <div className="cpd-added-msg">
              <span>✓ Product added to cart</span>
              <Link href="/cart" className="cpd-added-view-cart">View Cart</Link>
            </div>
          )}

          {/* ── Meta ── */}
          <div className="cpd-meta">
            {(bestMatch?.sku || product.sku) && (
              <>
                <span className="cpd-meta-item"><strong>SKU:</strong> {bestMatch?.sku || product.sku}</span>
                <span className="cpd-meta-sep">|</span>
              </>
            )}
            <span className="cpd-meta-item">
              <strong>Category:</strong>
              <Link href="/shop" className="cpd-meta-link">Shop</Link>
            </span>
            {bestMatch && (
              <>
                <span className="cpd-meta-sep">|</span>
                <span className="cpd-meta-item cpd-var-id">
                  <strong>Variation:</strong> #{bestMatch.ID}
                </span>
              </>
            )}
          </div>

          {/* ── Description ── */}
          <div className="cpd-tabs-section cpd-tabs-section-inline">
            <h5 className="cpd-section-heading">Description</h5>
            <div className="cpd-tab-content">
              <div className="cpd-desc-panel">
                <div className="cpd-desc-text"
                  dangerouslySetInnerHTML={{ __html: fullDescHtml || '<p>No description available.</p>' }} />
              </div>
            </div>
          </div>

          {/* ── Accordion ── */}
          <div className="cpd-accordion">
            {accordionItems.map(item => (
              <AccordionItem key={item.id} label={item.label} content={item.content} />
            ))}
          </div>

        </div>
      </div>

      {/* ── Sticky bar ── */}
      {pinned && (
        <div className="cpd-sticky-bar">
          <img src={productImage} alt="" className="cpd-sticky-thumb" />
          <span className="cpd-sticky-name">{product.title}</span>
          <span className="cpd-sticky-price">
            {displayPrice ? formatPrice(displayPrice) : priceRangeStr}
          </span>
          <button type="button" disabled={!canAddToCart} onClick={handleAddToCart}
            className={`cpd-sticky-atc${canAddToCart ? ' ready' : ''}`}>
            {!inStock ? 'Out of Stock' : 'Add to Cart'}
          </button>
        </div>
      )}

      <Footer />
    </>
  );
}
