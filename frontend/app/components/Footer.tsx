"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import TrustBar from "./TrustBar";

type FooterPage = {
  slug: string;
  title: string;
};

type FooterCategory = {
  slug: string;
  name: string;
};

const normalize = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const fetchFooterPages = async (): Promise<FooterPage[]> => {
  try {
    const res = await fetch('/store/api/pages?limit=25', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.success || !Array.isArray(data.data)) return [];
    return data.data;
  } catch {
    return [];
  }
};

const fetchCategories = async (): Promise<FooterCategory[]> => {
  try {
    const res = await fetch('/store/api/product-categories', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.success || !Array.isArray(data.data)) return [];
    return data.data
      .filter((c: { category_slug: string; category_name: string; parent_id: number | null }) =>
        !c.parent_id || c.parent_id === 0
      )
      .map((c: { category_slug: string; category_name: string }) => ({
      slug: c.category_slug,
      name: c.category_name,
    }));
  } catch {
    return [];
  }
};

const resolvePageHref = (pages: FooterPage[], matchers: string[]): string | null => {
  const page = pages.find((item) => {
    const title = normalize(item.title);
    return matchers.some((matcher) => title.includes(normalize(matcher)));
  });
  return page ? `/${page.slug}` : null;
};

export default function Footer() {
  const [pages, setPages] = useState<FooterPage[]>([]);
  const [categories, setCategories] = useState<FooterCategory[]>([]);

  useEffect(() => {
    let active = true;
    fetchFooterPages().then((nextPages) => { if (active) setPages(nextPages); });
    fetchCategories().then((cats) => { if (active) setCategories(cats); });
    return () => { active = false; };
  }, []);

  const aboutHref   = resolvePageHref(pages, ['about us', 'our story', 'about']) || '/about-us';
  const contactHref = resolvePageHref(pages, ['contact us', 'contact']) || '/contact-us';
  const returnsHref = resolvePageHref(pages, ['refund', 'return']);
  const privacyHref = resolvePageHref(pages, ['privacy']);
  const termsHref   = resolvePageHref(pages, ['terms', 'conditions']);
  const b2bHref     = resolvePageHref(pages, ['b2b', 'b2b connect']);

  return (
    <footer className="okab-footer">
      <TrustBar />

      {/* footer-top: About Us | Need Help | Company | Contact Us */}
      <div className="footer-top">
        <div className="footer-grid">
          <div>
            <h4>About Us</h4>
            <ul className="footer-nav-list" role="list">
              {b2bHref && <li><Link href={b2bHref} className="link-faded">B2B Connect</Link></li>}
              {aboutHref && <li><Link href={aboutHref} className="link-faded">About Us</Link></li>}
              {contactHref && <li><Link href={contactHref} className="link-faded">Contact Us</Link></li>}
              <li><Link href="/orders" className="link-faded">Track Order</Link></li>
              <li><Link href="/careers" className="link-faded">Careers</Link></li>
            </ul>
          </div>
          <div>
            <h4>Quick Links</h4>
            <ul className="footer-nav-list" role="list">
              {returnsHref && <li><Link href={returnsHref} className="link-faded">Return & Exchange</Link></li>}
              {privacyHref && <li><Link href={privacyHref} className="link-faded">Privacy Policy</Link></li>}
              {termsHref && <li><Link href={termsHref} className="link-faded">Terms Of Use</Link></li>}
              <li><Link href="/shipping-policy" className="link-faded">Shipping Policy</Link></li>
              <li><Link href="/faqs" className="link-faded">FAQs</Link></li>
            </ul>
          </div>
          <div>
            <h4>Shop by Categories</h4>
            <ul className="footer-nav-list" role="list">
              {categories.length > 0 ? categories.map((cat) => (
                <li key={cat.slug}>
                  <Link href={`/shop/${cat.slug}`} className="link-faded">{cat.name}</Link>
                </li>
              )) : (
                <>
                  <li><Link href='/shop/drinkware' className="link-faded">Drinkware</Link></li>
                  <li><Link href='/shop/glassware' className="link-faded">Glassware</Link></li>
                  <li><Link href='/shop/jars-and-containers' className="link-faded">Jars and Containers</Link></li>
                </>
              )}
            </ul>
          </div>
          <div>
            <h4>Contact Us</h4>
            <ul className="footer-nav-list" role="list">
              <li><a href="#" className="link-faded">Mon-Sat 10AM - 6PM IST</a></li>
              <li><a href="#" className="link-faded">Email: support@nestcase.in</a></li>
              <li className="footer-social-list">
                <a href="#" className="footer-social-icon footer-social-icon--instagram" aria-label="Instagram">
                  <Image src="/store/images/icons/instagram.png" alt="Instagram" width={24} height={24} />
                </a>
                {/* https://wa.me/+919876543210 */}
                <a href="#" className="footer-social-icon footer-social-icon--whatsapp" aria-label="WhatsApp">
                  <Image src="/store/images/icons/whatsapp.png" alt="WhatsApp" width={24} height={24} />
                </a>
                <a href="mailto:support@nestcase.in" className="footer-social-icon footer-social-icon--email" aria-label="Email">
                  <Image src="/store/images/icons/gmail.png" alt="Email" width={24} height={24} />
                </a>
                <a href="#" className="footer-social-icon footer-social-icon--pinterest" aria-label="pinterest">
                  <Image src="/store/images/icons/pinterest.png" alt="pinterest" width={24} height={24} />
                </a>
                <a href="https://www.linkedin.com/company/nestcase" className="footer-social-icon footer-social-icon--linkedin" aria-label="LinkedIn">
                  <Image src="/store/images/icons/linkedin.png" alt="LinkedIn" width={24} height={24} />
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-middle" />
      </div>



      {/* footer-bottom2: Popular Search */}
      <div className="footer-bottom2">
        <h4>Popular Search</h4>
        <p className="popular_search--p">
          {[
            { label: 'Gift Under 1000',     href: '/shop?max=1000' },
            { label: 'Gift Under 2000',     href: '/shop?max=2000' },
            { label: 'Gift Under 3000',     href: '/shop?max=3000' },
            { label: 'Gift Under 5000',     href: '/shop?max=5000' },
            { label: 'Glassware',          href: '/shop/glassware' },
            { label: 'Drinkware',          href: '/shop/drinkware' },
            { label: 'Jars and containers', href: '/shop/jars-and-containers' },
            { label: 'Tumbler with straw', href: `/shop?search=${encodeURIComponent('Tumbler with straw')}` },
            { label: 'Whiskey glasses',    href: `/shop?search=${encodeURIComponent('Whiskey glasses')}` },
            { label: 'Set of 6',           href: `/shop?search=${encodeURIComponent('Set of 6')}` },
            { label: 'Mug set',            href: `/shop?search=${encodeURIComponent('Mug set')}` },
            { label: 'Crystal glasses',    href: `/shop?search=${encodeURIComponent('Crystal glasses')}` },
            { label: 'Beer mug',           href: `/shop?search=${encodeURIComponent('Beer mug')}` },
            { label: 'Storage jars',       href: `/shop?search=${encodeURIComponent('Storage jars')}` },
          ].map(({ label, href }, i, arr) => (
            <span key={label}>
              <Link href={href} className="link-faded">{label}</Link>
              {i < arr.length - 1 && ' | '}
            </span>
          ))}
        </p>
      </div>

      <div className="footer-legal">
        <div className="footer-legal-bottom">
          <p>Copyright © 2026 Nestcase.in. All rights reserved.</p>
          <div className="footer-payment-row" aria-label="Accepted payment methods">
            <p>We Accept</p>
            <span className="footer-payment-badge footer-payment-image">
              <Image src="/store/images/icons/visa.jpg" alt="Visa" width={42} height={22} />
            </span>
            <span className="footer-payment-badge footer-payment-image">
              <Image src="/store/images/icons/master-c.jpg" alt="Mastercard" width={42} height={22} />
            </span>
            <span className="footer-payment-badge footer-payment-image">
              <Image src="/store/images/icons/rupay_icon.png" alt="rupay" width={42} height={22} />
            </span>
            <span className="footer-payment-badge footer-payment-image">
              <Image src="/store/images/icons/paytm_icon.png" alt="paytm" width={42} height={22} />
            </span>
            {/* <p>and more..</p> */}
          </div>
        </div>
      </div>
    </footer>
  );
}
