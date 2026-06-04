import type { ReactNode } from 'react';

/**
 * No SEO metadata here — it would inherit onto every /blog/[slug] post.
 * List + post metadata are set in app/blog/[[...slug]]/page.tsx generateMetadata.
 */
export default function BlogLayout({ children }: { children: ReactNode }) {
  return children;
}
