import type { Metadata } from "next";
import Header from "../components/Header";
import Footer from "../components/Footer";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Nestcase";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

export const metadata: Metadata = {
  title: `About Us`,
  description:
    "Discover the design philosophy behind Nestcase and the details that shape everyday living.",
  alternates: { canonical: `${SITE_URL}/about-us` },
};

const uspItems = [
  {
    title: "Thoughtfully Designed",
    body:
      "Timeless aesthetics with a focus on functionality, comfort, and products that fit seamlessly into modern homes.",
    icon: "fa-pencil",
  },
  {
    title: "Quality You Can Trust",
    body:
      "Made with carefully chosen materials and crafted to last. Our products are durable, safe, and made for daily use.",
    icon: "fa-shield",
  },
  {
    title: "Everyday Made Better",
    body:
      "Microwave-safe, dishwasher-safe, and easy to maintain - designed to bring simplicity and ease to your everyday.",
    icon: "fa-home",
  },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="aboutus-label-wrap">
      <span className="aboutus-label">{children}</span>
      <span className="aboutus-label-line" aria-hidden="true" />
    </div>
  );
}

export default function AboutUsPage() {
  return (
    <div className="aboutus-page">
      <Header />

      <main className="aboutus-main">
        <section className="aboutus-banner">
          <img
            src="/store/images/about/about-banner.jpeg"
            alt="About Nestcase"
            className="aboutus-banner-img"
          />
        </section>

        <section className="aboutus-usps">
          <div className="aboutus-shell">
            <div className="aboutus-usps-heading">
              <SectionLabel>OUR USPs</SectionLabel>
            </div>

            <div className="aboutus-usps-grid">
              {uspItems.map((item) => (
                <article className="aboutus-usp-card" key={item.title}>
                  <div className="aboutus-usp-icon">
                    <i className={`fa ${item.icon}`} aria-hidden="true" />
                  </div>
                  <h4>{item.title}</h4>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="aboutus-process">
          <div className="aboutus-shell aboutus-split aboutus-split-spacious">
            <div className="aboutus-copy">
              <SectionLabel>HOW WE DESIGN</SectionLabel>
              <h2 className="aboutus-section-title">
                Intentional from
                <br />
                the very beginning.
              </h2>
              <p>
                Every product starts with a simple question - would we
                genuinely love using this ourselves every day?
              </p>
              <p>
                From shapes and proportions to textures and finishes, we refine
                every detail to strike the right balance between beauty and
                practicality.
              </p>
            </div>

            <div className="aboutus-art aboutus-art-bowl">
              <img
                src="/store/images/about/about-cn.jpeg"
                alt="Minimal ceramic bowl and plates"
              />
            </div>
          </div>
        </section>

        <section className="aboutus-name">
          <div className="aboutus-shell aboutus-name-grid">
            <div className="aboutus-name-content">
              <div className="aboutus-name-head">
                <SectionLabel>WHY THE NAME</SectionLabel>
                <h2 className="aboutus-section-title aboutus-name-title">
                  Why &quot;nestcase&quot;?
                </h2>
              </div>

              <div className="aboutus-name-columns">
                <div className="aboutus-name-copy">
                  <p>
                    &quot;Nest&quot; represents warmth, comfort, belonging, and
                    the feeling of home.
                  </p>
                  <p>
                    &quot;Case&quot; represents the everyday essentials we keep
                    close to our lives - the objects that quietly become part
                    of our routines and moments.
                  </p>
                </div>

                <div className="aboutus-name-center">
                  <p>
                    Together, nestcase reflects thoughtfully designed products
                    created to naturally belong in modern homes.
                  </p>
                  <p className="aboutus-name-emphasis">
                    Not loud. Not excessive.
                    <br />
                    Just intentional design for everyday living.
                  </p>
                </div>
              </div>
            </div>

            <div className="aboutus-art aboutus-art-vase">
              <img
                src="/store/images/about/about-ls.jpeg"
                alt="Ceramic vase and bowl on stacked books"
              />
            </div>
          </div>
        </section>

        <section className="aboutus-promise">
          <div className="aboutus-shell aboutus-promise-inner">
            <SectionLabel>OUR PROMISE</SectionLabel>
            <h2 className="aboutus-promise-title">
              We do not just design products.
              <br />
              We design experiences for everyday living.
            </h2>
            <p className="aboutus-promise-copy">
              We are still growing, still learning, and still designing
              products we truly love.
            </p>
            <p className="aboutus-promise-tag">DESIGNED FOR MODERN LIVING.</p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
