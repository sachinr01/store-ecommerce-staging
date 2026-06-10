import type { Metadata } from 'next';
import ShopClient from './ShopClient';
import { getProducts, type Product } from '../lib/api';
import { CURRENCY } from '../lib/price';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001';
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'NESTCASE';

async function fetchProducts(): Promise<Product[]> {
  try {
    return await getProducts();
  } catch {
    return [];
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const products = await fetchProducts();

  const count = products.length;
  const inStock = products.filter(p => p.stock_status === 'instock').length;

  const prices = products.map(p => Number(p.price_min ?? 0)).filter(n => n > 0);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const priceRange = minPrice && maxPrice
    ? ` Prices from ${CURRENCY}${minPrice.toFixed(0)} to ${CURRENCY}${maxPrice.toFixed(0)}.`
    : '';

  const title = count > 0
    ? `Shop All ${count} Products | ${SITE_NAME}`
    : `Shop | ${SITE_NAME}`;

  const description = count > 0
    ? `Browse ${count} products${inStock < count ? ` (${inStock} in stock)` : ''}.${priceRange}`
    : 'Browse our full collection of products.';

  const keywordTokens = Array.from(new Set(
    products.flatMap(p => [
      ...(p.slug ? p.slug.split('-') : []),
      ...p.title.split(/\s+/),
    ])
      .map(t => t.toLowerCase().replace(/[^a-z0-9]+/g, ''))
      .filter(t => t.length > 2)
  )).slice(0, 12);

  const keywords = [
    'shop',
    'products',
    ...keywordTokens,
    ...(minPrice ? [`gifts under ${CURRENCY}${Math.ceil(minPrice / 10) * 10 + 10}`] : []),
  ];

  return {
    title,
    description,
    keywords,
    alternates: { canonical: `${SITE_URL}/shop` },
    openGraph: { title, description, url: `${SITE_URL}/shop`, siteName: SITE_NAME, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
    robots: { index: false, follow: false },
  };
}

export default async function ShopPage() {
  const products = await fetchProducts();

  const count = products.length;
  const inStock = products.filter(p => p.stock_status === 'instock').length;

  const heading = count > 0 ? `Our Collection (${count})` : 'Our Collection';
  const subheading = count > 0
    ? `${inStock} item${inStock !== 1 ? 's' : ''} in stock - Coastal-inspired gear for every adventure`
    : 'Coastal-inspired gear for every adventure';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Shop', item: `${SITE_URL}/shop` },
        ],
      },
      ...(products.length > 0
        ? [{
            '@type': 'ItemList',
            name: 'Our Collection',
            numberOfItems: products.length,
            itemListElement: products.slice(0, 20).map((p, i) => {
              const slugBase = (p.slug || p.title)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
              return {
                '@type': 'ListItem',
                position: i + 1,
                url: `${SITE_URL}/shop/product/${slugBase}`,
                name: p.title,
              };
            }),
          }]
        : []),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ShopClient heading={heading} subheading={subheading} />
    </>
  );
}
