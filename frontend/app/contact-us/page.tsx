import type { Metadata } from "next";
import Header from "../components/Header";
import Footer from "../components/Footer";
import EnquiryForm from "../components/EnquiryForm";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Nestcase";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

export const metadata: Metadata = {
  title: `Contact Us`,
  description:
    "Contact Nestcase for product queries, order support, business enquiries, bulk orders, gifting and collaborations.",
  alternates: { canonical: `${SITE_URL}/contact-us` },
};

const supportItems = [
  {
    label: "Email",
    value: "support@nestcase.in",
    href: "mailto:support@nestcase.in",
    iconClass: "fa-envelope",
  },
  {
    label: "WhatsApp",
    value: "+91 98765 43210",
    href: "https://wa.me/919876543210",
    iconClass: "fa-whatsapp",
  },
  {
    label: "Address",
    value: `nestcase.in Pune, 
            Maharashtra India`,
    iconClass: "fa-map-marker",
  },
  {
    label: "Business Hours",
    value: "Monday - Saturday\n10:00 AM - 7:00 PM",
    iconClass: "fa-clock-o",
  },
  {
    label: "Business & B2B Enquiries",
    value: "For bulk orders, gifting, hospitality partnerships, or collaborations: business@nestcase.in",
    href: "mailto:business@nestcase.in",
    iconClass: "fa-clock-o",
  },
  {
    label: "Socials",
    value: "Instagram @nestcase.in\nLinkedIn nestcase\nPinterest @nestcase.in",
    iconClass: "fa-clock-o",
  },
];

function ContactIcon({ iconClass }: { iconClass: string }) {
  return (
    <span className="contact-icon">
      <i className={`fa ${iconClass}`} aria-hidden="true" />
    </span>
  );
}

export default function ContactUsPage() {
  return (
    <div className="contact-page">
      <Header />
      <main className="contact-main">
        <section className="contact-hero" aria-labelledby="contact-title">
          <h2 id="contact-title">Contact Us</h2>
          <span aria-hidden="true" />
          <p>
            We&apos;d love to hear from you.
            <br />
            For product queries, order support, or business enquiries - our team is here to help.
          </p>
        </section>

        <section className="contact-layout" aria-label="Contact details and enquiry form">
          <div className="contact-info">
            <h3>Customer Support</h3>
            <div className="contact-rule" />
            <div className="contact-stack">
              {supportItems.map((item) => (
                <div className="contact-row" key={item.label}>
                  <ContactIcon iconClass={item.iconClass} />
                  <div>
                    <strong className="contact-item-label">{item.label}</strong>
                    {"href" in item && item.href ? (
                      <p><a href={item.href}>{item.value}</a></p>
                    ) : (
                      <p>{item.value.split("\n").map((line, i) => (
                        <span key={i}>{line}{i < item.value.split("\n").length - 1 && <br />}</span>
                      ))}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <section className="contact-form-section" aria-labelledby="connect-title">
            <h3 id="connect-title">Let&apos;s Connect</h3>
            <div className="contact-rule" />
            <p>
              Have a question or requirement?<br />
              Fill out the form below and our team will get in touch with you.<br />
              Response Time: We usually respond within 24-48 business hours.
            </p>
            <EnquiryForm type="contact-us" buttonLabel="Send Message" />
          </section>
        </section>
      </main>

      <Footer />
    </div>
  );
}
