import type { Metadata } from "next";
import Link from "next/link";
import Header from "../components/Header";
import Slider from "../components/Slider";
import Footer from "../components/Footer";
import { getProductCategories, type ProductCategory } from "../lib/api";
import EnquiryForm from "../components/EnquiryForm";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Nestcase";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

export const metadata: Metadata = {
  title: `B2B Connect`,
  description:
    "Premium drinkware, glassware and lifestyle essentials for hospitality, gifting, retail and modern spaces.",
  alternates: { canonical: `${SITE_URL}/b2b-connect` },
};

// Collection images mapped by category slug keywords
const COLLECTION_IMAGE_MAP: [string, string][] = [
  ["glassware",  "/store/images/category_images/CC_GLASSWARE.png"],
  ["drinkware",  "/store/images/category_images/CC_DRINKWARE.png"],
  ["tumbler",    "/store/images/category_images/CC_TUMBLERS.png"],
  ["kitchen",    "/store/images/category_images/CC_KITCHEN_ORGANISERS.png"],
  ["organiser",  "/store/images/category_images/CC_KITCHEN_ORGANISERS.png"],
  ["jar",        "/store/images/category_images/CC_KITCHEN_ORGANISERS.png"],
  ["bowl",       "/store/images/category_images/CC_BOWL_AND_PLATTERS.png"],
  ["platter",    "/store/images/category_images/CC_BOWL_AND_PLATTERS.png"],
  ["cup",        "/store/images/category_images/CC_CUP_AND_MUGS.png"],
  ["mug",        "/store/images/category_images/CC_CUP_AND_MUGS.png"],
  ["dinner",     "/store/images/category_images/CC_DINNER_SET.png"],
];

const DEFAULT_COLLECTION_IMAGE = "/store/images/dummy.jpg";

function getCollectionImage(slug: string): string {
  const match = COLLECTION_IMAGE_MAP.find(([key]) => slug.includes(key));
  return match ? match[1] : DEFAULT_COLLECTION_IMAGE;
}

const benefits = [
  {
    title: "Premium Quality",
    copy: "Finest materials and craftsmanship for lasting impressions.",
    iconClass: "fa-certificate",
  },
  {
    title: "Bulk Order Support",
    copy: "Flexible solutions for businesses of all sizes.",
    iconClass: "fa-cubes",
  },
  {
    title: "Custom Branding",
    copy: "Personalized options to reflect your brand identity.",
    iconClass: "fa-tag",
  },
  {
    title: "Reliable Delivery",
    copy: "Timely and secure delivery, every time.",
    iconClass: "fa-truck",
  },
];

export default async function B2BConnectPage() {
  let categories: ProductCategory[] = [];
  try {
    const all = await getProductCategories();
    categories = all.filter((c) => !c.parent_id || c.parent_id === 0);
  } catch {
    // fall through — section renders empty
  }

  return (
    <>
      <Header />
      <main className="b2b-page">
        <Slider />

        <section className="b2b-section b2b-categories" aria-labelledby="b2b-categories-title">
          <div className="b2b-section-heading">
            <p className="b2b-eyebrow">Explore Our Collections</p>
            <h2 id="b2b-categories-title">Our Product Categories</h2>
          </div>
          {categories.length > 0 && (
            <div className="b2b-category-grid">
              {categories.map((category) => (
                <Link
                  className="b2b-category-card"
                  href={`/shop/${category.category_slug}`}
                  key={category.category_id}
                >
                  <span className="b2b-category-image">
                    <img
                      src={getCollectionImage(category.category_slug)}
                      alt={category.category_name}
                    />
                  </span>
                  <span className="b2b-category-name">
                    {category.category_name}
                    <i className="fa fa-arrow-right" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="b2b-quote-band" aria-label="Brand statement">
          <span />
          <p>Thoughtfully crafted products for spaces people remember.</p>
          <span />
        </section>

        <section className="b2b-section b2b-benefits" aria-labelledby="b2b-benefits-title">
          <div className="b2b-section-heading">
            <p className="b2b-eyebrow">Why Partner With Nestcase</p>
            <h2 id="b2b-benefits-title">Why Partner With Us?</h2>
          </div>
          <div className="b2b-benefit-grid">
            {benefits.map((benefit) => (
              <article className="b2b-benefit" key={benefit.title}>
                <div className="b2b-benefit-icon">
                  <i className={`fa ${benefit.iconClass}`} aria-hidden="true" />
                </div>
                <h4>{benefit.title}</h4>
                <p>{benefit.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="b2b-contact" id="b2b-contact" aria-labelledby="b2b-contact-title">
          <div className="b2b-leaf" aria-hidden="true" />
          <div className="b2b-contact-copy">
            <h2 id="b2b-contact-title">Let&apos;s Work Together</h2>
            <p>
              Share your business requirements and our team will get in touch
              with you.
            </p>
          </div>
          <EnquiryForm type="b2b" buttonLabel="Request Callback" />
        </section>
      </main>
      <Footer />
    </>
  );
}
