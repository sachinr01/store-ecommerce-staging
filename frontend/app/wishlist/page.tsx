'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useWishlist } from '../lib/wishlistContext';
import { useCart } from '../lib/cartContext';
import { getProductById } from '../lib/api';
import type { ProductDetail } from '../lib/api';
import { formatPrice } from '../lib/price';
import { usePlaceholderImage } from '../lib/siteSettingsContext';

export default function WishlistPage() {
  const { items, removeItem, loading: wishlistLoading } = useWishlist();
  const PLACEHOLDER = usePlaceholderImage();
  const [products, setProducts] = useState<Record<number, ProductDetail>>({});
  const [productLoading, setProductLoading] = useState(false);
  const toSlug = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  // FIX: use real slug from API; only fall back to title-derived slug if missing
  const getProductSlug = (item: { id: number; title: string }) => {
    const p = products[item.id];
    return p?.slug ? p.slug : toSlug(item.title);
  };

  // Fetch full product data for each wishlist item
  useEffect(() => {
    if (items.length === 0) { setProductLoading(false); return; }
    const missing = items.filter(i => !products[i.id]).map(i => i.id);
    if (missing.length === 0) { setProductLoading(false); return; }
    setProductLoading(true);
    Promise.all(missing.map(id => getProductById(id).then(p => ({ id, p })).catch(() => null)))
      .then(results => {
        const map: Record<number, ProductDetail> = { ...products };
        results.forEach(r => { if (r) map[r.id] = r.p; });
        setProducts(map);
      })
      .finally(() => setProductLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const getPrice = (p: ProductDetail) => {
    const simple = p.price ? Number(p.price) : null;
    const min    = Number(p.price_min ?? 0);
    return simple ?? min;
  };

  const getStock = (p: ProductDetail) => {
    if (p.variations.length) {
      return p.variations.some(v =>
        (v.stock_status === 'instock' || v.stock_status === 'onbackorder') &&
        (v.stock_qty === null || v.stock_qty === undefined || Number(v.stock_qty) > 0)
      );
    }
    return (p.stock_status === 'instock' || p.stock_status === 'onbackorder') &&
      (p.stock_qty === null || p.stock_qty === undefined || Number(p.stock_qty) > 0);
  };

  return (
    <>
      <Header />
      <div className="dima-main">
        <nav className="csp-breadcrumb" aria-label="Breadcrumb">
          <div className="csp-breadcrumb-left">
            <span className="csp-breadcrumb-title">Wishlist</span>
            <span className="csp-breadcrumb-sub">Your saved products</span>
          </div>
          <div className="csp-breadcrumb-right">
            <Link href="/">Home</Link>
            <span className="csp-bsep" aria-hidden="true">&gt;</span>
            <span aria-current="page">Wishlist</span>
          </div>
        </nav>



        <section className="section wl-section-bg" style={{overflow:'visible'}}>
          <div className="page-section-content overflow-hidden" style={{overflow:'visible'}}>
            <div className="container">
              <div className="wl-wrap">

                {/* FIX: check wishlistLoading first — prevents empty-state flash while DB fetch is in-flight */}
                {(wishlistLoading || productLoading) ? (
                  <p style={{ padding: '40px 0', textAlign: 'center', color: '#6b7280' }}>Loading...</p>
                ) : items.length === 0 ? (
                  <div className="wl-empty">
                    <svg width="56" height="56" fill="none" stroke="#d1d5db" strokeWidth="1.2" viewBox="0 0 24 24">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                    <p>Your wishlist is empty.</p>
                    <Link href="/shop" className="wl-empty-btn">Go to Shop</Link>
                  </div>
                ) : (
                  <div className="wl-table-wrap">
                    <table className="wl-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Unit Price</th>
                          <th>Stock Status</th>
                          <th></th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(item => {
                          const p = products[item.id];
                          const price   = p ? getPrice(p) : item.price;
                          const inStock = p ? getStock(p) : item.inStock;
                          const title   = p ? p.title : item.title;
                          return (
                            <tr key={item.id}>
                              <td>
                                <div className="wl-product-cell">
                                  <Link href={`/shop/product/${getProductSlug(item)}`}>
                                    <img src={item.image || PLACEHOLDER} alt={title}/>
                                  </Link>
                                  <Link href={`/shop/product/${getProductSlug(item)}`} className="wl-product-name">{title}</Link>
                                </div>
                              </td>
                              <td data-label="Price">{formatPrice(price)}</td>
                              <td data-label="Stock">
                                <span className={`wl-stock ${inStock ? 'in' : 'out'}`}>
                                  {inStock ? 'In Stock' : 'Out of Stock'}
                                </span>
                              </td>
                              <td>
                                <button className="wl-remove-btn" aria-label={`Remove ${title}`}
                                  onClick={async () => { try { await removeItem(item.id); } catch {} }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

              </div>
            </div>
          </div>
        </section>

      </div>
      <Footer />
    </>
  );
}
