'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { getProductById, getProductBySlug, getImageUrl, type ProductDetail } from '../lib/api';
import { formatPrice, formatPriceRange } from '../lib/price';
import { getDiscountPercent, isSaleDateActive } from '../lib/helpers/pricing';
import { htmlToText, sanitizeHtml } from '../lib/helpers/html';
import { useCart } from '../lib/cartContext';
import { useWishlist } from '../lib/wishlistContext';
import { usePlaceholderImage } from '../lib/siteSettingsContext';

type SwatchStyle = { style: { background?: string }; isLight: boolean };

function getSwatchStyle(c: { attr_name?: string; attr_slug?: string }): SwatchStyle {
  // Use slug only for matching — more reliable than name+slug concat
  const slug = (c.attr_slug ?? '').toLowerCase().replace(/[_]+/g, '-').trim();

  // Specific compound slugs first (before generic single-word checks)
  // === PATTERNS (keep at top) ===
if (slug === 'blue-ocean-camo' || slug === 'blue-camo')
  return { style: { background: 'linear-gradient(135deg, #0f766e 0%, #3b82f6 45%, #1f2937 100%)' }, isLight: false };

if (slug === 'white-ocean-camo' || slug === 'white-camo')
  return { style: { background: 'linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 50%, #f8fafc 100%)' }, isLight: true };

if (slug === 'navy-tumbler')
  return { style: { background: 'linear-gradient(135deg, #1b2a4a 0%, #2d4a8a 100%)' }, isLight: false };

if (slug.includes('camo'))
  return { style: { background: 'linear-gradient(135deg, #4d7c0f 0%, #365314 50%, #1c2a0a 100%)' }, isLight: false };

if (slug.includes('stripe') || slug.includes('striper'))
  return { style: { background: 'repeating-linear-gradient(45deg, #111 0 6px, #f5f5f5 6px 12px)' }, isLight: false };

if (slug.includes('multi'))
  return { style: { background: 'linear-gradient(135deg, #f59e0b 0%, #ec4899 45%, #3b82f6 100%)' }, isLight: false };

// === BLUES ===
if (slug === 'ice-blue')
  return { style: { background: '#cfe8ff' }, isLight: true };

if (slug === 'light-blue' || slug === 'aqua' || slug === 'water-blue')
  return { style: { background: '#8ec5ff' }, isLight: true };

if (slug === 'navy')
  return { style: { background: '#1b2a4a' }, isLight: false };

if (slug === 'blue')
  return { style: { background: '#1f6feb' }, isLight: false };

if (slug === 'turquoise')
  return { style: { background: '#0d9488' }, isLight: false }; // ✅ fixed - darker turquoise

if (slug === 'mint')
  return { style: { background: '#6ee7b7' }, isLight: true }; // ✅ slightly richer mint

// === PINKS / REDS ===
if (slug === 'pink')
  return { style: { background: '#f472b6' }, isLight: true }; // ✅ richer pink

if (slug === 'rose')
  return { style: { background: '#fb7185' }, isLight: false }; // ✅ rose is medium-dark

if (slug === 'red')
  return { style: { background: '#dc2626' }, isLight: false };

// === YELLOWS / ORANGES ===
if (slug === 'citrus' || slug === 'yellow')
  return { style: { background: '#fde047' }, isLight: true }; // ✅ brighter yellow

if (slug === 'orange')
  return { style: { background: '#f97316' }, isLight: false }; // ✅ proper orange

if (slug === 'gold')
  return { style: { background: '#d4af37' }, isLight: true }; // ✅ fixed isLight

// === NEUTRALS ===
if (slug === 'silver' || slug === 'steel' || slug === 'chrome' || slug === 'metal')
  return { style: { background: '#b5bcc8' }, isLight: true };

if (slug === 'gray' || slug === 'grey' || slug === 'smoke' || slug === 'concrete')
  return { style: { background: '#9ca3af' }, isLight: true };

if (slug === 'beige' || slug === 'natural' || slug === 'tan')
  return { style: { background: '#f5f0e6' }, isLight: true };

if (slug === 'brown' || slug === 'wood')
  return { style: { background: '#8b5a2b' }, isLight: false };

if (slug === 'glass')
  return { style: { background: '#e5f6ff' }, isLight: true };

// === BASICS ===
if (slug === 'white')
  return { style: { background: '#ffffff' }, isLight: true };

if (slug === 'black')
  return { style: { background: '#111111' }, isLight: false };

if (slug === 'green')
  return { style: { background: '#16a34a' }, isLight: false };

if (slug === 'purple')
  return { style: { background: '#7c3aed' }, isLight: false };
  // Fallback: try to parse as a CSS color from the name
  return { style: { background: '#cbd5e1' }, isLight: true };
}

function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24"
          fill={i <= Math.round(rating) ? '#f59e0b' : 'none'}
          stroke="#f59e0b" strokeWidth="1.5">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

export function ProductDetailsClient({ productId, productSlug }: { productId?: string; productSlug?: string } = {}) {
  // If slug is passed directly (from /shop/product/[slug] route), skip useSearchParams entirely
  if (productSlug) {
    return <ProductDetailsInner id={undefined} slug={productSlug} />;
  }
  return <ProductDetailsWithSearchParams productId={productId} />;
}

// Reads ?id= from URL — only used when navigating to /product-details?id=123
function ProductDetailsWithSearchParams({ productId }: { productId?: string }) {
  const searchParams = useSearchParams();
  const id = productId ?? searchParams.get('id') ?? undefined;
  return <ProductDetailsInner id={id} slug={undefined} />;
}

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

function ProductDetailsInner({ id, slug }: { id?: string; slug?: string }) {
  const { addItem }    = useCart();
  const { hasItem: inWishlist, addItem: addToWishlist, removeItem: removeFromWishlist } = useWishlist();
  const PLACEHOLDER = usePlaceholderImage();

  const [product,       setProduct]       = useState<ProductDetail | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [mainImage,     setMainImage]     = useState(0);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize,  setSelectedSize]  = useState('');
  const [quantity,      setQuantity]      = useState(1);
  const [addedFlash,    setAddedFlash]    = useState(false);
  const [pinned,        setPinned]        = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        let p: ProductDetail;
        if (slug) {
          p = await getProductBySlug(slug);
        } else if (id) {
          p = await getProductById(id);
        } else {
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

  useEffect(() => {
    const onScroll = () => setPinned(window.scrollY > 400);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // When color changes, reset to first image of the new image set
  useEffect(() => {
    setMainImage(0);
  }, [selectedColor]);

  if (loading) return (
    <div className="cpd-centered">
      <div className="cpd-spinner" />
      <p style={{ marginTop: 16, fontFamily: 'sans-serif', color: '#888' }}>Loading product…</p>
    </div>
  );
  if (error || !product) return notFound();

  /* -- Variation logic -- */
  const hasColors = product.variations.some(v => v.color) || (product.attributes?.colors?.length ?? 0) > 0;
  const hasSizes  = product.variations.some(v => v.size)  || (product.attributes?.sizes?.length ?? 0) > 0;

  const normalize = (v: string) => v.toLowerCase().trim().replace(/\s+/g, '-');
  const isVariationInStock = (v: { stock_status?: string | null; stock_qty?: string | null }) => {
    // Check stock_status first
    if (v.stock_status !== 'instock' && v.stock_status !== 'onbackorder') return false;
    // If stock_qty is available, check if it's > 0
    if (v.stock_qty !== null && v.stock_qty !== undefined) {
      const qty = Number(v.stock_qty);
      if (!isNaN(qty) && qty <= 0) return false;
    }
    return true;
  };

  const hasFullSelection = (!hasColors || selectedColor) && (!hasSizes || selectedSize);

  const selectedVariation = hasFullSelection
    ? product.variations.find(v => {
        const colorMatch = !hasColors || normalize(v.color ?? '') === normalize(selectedColor);
        const sizeMatch  = !hasSizes  || normalize(v.size  ?? '') === normalize(selectedSize);
        return colorMatch && sizeMatch;
      })
    : undefined;

  const bestMatch = selectedVariation;

  const currentRegular   = bestMatch ? Number(bestMatch.regular_price || 0) || null : null;
  const currentSalePrice = bestMatch?.sale_price && bestMatch.sale_price !== '' ? Number(bestMatch.sale_price) : null;

  const priceMin = Number(product.price_min ?? 0);
  const priceMax = Number(product.price_max ?? 0);

  // Frontend display rule:
  // if _sale_price exists AND the sale date window is active, show it; otherwise show _regular_price
  const saleDateActive  = isSaleDateActive(product.sale_price_dates_from, product.sale_price_dates_to);
  const simpleRegular   = !product.variations.length && product.regular_price ? Number(product.regular_price) : null;
  const simpleSalePrice = !product.variations.length && product.sale_price && saleDateActive ? Number(product.sale_price) : null;

  const displayRegular = bestMatch ? currentRegular : (simpleRegular ?? null);
  const displaySalePrice = bestMatch ? currentSalePrice : simpleSalePrice;
  const displayMRP = displaySalePrice !== null && displayRegular !== null ? displayRegular : null;
  const displayPrice = displaySalePrice ?? displayRegular ?? (product.variations.length > 0 ? null : (hasFullSelection ? priceMin : null));
  const showRange        = product.variations.length > 0 && !bestMatch && priceMax > priceMin;
  const priceRangeStr    = formatPriceRange(priceMin, priceMax);

  const isAddToCartEnabled = !product.variations.length || hasFullSelection;

  const colorHasStock = (colorSlug: string) => {
    if (!product.variations.length) return true;
    const colorKey = normalize(colorSlug);
    return product.variations.some(v => {
      if (!isVariationInStock(v)) return false;
      if (colorKey && normalize(v.color ?? '') !== colorKey) return false;
      // only filter by size if user has already picked one
      if (selectedSize && normalize(v.size ?? '') !== normalize(selectedSize)) return false;
      return true;
    });
  };

  const sizeHasStock = (sizeSlug: string) => {
    if (!product.variations.length) return true;
    const sizeKey = normalize(sizeSlug);
    return product.variations.some(v => {
      if (!isVariationInStock(v)) return false;
      if (sizeKey && normalize(v.size ?? '') !== sizeKey) return false;
      // only filter by color if user has already picked one
      if (selectedColor && normalize(v.color ?? '') !== normalize(selectedColor)) return false;
      return true;
    });
  };

  const shortDescHtml = sanitizeHtml(product.short_description || '', { normalizeSpecLists: false });
  const shortDescText = htmlToText(product.short_description || '');
  const variationDescHtml = sanitizeHtml(bestMatch?.variation_description || '', { normalizeSpecLists: false });
  const hasVariationDesc = variationDescHtml.trim().length > 0;
  const fullDescHtml = hasVariationDesc
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

  const anyInStock = product.variations.length
    ? product.variations.some(isVariationInStock)
    : (product.stock_status === 'instock' || product.stock_status === 'onbackorder') &&
      (product.stock_qty === null || product.stock_qty === undefined || Number(product.stock_qty) > 0);

  const inStock = product.variations.length === 0
    ? anyInStock  // simple product — use parent stock_status directly
    : hasFullSelection
      ? (bestMatch ? isVariationInStock(bestMatch) : false)  // variation selected — check that variation
      : anyInStock;  // no full selection yet — show overall availability

  const canAddToCart = isAddToCartEnabled && inStock;

  const handleAddToCart = async () => {
    if (!canAddToCart) return;
    try {
      await addItem({
        productId: product.ID,
        variationId: bestMatch?.ID,
        // title and price removed — backend fetches from DB
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
    } catch {
      // optimistic update already rolled back by context
    }
  };

  // gallery_urls ordered: is_thumbnail=true first, then rest
  // Sort ensures thumbnail is always position 0 regardless of media_id order
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

  const allImages = selectedVariationImages ?? defaultImages;
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
          {/* Vertical thumbnail strip — max 5, last shows +N if more */}
          <div className="cpd-thumbs-strip">
            {allImages.slice(0, 5).map((img, idx) => {
              const isLast = idx === 4 && allImages.length > 5;
              const remaining = allImages.length - 5;
              return (
                <button
                  key={idx}
                  onClick={() => setMainImage(idx)}
                  className={`cpd-thumb${mainImage === idx ? ' active' : ''}`}>
                  <img src={img} alt="" loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
                  {isLast && (
                    <span className="cpd-thumb-more">+{remaining}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Main image */}
          <div className="cpd-main-img-wrap">
            <img src={allImages[mainImage]} alt={product.title} className="cpd-main-img"
              onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}/>

            {/* Image nav arrows — mobile always (>1 img), desktop only when >5 imgs */}
            {allImages.length > 1 && (
              <>
                <button className={`cpd-img-arrow prev${allImages.length > 5 ? ' desktop-visible' : ''}`}
                  onClick={() => setMainImage(i => Math.max(0, i - 1))}
                  aria-label="Previous image">‹</button>
                <button className={`cpd-img-arrow next${allImages.length > 5 ? ' desktop-visible' : ''}`}
                  onClick={() => setMainImage(i => Math.min(allImages.length - 1, i + 1))}
                  aria-label="Next image">›</button>
              </>
            )}

            {/* Sale badge */}
            {displaySalePrice && <span className="cpd-sale-badge">Sale</span>}

            {/* Wishlist on image */}
            <button className="cpd-img-wishlist" onClick={toggleWishlist} title="Add to Wishlist">
              <svg width="18" height="18" viewBox="0 0 24 24"
                fill={inWishlist(product.ID) ? '#e74c3c' : 'none'}
                stroke={inWishlist(product.ID) ? '#e74c3c' : '#666'} strokeWidth="1.8">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>

            {/* Dot indicators — only when multiple images */}
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

          {/* Short desc */}
          {(hasVariationDesc || shortDescHtml) && (
            <div
              className="cpd-short-desc"
              dangerouslySetInnerHTML={{ __html: hasVariationDesc ? variationDescHtml : shortDescHtml }}
            />
          )}

          {/* ── Color selector ── */}
          {hasColors && product.attributes.colors.length > 0 && (
            <div className="cpd-option-block">
              <div className="cpd-option-label">
                <span>Colour</span>
                {selectedColor && (
                  <span className="cpd-option-selected">— {selectedColor}</span>
                )}
              </div>
              <div className="cpd-color-row">
                {product.attributes.colors.map(c => {
                  const swatch = getSwatchStyle(c);
                  const colorInStock = product.variations.length > 0
                    ? colorHasStock(c.attr_slug)
                    : true; // simple product — stock is on the parent, not per-attribute
                  return (
                    <button
                      key={c.attr_id}
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
                {selectedSize && (
                  <span className="cpd-option-selected">— {selectedSize.toUpperCase()}</span>
                )}
                {selectedSize && (
                  <button className="cpd-clear-btn"
                    onClick={() => setSelectedSize('')}>Clear</button>
                )}
              </div>
              <div className="cpd-size-row">
                {product.attributes.sizes.map(s => {
                  const sizeInStock = sizeHasStock(s.attr_slug);
                  return (
                    <button
                      key={s.attr_id}
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

          {/* Variation stock info */}
          {bestMatch && (
            <div className="cpd-variation-info">
              <span className={`cpd-var-stock${isVariationInStock(bestMatch) ? ' in' : ' out'}`}>
                {isVariationInStock(bestMatch) ? '✓ Available' : '✗ Out of Stock'}
              </span>
              {bestMatch.sku && (
                <span className="cpd-var-sku">SKU: {bestMatch.sku}</span>
              )}
            </div>
          )}

          <div className="cpd-divider" />

          {/* ── Qty + Add to Cart + Wishlist ── */}
          <div className="cpd-cart-row">
            {/* Qty */}
            <div className="cpd-qty-wrap">
              <button className="cpd-qty-btn" onClick={() => setQuantity(q => Math.max(1, q - 1))}>−</button>
              <input
                type="number" className="cpd-qty-input" value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <button className="cpd-qty-btn" onClick={() => setQuantity(q => q + 1)}>+</button>
            </div>

            {/* Add to Cart */}
            <button
              type="button"
              disabled={!canAddToCart}
              onClick={handleAddToCart}
              className={`cpd-atc-btn${canAddToCart ? ' ready' : ''}${addedFlash ? ' flash' : ''}`}>
              {addedFlash ? '✓ Added to Cart!' :
                !inStock ? 'Out of Stock' :
                  (!hasColors || selectedColor
                    ? (!hasSizes || selectedSize ? 'Add to Cart' : 'Select Size')
                    : 'Select Colour')}
            </button>

            {/* Wishlist */}
            <button
              className={`cpd-wishlist-btn${inWishlist(product.ID) ? ' active' : ''}`}
              onClick={toggleWishlist}
              title={inWishlist(product.ID) ? 'Remove from Wishlist' : 'Add to Wishlist'}>
              <svg width="18" height="18" viewBox="0 0 24 24"
                fill={inWishlist(product.ID) ? '#e74c3c' : 'none'}
                stroke={inWishlist(product.ID) ? '#e74c3c' : 'currentColor'} strokeWidth="1.8">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          </div>

          {/* ── Added to cart confirmation ── */}
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

          {/* ── Trust badges ── */}
          <div className="cpd-trust-row">
            {[
              { icon: '🚚', label: 'Free Shipping', sub: 'Orders over ₹75' },
              { icon: '↩',  label: 'Easy Returns',  sub: '30-day policy' },
              { icon: '🔒', label: 'Secure Payment', sub: 'SSL encrypted' },
            ].map(b => (
              <div key={b.label} className="cpd-trust-badge">
                <span className="cpd-trust-icon">{b.icon}</span>
                <div>
                  <div className="cpd-trust-label">{b.label}</div>
                  <div className="cpd-trust-sub">{b.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Description ── */}
          <div className="cpd-tabs-section cpd-tabs-section-inline">
            <h5 className="cpd-section-heading">Description</h5>
            <div className="cpd-tab-content">
              <div className="cpd-desc-panel">
                <div
                  className="cpd-desc-text"
                  dangerouslySetInnerHTML={{ __html: fullDescHtml || '<p>No description available.</p>' }}
                />
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
          <button
            type="button"
            disabled={!canAddToCart}
            onClick={handleAddToCart}
            className={`cpd-sticky-atc${canAddToCart ? ' ready' : ''}`}>
            {!inStock ? 'Out of Stock' : 'Add to Cart'}
          </button>
        </div>
      )}

      <Footer />
    </>
  );
}

/* ─────────────── Export ─────────────── */
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
