import type { ProductDetail } from '../api';

// ── Types ──────────────────────────────────────────────────────────────────

export type SwatchStyle = { style: { background?: string }; isLight: boolean };

export interface VariationSelection {
  selectedColor: string;
  selectedSize: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Normalise a variant slug/name for comparison. */
export const normalizeVariant = (v: string) =>
  v.toLowerCase().trim().replace(/\s+/g, '-');

/** Returns true when a variation has available stock. */
export function isVariationInStock(v: {
  stock_status?: string | null;
  stock_qty?: string | null;
}): boolean {
  if (v.stock_status !== 'instock' && v.stock_status !== 'onbackorder') return false;
  if (v.stock_qty !== null && v.stock_qty !== undefined) {
    const qty = Number(v.stock_qty);
    if (!isNaN(qty) && qty <= 0) return false;
  }
  return true;
}

// ── Selection resolution ───────────────────────────────────────────────────

/** Whether the product has colour variants. */
export const hasColors = (product: ProductDetail) =>
  product.variations.some(v => v.color) || (product.attributes?.colors?.length ?? 0) > 0;

/** Whether the product has size variants. */
export const hasSizes = (product: ProductDetail) =>
  product.variations.some(v => v.size) || (product.attributes?.sizes?.length ?? 0) > 0;

/** True when the user has picked every required option. */
export const hasFullSelection = (
  product: ProductDetail,
  sel: VariationSelection,
) => (!hasColors(product) || !!sel.selectedColor) && (!hasSizes(product) || !!sel.selectedSize);

/** Find the variation that matches the current selection, if any. */
export function resolveVariation(product: ProductDetail, sel: VariationSelection) {
  if (!hasFullSelection(product, sel)) return undefined;
  const norm = normalizeVariant;
  return product.variations.find(v => {
    const colorMatch = !hasColors(product) || norm(v.color ?? '') === norm(sel.selectedColor);
    const sizeMatch  = !hasSizes(product)  || norm(v.size  ?? '') === norm(sel.selectedSize);
    return colorMatch && sizeMatch;
  });
}

// ── Stock availability per option ──────────────────────────────────────────

/** True when at least one in-stock variation has this colour (respecting selected size). */
export function colorHasStock(
  product: ProductDetail,
  colorSlug: string,
  selectedSize: string,
): boolean {
  if (!product.variations.length) return true;
  const norm = normalizeVariant;
  return product.variations.some(v => {
    if (!isVariationInStock(v)) return false;
    if (norm(v.color ?? '') !== norm(colorSlug)) return false;
    if (selectedSize && norm(v.size ?? '') !== norm(selectedSize)) return false;
    return true;
  });
}

/** True when at least one in-stock variation has this size (respecting selected colour). */
export function sizeHasStock(
  product: ProductDetail,
  sizeSlug: string,
  selectedColor: string,
): boolean {
  if (!product.variations.length) return true;
  const norm = normalizeVariant;
  return product.variations.some(v => {
    if (!isVariationInStock(v)) return false;
    if (norm(v.size ?? '') !== norm(sizeSlug)) return false;
    if (selectedColor && norm(v.color ?? '') !== norm(selectedColor)) return false;
    return true;
  });
}

// ── Overall stock status ───────────────────────────────────────────────────

/** Whether any variation (or the simple product) has stock. */
export function anyVariationInStock(product: ProductDetail): boolean {
  if (product.variations.length) return product.variations.some(isVariationInStock);
  return (
    (product.stock_status === 'instock' || product.stock_status === 'onbackorder') &&
    (product.stock_qty === null || product.stock_qty === undefined || Number(product.stock_qty) > 0)
  );
}

/** Resolved in-stock status given the current selection. */
export function resolveInStock(
  product: ProductDetail,
  sel: VariationSelection,
  selectedVariation: ReturnType<typeof resolveVariation>,
): boolean {
  if (product.variations.length === 0) return anyVariationInStock(product);
  if (hasFullSelection(product, sel)) return selectedVariation ? isVariationInStock(selectedVariation) : false;
  return anyVariationInStock(product);
}

// ── Swatch colours ─────────────────────────────────────────────────────────

/** Maps a colour slug to a CSS background + contrast hint. */
export function getSwatchStyle(c: { attr_name?: string; attr_slug?: string }): SwatchStyle {
  const slug = (c.attr_slug ?? '').toLowerCase().replace(/[_]+/g, '-').trim();

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

  const map: Record<string, SwatchStyle> = {
    'ice-blue':   { style: { background: '#cfe8ff' }, isLight: true },
    'light-blue': { style: { background: '#8ec5ff' }, isLight: true },
    'aqua':       { style: { background: '#8ec5ff' }, isLight: true },
    'water-blue': { style: { background: '#8ec5ff' }, isLight: true },
    'navy':       { style: { background: '#1b2a4a' }, isLight: false },
    'blue':       { style: { background: '#1f6feb' }, isLight: false },
    'turquoise':  { style: { background: '#0d9488' }, isLight: false },
    'mint':       { style: { background: '#6ee7b7' }, isLight: true },
    'pink':       { style: { background: '#f472b6' }, isLight: true },
    'rose':       { style: { background: '#fb7185' }, isLight: false },
    'red':        { style: { background: '#dc2626' }, isLight: false },
    'citrus':     { style: { background: '#fde047' }, isLight: true },
    'yellow':     { style: { background: '#fde047' }, isLight: true },
    'orange':     { style: { background: '#f97316' }, isLight: false },
    'gold':       { style: { background: '#d4af37' }, isLight: true },
    'silver':     { style: { background: '#b5bcc8' }, isLight: true },
    'steel':      { style: { background: '#b5bcc8' }, isLight: true },
    'chrome':     { style: { background: '#b5bcc8' }, isLight: true },
    'metal':      { style: { background: '#b5bcc8' }, isLight: true },
    'gray':       { style: { background: '#9ca3af' }, isLight: true },
    'grey':       { style: { background: '#9ca3af' }, isLight: true },
    'smoke':      { style: { background: '#9ca3af' }, isLight: true },
    'concrete':   { style: { background: '#9ca3af' }, isLight: true },
    'beige':      { style: { background: '#f5f0e6' }, isLight: true },
    'natural':    { style: { background: '#f5f0e6' }, isLight: true },
    'tan':        { style: { background: '#f5f0e6' }, isLight: true },
    'brown':      { style: { background: '#8b5a2b' }, isLight: false },
    'wood':       { style: { background: '#8b5a2b' }, isLight: false },
    'glass':      { style: { background: '#e5f6ff' }, isLight: true },
    'white':      { style: { background: '#ffffff' }, isLight: true },
    'black':      { style: { background: '#111111' }, isLight: false },
    'green':      { style: { background: '#16a34a' }, isLight: false },
    'purple':     { style: { background: '#7c3aed' }, isLight: false },
  };

  return map[slug] ?? { style: { background: '#cbd5e1' }, isLight: true };
}
