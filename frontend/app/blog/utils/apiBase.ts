import 'server-only';

const rawBlogApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

const baseUrl = rawBlogApiUrl || 'http://127.0.0.1:3000';

export const BLOG_API_BASE_URL = `${baseUrl.replace(/\/+$/, '').replace(/\\/api$/, '')}/api`;