import Image from 'next/image';
import Link from 'next/link';

export default function VideoBanner() {
  return (
    <section className="video-banner">
      <Link href="/shop" aria-label="Shop now" style={{ display: 'block', cursor: 'pointer' }}>
        <Image
          src="/store/images/ecommerce/Full_Banner.png"
          alt="Banner"
          width={1920}
          height={450}
          className="video-banner-bg"
        />
      </Link>
    </section>
  );
}
