import type { Metadata } from 'next';
import Header from './components/Header';
import Slider from './components/Slider';
import NewlyLaunched, { BestSellers } from './components/NewArrivals';
import VideoBanner from './components/SalesEvent';
import { FeaturedCollectionPanels } from './components/PopularProducts';
import GiftingWorld from './components/GiftingWorld';
import LatestPosts from './components/LatestPosts';
import Footer from './components/Footer';
import { BLOG_HOME_LIMIT } from './blog/utils/config';
import { getLatestBlogs } from './blog/utils/getBlogs';

const SITE_URL  = process.env.NEXT_PUBLIC_SITE_URL  ?? 'http://localhost:3001';
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Nestcase';

export const metadata: Metadata = {
  title: `${SITE_NAME} | Premium Dinnerware & Lifestyle Products for Modern Home`,
  description:
    'Discover Nestcase premium bone-ash-free crockery, lead-free glassware, 304 food-grade stainless steel cutlery, bottles and bar accessories. Shop health-friendly dinnerware at Nestcase for a stylish and healthy lifestyle.',
  keywords: [
    'dinnerware', 'crockery', 'tumblers', 'luxury dining', 'glassware',
    'cutlery', 'custom gifts', 'serving bowls', 'ceramic dinner sets',
  ],
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: `${SITE_NAME} | Premium Dinnerware & Lifestyle Products for Modern Home`,
    description:
      'Discover Nestcase premium bone-ash-free crockery, lead-free glassware, 304 food-grade stainless steel cutlery, bottles and bar accessories. Shop health-friendly dinnerware at Nestcase for a stylish and healthy lifestyle.',
    url: SITE_URL,
    siteName: SITE_NAME,
    type: 'website',
    images: [
      {
        url: `${SITE_URL}/store/images/og-home.jpg`,
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — Shop Now`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} | Premium Dinnerware & Lifestyle Products for Modern Home`,
    description:
      'Discover Nestcase premium bone-ash-free crockery, lead-free glassware, 304 food-grade stainless steel cutlery, bottles and bar accessories. Shop health-friendly dinnerware at Nestcase for a stylish and healthy lifestyle.',
    images: [`${SITE_URL}/images/nestcase-logo-optimized.png`],
  },
  robots: { index: true, follow: true },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      url: SITE_URL,
      name: SITE_NAME,
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/shop?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'Organization',
      url: SITE_URL,
      name: SITE_NAME,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/images/logo/Nestcase_Logo.png`,
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      ],
    },
  ],
};

export default async function Home() {
  const latestPosts = await getLatestBlogs(BLOG_HOME_LIMIT);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />
      <Slider />
      <FeaturedCollectionPanels />
      <NewlyLaunched />
      <VideoBanner />
      <GiftingWorld />
      <BestSellers />
      <LatestPosts posts={latestPosts} />
      <Footer />
    </>
  );
}
