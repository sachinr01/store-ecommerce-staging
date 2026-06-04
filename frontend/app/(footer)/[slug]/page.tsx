import { Metadata } from 'next';
import { renderStaticPage, fetchPageForMeta } from '../_pageTemplate';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await fetchPageForMeta(slug);
  if (!page) return {};

  const metaTitle       = page.seo_meta_title       || `${page.title}`;
  const metaDescription = page.seo_meta_description || page.summary || '';
  const canonicalUrl    = page.seo_canonical_tag     || `/${slug}`;
  const shouldIndex     = (page.seo_meta_index || 'yes').toLowerCase() !== 'no';

  return {
    title: { absolute: metaTitle },
    description: metaDescription,
    robots: {
      index:  shouldIndex,
      follow: shouldIndex,
    },
    openGraph: {
      title:       metaTitle,
      description: metaDescription,
      url:         canonicalUrl,
      type:        'website',
      ...(page.image ? { images: [{ url: page.image, alt: page.title }] } : {}),
    },
    alternates: { canonical: canonicalUrl },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  return renderStaticPage(slug);
}
