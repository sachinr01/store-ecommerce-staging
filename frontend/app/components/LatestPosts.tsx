'use client';

import Link from 'next/link';
import type { Blog } from '../blog/types';
import { BLOG_HOME_LIMIT } from '../blog/utils/config';
import { getBlogDetailHref } from '../blog/utils/links';

export default function LatestPosts({ posts }: { posts: Blog[] }) {
  const visiblePosts = posts.slice(0, BLOG_HOME_LIMIT);

  if (visiblePosts.length === 0) return null;

  return (
    <section className="blog-section" id="blog">
        <div className="blog-section-inner">
          <div className="blog-section-header">
            <span className="blog-section-label">Latest Posts</span>
            <h3 className="blog-section-title">From The Nestcase Blog</h3>
          </div>
          <div className="blog-grid">
            {visiblePosts.map((post) => (
              <Link key={post.slug} href={getBlogDetailHref(post)} className="blog-card">
                <div className="blog-card-img-wrap">
                  {post.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.image}
                      alt={post.title}
                      className="blog-card-img"
                      loading="lazy"
                    />
                  ) : null}
                </div>
                <div className="blog-card-body">
                  <span className="blog-card-date">{post.date}</span>
                  <h4 className="blog-card-title">{post.title}</h4>
                  <p className="blog-card-summary">{post.summary}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
  );
}
