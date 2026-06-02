import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import BlogListView from '../components/BlogListView';
import BlogDetailView from '../components/BlogDetailView';
import { getBlogBySlug } from '../utils/getBlogBySlug';
import { BLOG_FEATURED_LIMIT } from '../utils/config';
import { getBlogDetailHref } from '../utils/links';
import { getBlogCategories, getBlogs, getLatestBlogs, getBlogsByCategory } from '../utils/getBlogs';
import type { BlogSidebarFeaturedItem } from '../types';
import { buildAdminSeoMetadata } from '../../lib/helpers/seoMetadata';
import { resolveOgImageUrl } from '../../lib/helpers/siteUrl';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const resolved = await params;
  const segments = (resolved?.slug ?? []).map((s) => decodeURIComponent(s)).filter(Boolean);

  // Blog listing only — do not inherit a post-level canonical
  if (segments.length === 0) {
    return {
      title: 'Blog – Home Decor & Lifestyle',
      description:
        'Explore home decor tips, interior styling inspiration, and the latest updates from our team.',
      alternates: { canonical: '/store/blog' },
      openGraph: {
        title: 'Blog – Home Decor & Lifestyle',
        description:
          'Explore home decor tips, interior styling inspiration, and the latest updates from our team.',
        url: '/store/blog',
        type: 'website',
      },
    };
  }

  const slug = segments[0].toLowerCase();
  const blogResult = await getBlogBySlug(slug);
  const blog = blogResult.blog;
  if (!blog) return {};

  const seo = buildAdminSeoMetadata(
    {
      seo_meta_title: blog.seo_meta_title,
      seo_meta_description: blog.seo_meta_description,
      seo_canonical_tag: blog.seo_canonical_tag,
      fallbackTitle: blog.title,
    },
    { openGraphType: 'article', overrideTwitter: true },
  );
  const shouldIndex = (blog.seo_meta_index || 'yes').toLowerCase() !== 'no';
  const ogImageUrl  = resolveOgImageUrl(blog.image);

  return {
    ...seo,
    robots: {
      index:  shouldIndex,
      follow: shouldIndex,
    },
    openGraph: {
      ...seo.openGraph,
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, alt: blog.title }] } : {}),
    },
  };
}

export default async function BlogRoutePage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const resolved = await params;
  const segments = (resolved?.slug ?? []).map((s) => decodeURIComponent(s)).filter(Boolean);

  // ── Blog listing page: /blog ──────────────────────────────────────────────
  if (segments.length === 0) {
    const [apiBlogs, latestFromApi, categories] = await Promise.all([
      getBlogs(),
      getLatestBlogs(BLOG_FEATURED_LIMIT),
      getBlogCategories(),
    ]);

    const featuredItems: BlogSidebarFeaturedItem[] = latestFromApi.slice(0, BLOG_FEATURED_LIMIT).map((post) => ({
      href: getBlogDetailHref(post),
      title: post.title,
      meta: `Posted by ${post.author_name || 'Admin'} / ${post.date}`,
    }));

    return (
      <>
        <Header />
        <BlogListView
          pageClassName="blog-list-page"
          title="From The Blog"
          subtitle="Latest updates, stories, and inspirations."
          posts={apiBlogs}
          emptyMessage="No blogs available right now."
          featuredTitle="Latest Posts"
          featuredItems={featuredItems}
          categories={categories}
        />
        <Footer />
      </>
    );
  }

  // ── Blog detail page: /blog/[slug] ────────────────────────────────────────
  const slug = segments[0].toLowerCase();
  const [blogResult, latestFromApi, categories] = await Promise.all([
    getBlogBySlug(slug),
    getLatestBlogs(BLOG_FEATURED_LIMIT),
    getBlogCategories(),
  ]);

  // Check if slug matches a category first
  const matchedCategory = categories.find(
    (cat) => (cat.category_slug || '').toLowerCase() === slug || cat.category_name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug
  );

  if (matchedCategory) {
    const [categoryBlogs] = await Promise.all([getBlogsByCategory(slug)]);
    const featuredItems: BlogSidebarFeaturedItem[] = latestFromApi.slice(0, BLOG_FEATURED_LIMIT).map((post) => ({
      href: getBlogDetailHref(post),
      title: post.title,
      meta: `Posted by ${post.author_name || 'Admin'} / ${post.date}`,
    }));
    return (
      <>
        <Header />
        <BlogListView
          pageClassName="blog-list-page"
          title={matchedCategory.category_name}
          subtitle={`Posts in ${matchedCategory.category_name}.`}
          posts={categoryBlogs}
          emptyMessage={`No posts found in ${matchedCategory.category_name}.`}
          featuredTitle="Latest Posts"
          featuredItems={featuredItems}
          activeCategorySlug={slug}
          showBreadcrumb
          breadcrumbs={[{ href: '/', label: 'Home' }, { href: '/blog', label: 'Blog' }, { label: matchedCategory.category_name }]}
          categories={categories}
          storageKeyPrefix={`blog-cat-${slug}`}
        />
        <Footer />
      </>
    );
  }

  const blog = blogResult.blog;
  if (!blog) notFound();

  const latestPosts = latestFromApi.slice(0, BLOG_FEATURED_LIMIT);

  const primaryCategory = blog.categories?.find((category) => category.is_primary_category) || blog.categories?.[0];
  const categoryName = blog.primary_category_name || primaryCategory?.category_name || null;
  const categorySlug =
    primaryCategory?.category_slug ||
    (categoryName
      ? categories.find(
          (category) =>
            category.category_name.toLowerCase() === categoryName.toLowerCase() ||
            category.category_slug.toLowerCase().replace(/[^a-z0-9]+/g, '-') === categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        )?.category_slug
      : null);
  const categoryCrumb = categoryName
    ? { label: categoryName, ...(categorySlug ? { href: `/blog/${categorySlug}` } : {}) }
    : undefined;

  return (
    <>
      <Header />
      <BlogDetailView
        blog={blog}
        latestPosts={latestPosts}
        categoryCrumb={categoryCrumb}
        categories={categories}
      />
      <Footer />
    </>
  );
}
