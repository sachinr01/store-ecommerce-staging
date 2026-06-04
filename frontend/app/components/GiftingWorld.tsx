import Link from 'next/link';

const panels = [
  {
    image: '/images/nestcase_gifting/gifting_1.png',
    label: 'CORPORATE GIFTING',
    href: '/#',
  },
  {
    image: '/images/nestcase_gifting/gifting_2.png',
    label: 'SHOP E-CARDS',
    href: '/#',
  },
];

export default function GiftingWorld() {
  return (
    <section className="gw-section">
        <h3 className="gw-title">NESTCASE GIFTING</h3>
        <div className="gw-grid">
          {panels.map((p, i) => (
            <Link key={i} href={p.href} className="gw-panel">
              <img src={p.image} alt={p.label} loading="lazy" />
              <div className="gw-panel-label">
                <span className="gw-panel-link">{p.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
  );
}
