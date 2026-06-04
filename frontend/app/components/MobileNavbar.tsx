"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "../lib/cartContext";

const ChevronDown = ({ open }: { open: boolean }) => (
  <svg
    width="13" height="13" viewBox="0 0 12 12" fill="none"
    className={`mn-chevron ${open ? "open" : "closed"}`}
  >
    <path d="M2 4L6 8L10 4" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function MobileNavbar() {
  const { count } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  const closeMenu = () => { setMobileMenuOpen(false); setActiveSubmenu(null); };
  const toggleSubmenu = (name: string) => setActiveSubmenu(prev => prev === name ? null : name);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  return (
    <>
      {/* ══ MOBILE HEADER ══ */}
      <div className="mobile-nav-wrapper mn-header">
        <div className="mn-header-inner">
          {/* Hamburger */}
          <button type="button" onClick={() => setMobileMenuOpen(true)} className="mn-hamburger" aria-label="Open menu">
            <span className="mn-hamburger-line" />
            <span className="mn-hamburger-line" />
            <span className="mn-hamburger-line" />
          </button>

          {/* Centered logo */}
          <Link href="/" onClick={closeMenu} className="mn-logo-center">
            <span className="mn-logo-center-inner">
              <Image src="/images/nestcase-logo-optimized.png" alt="Logo" width={160} height={44} className="mn-logo-img" />
            </span>
          </Link>

          {/* Cart */}
          <Link href="/cart" className="mn-cart-link">
            <i className="fa fa-shopping-cart mn-cart-icon" />
            {count > 0 && <span className="mn-cart-badge">{count}</span>}
          </Link>
        </div>
      </div>

      {/* ══ OVERLAY ══ */}
      {mobileMenuOpen && (
        <div className="mobile-nav-wrapper mn-overlay" onClick={closeMenu} />
      )}

      {/* ══ DRAWER ══ */}
      {mobileMenuOpen && (
        <div className="mobile-nav-wrapper mn-drawer">
          {/* Drawer header */}
          <div className="mn-drawer-head">
            <Link href="/" onClick={closeMenu} className="mn-drawer-logo">
              <Image src="/images/nestcase-logo-optimized.png" alt="Logo" width={160} height={44} className="mn-logo-img" />
            </Link>
            <button type="button" onClick={closeMenu} className="mn-close-btn" aria-label="Close menu">×</button>
          </div>

          {/* Nav links */}
          <nav className="mn-nav">
            <Link href="/" onClick={closeMenu} className="mn-top-link">Home</Link>
            <Link href="/shop" onClick={closeMenu} className="mn-top-link">Shop</Link>
            <Link href="/my-account" onClick={closeMenu} className="mn-top-link">My Account</Link>
            <Link href="/cart" onClick={closeMenu} className="mn-top-link">Cart</Link>
            <Link href="/checkout" onClick={closeMenu} className="mn-top-link">Checkout</Link>
            <Link href="/contact-us" onClick={closeMenu} className="mn-top-link">Contact Us</Link>
          </nav>
        </div>
      )}

      {/* Spacer */}
      <div className="mobile-nav-wrapper mn-spacer" />
    </>
  );
}
