import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import Header from '../components/Header';
import Footer from '../components/Footer';

type StaticPage = {
  slug: string;
  title: string;
  content: string;
  summary: string;
  date: string;
  image?: string | null;
  seo_meta_title?: string | null;
  seo_meta_description?: string | null;
  seo_canonical_tag?: string | null;
  seo_meta_index?: string | null;
};

type PageResult = { page?: StaticPage; error?: 'api' | 'not-found' };

const normalizeText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const BASE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'http://localhost:3001';

const normalizeHeading = (value: string) =>
  normalizeText(
    String(value || '')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/<[^>]+>/g, ' ')
  );

const extractFirstHeading = (html: string) => {
  const match = String(html || '').match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  return match ? normalizeHeading(match[1]) : '';
};

const shouldHideHeroTitle = (pageTitle: string, html: string) => {
  const title = normalizeHeading(pageTitle);
  if (!title) return false;
  return extractFirstHeading(html) === title;
};

const fetchPage = async (slug: string): Promise<PageResult> => {
  try {
    const res = await fetch(`${BASE_URL}/api/pages/slug/${slug}`, {
      cache: 'no-store',
    });
    if (res.status === 404) return { error: 'not-found' };
    if (!res.ok) return { error: 'api' };
    const data = await res.json();
    if (data?.success && data.data) return { page: data.data };
    return { error: 'not-found' };
  } catch {
    return { error: 'api' };
  }
};

// Lightweight fetch used only by generateMetadata in [slug]/page.tsx
export const fetchPageForMeta = async (slug: string): Promise<StaticPage | null> => {
  const result = await fetchPage(slug);
  return result.page ?? null;
};

export async function renderStaticPage(slug: string) {
  const result = await fetchPage(slug);

  if (result.error === 'api') {
    return (
      <>
        <Header />
        <div className="dima-main static-error-wrap">
          <h2>We&apos;re having trouble loading this page.</h2>
          <p>Please try again in a few minutes.</p>
        </div>
        <Footer />
      </>
    );
  }

  if (result.error === 'not-found' || !result.page) {
    notFound();
  }

  const page = result.page;
  const html = page?.content || '';
  const hideHeroTitle = shouldHideHeroTitle(page?.title || '', html);

  return (
    <>
      <Header />
      <div className="dima-main static-page">
        <div className="static-body static-body--wide">
          <nav className="static-breadcrumb">
            <Link href="/">Home</Link>
            <span>{'>'}</span>
            <span className="static-breadcrumb-current">{page?.title || 'Page'}</span>
          </nav>

          {!hideHeroTitle && <h1 className="static-title">{page?.title || 'Page'}</h1>}

          {page?.image && (
            <div className="static-page-image">
              <Image
                src={page.image}
                alt={page.title || 'Page image'}
                width={1200}
                height={520}
                priority
              />
            </div>
          )}

          {page?.summary && (
            <div className="static-summary">{page.summary}</div>
          )}

          <div className="static-content" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
      <Footer />
    </>
  );
}
