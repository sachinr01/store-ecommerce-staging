"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useCart } from "../lib/cartContext";
import { useAuth } from "../lib/authContext";
import { formatPrice } from "../lib/price";
import { usePlaceholderImage } from "../lib/siteSettingsContext";
import { getImageUrl } from "../lib/api";

const CATEGORY_PAGE_SLUGS: Record<string, string> = {
  'drinkware': '/shop/drinkware',
  'glassware': '/shop/glassware',
  'jars-and-containers': '/shop/jars-and-containers',
  
};
const CATEGORY_NAME_TO_SLUG: Record<string, string> = {
  'drinkware': 'drinkware',
  'glassware': 'glassware',
  'jars and containers': 'jars-and-containers',
  'jars & containers': 'jars-and-containers',
  'kitchen organisers': 'jars-and-containers',
  'kitchen organizers': 'kitchen-organizers',
  'cup & mugs': 'cup-and-mugs'
};
const getCategoryHref = (slug: string) => {
  const normalized = slug.toLowerCase().trim();
  return CATEGORY_PAGE_SLUGS[normalized] ?? `/shop?category=${encodeURIComponent(normalized)}`;
};

type MegaLink = { label: string; href: string; };
type MegaColumn = { heading: string; links: MegaLink[]; };
type MegaFeature = { image: string; eyebrow: string; title: string; href: string; };
type MegaMenu = {
  featureGroupLabel?: string;
  columns: MegaColumn[];
  featured: MegaFeature[];
  cta?: MegaLink;
  contentColumns?: 2 | 3;
  isKitchen?: boolean;
  isDrinkware?: boolean;
  isGlassware?: boolean;
  categorySlug?: string;
};

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { items, count, total, removeItem } = useCart();
  const { user, isLoggedIn } = useAuth();
  const PLACEHOLDER = usePlaceholderImage();
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ id: number; title: string; price: string; image: string; slug: string }>>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<Array<{ id: number; name: string; slug: string; count: number }>>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestAbort = useRef<AbortController | null>(null);
  const megaLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const cartRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (cartRef.current && !cartRef.current.contains(event.target as Node)) setCartOpen(false);
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) setActiveMenu(null);
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target as Node)) {
        setSearchOpen(false); setSuggestions([]); setCategorySuggestions([]);
      }
    };
    const handleResize = () => { if (window.innerWidth >= 992) setMobileMenuOpen(false); };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setCartOpen(false); setSearchOpen(false); setMobileSearchOpen(false); setMobileMenuOpen(false); setActiveMenu(null); setSuggestions([]); setCategorySuggestions([]); }
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleEscape);
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
      if (suggestAbort.current) suggestAbort.current.abort();
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen || mobileSearchOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen, mobileSearchOpen]);

  useEffect(() => {
    document.body.style.overflow = "";
    closeOverlays();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (mobileSearchOpen) searchRef.current?.focus();
  }, [mobileSearchOpen]);

  const highlight = (text: string, query: string) => {
    if (!query.trim()) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <span>{text}</span>;
    return (
      <span>
        {text.slice(0, idx)}
        <strong>{text.slice(idx, idx + query.length)}</strong>
        {text.slice(idx + query.length)}
      </span>
    );
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    closeOverlays(); setSuggestions([]); setCategorySuggestions([]);
    const catSlug = CATEGORY_NAME_TO_SLUG[query.toLowerCase()];
    if (catSlug) { router.push(getCategoryHref(catSlug)); }
    else { router.push(query ? `/shop?search=${encodeURIComponent(query)}` : "/shop"); }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (suggestAbort.current) suggestAbort.current.abort();
    if (!value.trim()) { setSuggestions([]); setCategorySuggestions([]); return; }
    suggestTimer.current = setTimeout(async () => {
      const controller = new AbortController();
      suggestAbort.current = controller;
      setSuggestLoading(true);
      try {
        const [prodRes, catRes] = await Promise.all([
          fetch(`/store/api/products?search=${encodeURIComponent(value.trim())}&limit=5`, { headers: { Accept: 'application/json' }, signal: controller.signal }),
          fetch(`/store/api/product-categories/search?q=${encodeURIComponent(value.trim())}&limit=4`, { headers: { Accept: 'application/json' }, signal: controller.signal }),
        ]);
        if (!prodRes.ok || !catRes.ok) throw new Error('fetch failed');
        const prodJson = await prodRes.json();
        const catJson = await catRes.json();
        const items = (prodJson.data ?? prodJson ?? []).slice(0, 5).map((p: any) => ({
          id: p.ID, title: p.title,
          price: p._sale_price ?? p._regular_price ?? p.price_min ?? '',
          image: p.thumbnail_url ? (p.thumbnail_url.startsWith('http') || p.thumbnail_url.startsWith('/') ? p.thumbnail_url : `/uploads/${p.thumbnail_url}`) : PLACEHOLDER,
          slug: (p.slug || p.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
        }));
        const cats = (catJson.data ?? []).map((c: any) => ({
          id: c.category_id, name: c.category_name, slug: c.category_slug, count: Number(c.product_count),
        }));
        setSuggestions(items); setCategorySuggestions(cats);
      } catch (err: any) {
        if (err?.name !== 'AbortError') { setSuggestions([]); setCategorySuggestions([]); }
      } finally { setSuggestLoading(false); }
    }, 280);
  };

  const [aboutHref] = useState("/about-us");
  const [b2bHref, setB2bHref] = useState("/b2b-connect");

  useEffect(() => {
    fetch('/store/api/pages?limit=100', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.success || !Array.isArray(data.data)) return;
        const normalize = (v: string) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const resolve = (matchers: string[]) => {
          const page = data.data.find((p: { title: string; slug: string }) =>
            matchers.some(m => normalize(p.title).includes(normalize(m)))
          );
          return page?.slug ? `/${page.slug}` : null;
        };
        const b2b = resolve(['b2b connect', 'b2b-connect', 'b2b']);
        if (b2b) setB2bHref(b2b);
      })
      .catch(() => {});
  }, []);

  type NavCategory = { id: number; name: string; slug: string };
  const [navCategories, setNavCategories] = useState<NavCategory[]>([]);

  useEffect(() => {
    fetch('/store/api/product-categories', { headers: { Accept: 'application/json' } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.success || !Array.isArray(data.data)) return;
        const topLevel = data.data
          .filter((c: any) => !c.parent_id || Number(c.parent_id) === 0)
          .map((c: any) => ({ id: c.category_id, name: c.category_name, slug: c.category_slug }));
        setNavCategories(topLevel);
      })
      .catch(() => {});
  }, []);

  const navLinks: Array<{ label: string; href: string; mega?: MegaMenu }> = [
    ...navCategories.map(cat => ({
      label: cat.name,
      href: `/shop/${cat.slug}`,
      mega: { columns: [], featured: [], categorySlug: cat.slug } as MegaMenu,
    })),
    { label: "About Us", href: aboutHref },
    { label: "B2B Connect", href: b2bHref },
  ];

  const [catProducts, setCatProducts] = useState<Record<string, Array<{ id: number; title: string; price: string; image: string; slug: string }>>>({});
  const [catBestSellers, setCatBestSellers] = useState<Record<string, Array<{ id: number; title: string; price: string; image: string; slug: string }>>>({});

  const mapProducts = (raw: any[]) => raw.slice(0, 4).map((p: any) => {
    const raw_img = p.thumbnail_url ?? '';
    const image = raw_img
      ? raw_img.startsWith('http') || raw_img.startsWith('//') ? raw_img
        : raw_img.startsWith('/') ? raw_img
        : `/uploads/${raw_img}`
      : PLACEHOLDER;
    return {
      id: p.ID ?? p.id, title: p.title,
      price: p._sale_price ? `₹${p._sale_price}` : p._regular_price ? `₹${p._regular_price}` : p.price_min ? `₹${p.price_min}` : '',
      image,
      slug: (p.slug || p.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    };
  });

  useEffect(() => {
    if (!navCategories.length) return;
    navCategories.forEach(cat => {
      fetch(`/store/api/product-categories/${cat.slug}/products`, { headers: { Accept: 'application/json' } })
        .then(r => r.json()).then(json => setCatProducts(prev => ({ ...prev, [cat.slug]: mapProducts(json.data ?? json ?? []) }))).catch(() => {});
      fetch(`/store/api/products/best-sellers?category=${cat.slug}&limit=2`, { headers: { Accept: 'application/json' } })
        .then(r => r.json()).then(json => setCatBestSellers(prev => ({ ...prev, [cat.slug]: mapProducts(json.data ?? []) }))).catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navCategories]);

  const closeOverlays = () => { setCartOpen(false); setSearchOpen(false); setMobileSearchOpen(false); setMobileMenuOpen(false); setActiveMenu(null); };
  const openMega = (label: string) => { if (megaLeaveTimer.current) clearTimeout(megaLeaveTimer.current); setActiveMenu(label); };
  const closeMega = () => { megaLeaveTimer.current = setTimeout(() => setActiveMenu(null), 120); };
  const keepMega = () => { if (megaLeaveTimer.current) clearTimeout(megaLeaveTimer.current); };

  return (
    <>
      <div className="nh-sticky-wrap">
        <div className="nh-announcement">
          Trend-Driven Design. Quality-First Craftsmanship.
        </div>
        <header className="nh-header" ref={headerRef}>
        <div className="nh-inner">

          {/* ── Row 1: hamburger (mobile) | logo centered | icons ── */}
          <div className="nh-top-row">
            <div className="nh-top-left">
              <button type="button" className="nh-icon-btn nh-hamburger" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">
                <span className="nh-hamburger-lines"><span /><span /><span /></span>
              </button>

              {/* Desktop search */}
              <div className="nh-header-search" ref={searchWrapRef}>
                <form className="nh-header-search-form" onSubmit={handleSearchSubmit}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input ref={searchRef} type="text" placeholder="Search products..." value={searchQuery}
                    onChange={e => handleSearchChange(e.target.value)} onFocus={() => setSearchOpen(true)}
                    aria-label="Search products" aria-autocomplete="list"
                    aria-expanded={suggestions.length > 0 || categorySuggestions.length > 0} />
                  {searchQuery && (
                    <button type="button" className="nh-header-search-clear"
                      onClick={() => { setSearchQuery(''); setSuggestions([]); setCategorySuggestions([]); searchRef.current?.focus(); }}
                      aria-label="Clear search">×</button>
                  )}
                </form>
                {searchOpen && (suggestions.length > 0 || categorySuggestions.length > 0 || suggestLoading) && (
                  <div className="nh-header-search-dropdown">
                    {suggestLoading && <div className="nh-ss-loading">Searching...</div>}
                    {!suggestLoading && (suggestions.length > 0 || categorySuggestions.length > 0) && (
                      <>
                        {categorySuggestions.length > 0 && (
                          <div className="nh-ss-section">
                            <p className="nh-ss-section-title">Category Suggestions</p>
                            <div className="nh-ss-keywords">
                              {categorySuggestions.map(c => (
                                <Link key={`cat-${c.id}`} href={getCategoryHref(c.slug)} className="nh-ss-keyword nh-ss-category"
                                  onClick={() => { closeOverlays(); setSuggestions([]); setCategorySuggestions([]); setSearchQuery(''); }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                                  {highlight(c.name, searchQuery)}
                                  {c.count > 0 && <span className="nh-ss-cat-count">{c.count}</span>}
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                        {suggestions.length > 0 && (
                          <div className="nh-ss-section">
                            <p className="nh-ss-section-title">Product Suggestions</p>
                            <div className="nh-ss-products">
                              {suggestions.map(s => (
                                <Link key={`prod-${s.id}`} href={`/shop/product/${s.slug}`} className="nh-ss-product"
                                  onClick={() => { closeOverlays(); setSuggestions([]); setCategorySuggestions([]); setSearchQuery(''); }}>
                                  <img src={s.image} alt={s.title} className="nh-ss-thumb" onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}/>
                                  <span className="nh-ss-product-name">{highlight(s.title, searchQuery)}</span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="nh-top-center">
              <Link href="/" className="nh-logo-link" onClick={closeOverlays}>
                <Image src="/store/images/nestcase-logo-optimized.png" alt="Nestcase" width={220} height={80} priority className="nh-logo-image" />
              </Link>
            </div>

            <div className="nh-top-right">
              {/* Mobile search icon */}
              <button type="button" className="nh-icon-btn nh-mobile-search" onClick={() => setMobileSearchOpen(true)} aria-label="Open search">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </button>

              {isLoggedIn && user ? (
                <Link href="/my-account" className="nh-account-link" onClick={() => setCartOpen(false)}>
                  <span className="nh-account-avatar"><i className="fa-regular fa-user"></i></span>
                </Link>
              ) : (
                <Link href="/my-account" className="nh-account-link nh-login" onClick={() => setCartOpen(false)}>
                  <span className="nh-account-avatar"><i className="fa-regular fa-user"></i></span>
                </Link>
              )}

              <div className="nh-cart-wrap" ref={cartRef}>
                <button type="button" className="nh-cart-link" onClick={() => setCartOpen(prev => !prev)} aria-label="Open cart preview" aria-expanded={cartOpen}>
                  <i className="fa-solid fa-bag-shopping"></i>
                  {count > 0 && <span className="nh-cart-badge">{count}</span>}
                </button>
                <div className={`nh-cart-dropdown${cartOpen ? ' open' : ''}`}>
                  {items.length === 0 ? (
                    <p className="nh-cart-empty">Your cart is empty.</p>
                  ) : (
                    <>
                      {items.map(item => (
                        <div key={item.cartItemId} className="nh-cart-item">
                          <img src={getImageUrl(item.image, PLACEHOLDER)} alt={item.title} width={56} height={60} className="nh-cart-thumb"
                            onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}/>
                          <div>
                            <p className="nh-cart-item-title">{item.title}</p>
                            <div className="nh-cart-item-meta">{item.quantity} x {formatPrice(item.price)}</div>
                          </div>
                          <button type="button" className="nh-cart-remove" onClick={() => removeItem(item.cartItemId)} aria-label={`Remove ${item.title}`}>×</button>
                        </div>
                      ))}
                      <div className="nh-cart-subtotal"><span>Subtotal</span><span>{formatPrice(total)}</span></div>
                    </>
                  )}
                  <div className="nh-cart-actions">
                    <Link href="/cart" className="btn-view-product" onClick={closeOverlays}>View Cart</Link>
                    <Link href="/checkout" className="btn-view-product" onClick={closeOverlays}>Checkout</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Row 2: nav tabs ── */}
          <div className="nh-bottom-row">
            <ul className="nh-nav">
              {navLinks.map((link) => (
                <li key={link.label} className={link.mega ? 'nh-mega-wrap' : ''}>
                  {link.mega ? (
                    <>
                      <Link href={link.href} className={`nh-mega-trigger${activeMenu === link.label ? ' open' : ''}`}
                        onMouseEnter={() => openMega(link.label)} onMouseLeave={closeMega} onClick={closeOverlays}>
                        {link.label}
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                      </Link>
                      <div className={`nh-mega-panel${activeMenu === link.label ? ' open' : ''}`} onMouseEnter={keepMega} onMouseLeave={closeMega}>
                        {(link.mega.isKitchen || link.mega.isDrinkware || link.mega.isGlassware || link.mega.categorySlug) ? (() => {
                          const slug = link.mega.categorySlug
                            ?? (link.mega.isKitchen ? 'jars-and-containers' : link.mega.isDrinkware ? 'drinkware' : 'glassware');
                          const products = catProducts[slug] ?? [];
                          const bestSellers = catBestSellers[slug] ?? [];
                          const shopHref = link.href;
                          const promos = [
                            { img: `/store/images/category_images/CC_${slug.toUpperCase().replace(/-/g, '_')}.png`, title: `OUR ${link.label} COLLECTION`, sub: '150+ Products Available' },
                          ];
                          const placeholder = <span className="nh-km-placeholder"><svg viewBox="0 0 48 48" fill="none"><rect width="48" height="48" fill="#e8e8e8"/><path d="M14 34l8-10 6 7 4-5 6 8H14z" fill="#bbb"/><circle cx="30" cy="20" r="4" fill="#bbb"/></svg></span>;
                          return (
                            <div className="nh-km-layout">
                              <div className="nh-km-products">
                                <div className="nh-km-section">
                                  <h5 className="nh-km-section-title">NEW ARRIVALS</h5>
                                  <div className="nh-km-grid">
                                    {(products.length ? products.slice(0, 2) : Array(2).fill(null)).map((p, i) => (
                                      <Link key={p?.id ?? i} href={p ? `/shop/product/${p.slug}` : shopHref} className="nh-km-card" onClick={closeOverlays}>
                                        <div className="nh-km-img-wrap">{p?.image ? <img src={p.image} alt={p.title} loading="lazy" /> : placeholder}</div>
                                        <p className="nh-km-name">{p?.title ?? ''}</p>
                                        <p className="nh-km-price">{p?.price ?? ''}</p>
                                        <span className="nh-km-shop">Shop Now</span>
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                                <div className="nh-km-section">
                                  <h5 className="nh-km-section-title">BEST SELLER</h5>
                                  <div className="nh-km-grid">
                                    {(bestSellers.length ? bestSellers.slice(0, 2) : Array(2).fill(null)).map((p, i) => (
                                      <Link key={p?.id ?? i} href={p ? `/shop/product/${p.slug}` : shopHref} className="nh-km-card" onClick={closeOverlays}>
                                        <div className="nh-km-img-wrap">{p?.image ? <img src={p.image} alt={p.title} loading="lazy" /> : placeholder}</div>
                                        <p className="nh-km-name">{p?.title ?? ''}</p>
                                        <p className="nh-km-price">{p?.price ?? ''}</p>
                                        <span className="nh-km-shop">Shop Now</span>
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="nh-km-promos">
                                {promos.map(promo => (
                                  <Link key={promo.title} href={shopHref} className="nh-km-promo" onClick={closeOverlays}>
                                    <img src={promo.img} alt={promo.title} loading="lazy" />
                                    <span className="nh-km-promo-overlay">
                                      <span className="nh-km-promo-title">{promo.title}</span>
                                      <span className="nh-km-promo-sub">{promo.sub}</span>
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          );
                        })() : (
                          <div className={`nh-mega-inner${link.mega.columns.length === 0 ? ' collections-only' : ''}`}>
                            {link.mega.columns.length > 0 && (
                              <div className="nh-mega-content">
                                {link.mega.cta && <div className="nh-mega-title-row"><div/><Link href={link.mega.cta.href} className="nh-mega-cta" onClick={closeOverlays}>{link.mega.cta.label}</Link></div>}
                                <div className={`nh-mega-grid cols-${link.mega.contentColumns ?? 3}`}>
                                  {link.mega.columns.map(col => (
                                    <div key={col.heading} className="nh-mega-col">
                                      <p className="nh-mega-col-heading">{col.heading}</p>
                                      <ul>{col.links.map(l => <li key={l.label}><Link href={l.href} onClick={closeOverlays}>{l.label}</Link></li>)}</ul>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="nh-mega-feature-block">
                              {link.mega.featureGroupLabel && <p className="nh-mega-feature-group-label">{link.mega.featureGroupLabel}</p>}
                              <div className="nh-mega-featured-grid">
                                {link.mega.featured.map(feature => (
                                  <Link key={feature.title} href={feature.href} className="nh-mega-featured" onClick={closeOverlays}>
                                    <Image src={feature.image} alt={feature.title} fill sizes="(max-width: 1199px) 50vw, 280px"/>
                                    <span className="nh-mega-featured-overlay"><span className="nh-mega-featured-title">{feature.title}</span></span>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <Link href={link.href}>{link.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

        </div>
      </header>
      </div>

      {/* Mobile search overlay */}
      {mobileSearchOpen && (
        <div className="nh-search-overlay" onClick={() => { setMobileSearchOpen(false); setSearchQuery(''); setSuggestions([]); setCategorySuggestions([]); }}>
          <div className="nh-search-box-wrap" onClick={e => e.stopPropagation()}>
            <form className="nh-search-box" onSubmit={handleSearchSubmit}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input ref={searchRef} type="text" placeholder="Search products..." value={searchQuery} onChange={e => handleSearchChange(e.target.value)}/>
              <button type="button" className="nh-search-close" onClick={() => { setMobileSearchOpen(false); setSearchQuery(''); setSuggestions([]); setCategorySuggestions([]); }} aria-label="Close search">×</button>
            </form>
            {(suggestions.length > 0 || categorySuggestions.length > 0 || suggestLoading) && (
              <div className="nh-search-suggestions">
                {suggestLoading && <div className="nh-ss-loading">Searching...</div>}
                {!suggestLoading && (suggestions.length > 0 || categorySuggestions.length > 0) && (
                  <>
                    {categorySuggestions.length > 0 && (
                      <div className="nh-ss-section">
                        <p className="nh-ss-section-title">Category Suggestions</p>
                        <div className="nh-ss-keywords">
                          {categorySuggestions.map(c => (
                            <Link key={`cat-${c.id}`} href={getCategoryHref(c.slug)} className="nh-ss-keyword nh-ss-category"
                              onClick={() => { closeOverlays(); setSuggestions([]); setCategorySuggestions([]); setSearchQuery(''); }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                              {highlight(c.name, searchQuery)}
                              {c.count > 0 && <span className="nh-ss-cat-count">{c.count}</span>}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                    {suggestions.length > 0 && (
                      <div className="nh-ss-section">
                        <p className="nh-ss-section-title">Product Suggestions</p>
                        <div className="nh-ss-products">
                          {suggestions.map(s => (
                            <Link key={`prod-${s.id}`} href={`/shop/product/${s.slug}`} className="nh-ss-product"
                              onClick={() => { closeOverlays(); setSuggestions([]); setCategorySuggestions([]); setSearchQuery(''); }}>
                              <img src={s.image} alt={s.title} className="nh-ss-thumb" onError={e => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}/>
                              <span className="nh-ss-product-name">{highlight(s.title, searchQuery)}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile drawer */}
      {mobileMenuOpen && <div className="nh-drawer-overlay" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`nh-drawer${mobileMenuOpen ? ' open' : ''}`} aria-hidden={!mobileMenuOpen}>
        <div className="nh-drawer-head">
          <Image src="/store/images/nestcase-logo-optimized.png" alt="Nestcase" width={200} height={53} style={{ width: 'auto', height: '60px' }}/>
          <button type="button" className="nh-search-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">×</button>
        </div>
        <ul className="nh-drawer-nav">
          {navLinks.concat([{ label: "My Account", href: "/my-account" }, { label: "Cart", href: "/cart" }, { label: "Checkout", href: "/checkout" }]).map(link => (
            <li key={link.label}><Link href={link.href} onClick={closeOverlays}>{link.label}</Link></li>
          ))}
        </ul>
        <div className="nh-drawer-footer">
          <Link href="/wishlist" onClick={closeOverlays}>Wishlist</Link>
          <Link href="/orders" onClick={closeOverlays}>Track Orders</Link>
        </div>
      </aside>
    </>
  );
}
