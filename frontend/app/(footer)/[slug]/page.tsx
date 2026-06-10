import { Metadata } from 'next';
import { renderStaticPage, fetchPageForMeta } from '../_pageTemplate';
import { buildAdminSeoMetadata } from '../../lib/helpers/seoMetadata';
import { resolveOgImageUrl } from '../../lib/helpers/siteUrl';

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

  const seo = buildAdminSeoMetadata(
    {
      seo_meta_title: page.seo_meta_title,
      seo_meta_description: page.seo_meta_description,
      seo_canonical_tag: page.seo_canonical_tag,
      fallbackTitle: page.title,
    },
    { absoluteTitle: true },
  );
  const shouldIndex = false;
  const ogImageUrl  = resolveOgImageUrl(page.image);

  return {
    ...seo,
    robots: {
      index:  shouldIndex,
      follow: shouldIndex,
    },
    openGraph: {
      ...seo.openGraph,
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, alt: page.title }] } : {}),
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  return renderStaticPage(slug);
}
