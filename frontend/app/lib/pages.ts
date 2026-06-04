export type StaticPage = {
  slug: string;
  title: string;
  content: string;
  summary: string;
  date: string;
};

// Live data comes from /api/pages. This is a safe empty fallback.
export const pages: StaticPage[] = [];

export function getPageBySlug(slug: string): StaticPage | undefined {
  const normalized = (slug || '').toString().trim().toLowerCase();
  const cleaned = normalized.split('/').filter(Boolean).pop() ?? '';
  return pages.find((p) => p.slug.toLowerCase() === cleaned);
}
