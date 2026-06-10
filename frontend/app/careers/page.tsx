import type { Metadata } from "next";
import Header from "../components/Header";
import Footer from "../components/Footer";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Nestcase";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

export const metadata: Metadata = {
  title: `Careers`,
  description:
    "Explore career opportunities at Nestcase and connect with our team.",
  alternates: { canonical: `${SITE_URL}/careers` },
  robots: { index: false, follow: false },
};

export default function CareersPage() {
  return (
    <div className="careers-page">
      <Header />
      <main className="careers-main">
        <section className="careers-hero" aria-labelledby="careers-title">
          <h1 id="careers-title">Careers</h1>
          <span className="careers-title-rule" aria-hidden="true" />

          <div className="careers-copy">
            <p>We&apos;re looking for amazing people to join our team.</p>
            <p>
              Please visit our{" "}
              <a href="https://www.linkedin.com/company/nestcase/" target="_blank" rel="noreferrer">
                LinkedIn
              </a>{" "}
              careers page to explore our open opportunities.
            </p>
          </div>

          <div className="careers-email-block">
            <p>You may also reach out to our HR team at</p>
            <a href="mailto:careers@nestcase.in">careers@nestcase.in</a>
          </div>

          <a
            className="careers-button"
            href="https://www.linkedin.com/company/nestcase/jobs/"
            target="_blank"
            rel="noreferrer"
          >
            View Open Roles
          </a>

          <div className="careers-connect">
            <div className="careers-connect-title">
              <span aria-hidden="true" />
              <p>Connect With Us</p>
              <span aria-hidden="true" />
            </div>
            <div className="careers-socials">
              <a href="#" target="_blank" rel="noreferrer" aria-label="Instagram">
                <i className="fa fa-instagram" aria-hidden="true" />
              </a>
              <a href="https://www.linkedin.com/company/nestcase/" target="_blank" rel="noreferrer" aria-label="LinkedIn">
                <i className="fa fa-linkedin" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
