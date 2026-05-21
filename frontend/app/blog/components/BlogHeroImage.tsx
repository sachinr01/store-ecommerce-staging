'use client';

export default function BlogHeroImage({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="blog-hero-img" />;
}
