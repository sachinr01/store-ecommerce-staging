import type { Metadata } from "next";
import Header from "../components/Header";
import Footer from "../components/Footer";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Nestcase";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

export const metadata: Metadata = {
  title: `Frequently Asked Questions (FAQs)`,
  description:
    "Find answers to the most common questions about orders, shipping, returns, and more.",
  alternates: { canonical: `${SITE_URL}/faqs` },
};

const faqGroups = [
  {
    title: "Orders & Shipping",
    items: [
      {
        question: "How long does delivery take?",
        answer:
          "Orders are usually delivered within 2–7 business days depending on your location.",
      },
      {
        question: "Do you offer free shipping?",
        answer:
          "Yes, we currently offer free shipping across India on prepaid orders.",
      },
      {
        question: "How can I track my order?",
        answer:
          "Once your order is shipped, tracking details will be shared via email or SMS.",
      },
    ],
  },
  {
    title: "Returns & Refunds",
    items: [
      {
        question: "What if I receive a damaged product?",
        answer:
          "Please contact us within 24 hours of delivery with product and packaging images for assistance.",
      },
      {
        question: "Do you offer returns?",
        answer:
          "Yes, eligible returns can be initiated within 7 days of delivery.",
      },
      {
        question: "How long do refunds take?",
        answer:
          "Eligible refunds are usually processed within 5–7 business days after approval.",
      },
    ],
  },
  {
    title: "Payments",
    items: [
      {
        question: "What payment methods do you accept?",
        answer:
          "We accept UPI, credit cards, debit cards, net banking, and selected wallets.",
      },
    ],
  },
  {
    title: "Products",
    items: [
      {
        question: "Are your products dishwasher safe?",
        answer:
          "Product care instructions may vary by item. Please refer to the product description for details.",
      },
    ],
  },
  {
    title: "Support",
    items: [
      {
        question: "How can I contact nestcase?",
        answer:
          "You can reach us at: support@nestcase.in",
      },
      {
        question: "Still have a question?",
        answer:
          "We’re here to help. Reach out to us at: support@nestcase.in",
      },
    ],
  },
];

export default function FAQsPage() {
  return (
    <div className="faqs-shell">
      <Header />
      <main className="faqs-main">
        <section className="faqs-hero" aria-labelledby="faqs-title">
          <h2 id="faqs-title">Frequently Asked Questions</h2>
          <span className="faqs-title-rule" aria-hidden="true" />
          <p>
            Find answers to the most common questions about
            <br />
            orders, shipping, returns, and more.
          </p>
        </section>

        <div className="faqs-content-wrap">
          <section className="faqs-list" aria-label="Frequently asked questions">
            {faqGroups.map((group) => (
              <div className="faqs-group" key={group.title}>
                <h3>{group.title}</h3>
                <div className="faqs-group-rule" />
                <div className="faqs-items">
                  {group.items.map((item) => (
                    <details className="faqs-item" key={item.question}>
                      <summary>
                        <span className="faqs-question-icon">
                          <i className="fa fa-question" aria-hidden="true" />
                        </span>
                        <span className="faqs-question">{item.question}</span>
                        <i className="fa fa-chevron-down faqs-chevron" aria-hidden="true" />
                      </summary>
                      <p>{item.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>
      </main>

      <section className="faqs-cta" aria-label="Shop now">
        <h2>Still have a question?</h2>
        <p>We're here to help. Reach out to us at support@nestcase.in</p>
        <a href="mailto:support@nestcase.in" className="faqs-cta-btn">Email Now</a>
      </section>

      <Footer />
    </div>
  );
}
