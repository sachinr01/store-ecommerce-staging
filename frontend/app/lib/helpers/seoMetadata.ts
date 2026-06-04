/**
 * Builds Next.js `Metadata` from admin-panel SEO fields.
 *
 * Rules:
 * - canonical — only when `seo_canonical_tag` is non-empty; never auto-generated
 * - title — `seo_meta_title` if set, else `fallbackTitle` (product/blog/page name)
 * - description — only when `seo_meta_description` is set (`null` clears root layout default)
 * - openGraph — same rules; replaces parent segment OG (stops blog layout bleed-through)
 */
import type { Metadata } from 'next';
import { resolveSeoField } from './siteUrl';

export interface AdminSeoFields {
  seo_meta_title?: string | null;
  seo_meta_description?: string | null;
  seo_canonical_tag?: string | null;
  /** Product name, blog title, or page title when Meta Title is empty */
  fallbackTitle?: string | null;
}

export interface SeoOptions {
  openGraphType?: 'website' | 'article';
  /** No " | Site Name" suffix (products, policy pages) */
  absoluteTitle?: boolean;
  /**
   * Blog layout defines default twitter tags — set true on blog posts to replace
   * them with only the title/description from this page (admin fields + fallback).
   */
  overrideTwitter?: boolean;
}

/** @deprecated Use SeoOptions */
export type BuildAdminSeoOptions = SeoOptions;

export function buildAdminSeoMetadata(
  fields: AdminSeoFields,
  options: SeoOptions = {},
): Pick<Metadata, 'title' | 'description' | 'keywords' | 'alternates' | 'openGraph' | 'twitter'> {
  const {
    openGraphType = 'website',
    absoluteTitle = false,
    overrideTwitter = false,
  } = options;

  const metaTitle =
    resolveSeoField(fields.seo_meta_title) ?? resolveSeoField(fields.fallbackTitle);
  const metaDescription = resolveSeoField(fields.seo_meta_description);
  const canonicalUrl = resolveSeoField(fields.seo_canonical_tag);

  const titleBlock: Metadata['title'] | undefined = metaTitle
    ? absoluteTitle
      ? { absolute: metaTitle }
      : metaTitle
    : undefined;

  return {
    ...(titleBlock ? { title: titleBlock } : {}),
    // null clears inherited description/keywords from parent layouts
    description: metaDescription ?? null,
    keywords: null,
    ...(canonicalUrl
      ? { alternates: { canonical: canonicalUrl } }
      : { alternates: { canonical: null } }),
    openGraph: {
      type: openGraphType,
      ...(metaTitle ? { title: metaTitle } : {}),
      ...(metaDescription ? { description: metaDescription } : {}),
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
    },
    ...(overrideTwitter
      ? {
          twitter: {
            card: 'summary_large_image' as const,
            ...(metaTitle ? { title: metaTitle } : {}),
            ...(metaDescription ? { description: metaDescription } : {}),
          },
        }
      : {}),
  };
}
