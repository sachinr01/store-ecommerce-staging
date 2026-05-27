import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/store',
  assetPrefix: '/store',
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000/store/api')
      .replace(/\/+$/, '')
      .replace(/\/store\/api$/, '');

    return [
      {
        source: '/store/api/:path*',
        destination: `${apiBase}/store/api/:path*`,
        basePath: false,
      },
      {
        source: '/uploads/:path*',
        destination: `${apiBase}/uploads/:path*`,
        basePath: false,
      },
      {
        source: '/images/:path*',
        destination: `${apiBase}/images/:path*`,
        basePath: false,
      },
    ];
  },
  images: {
    unoptimized: false,
    remotePatterns: [
      // { protocol: 'https', hostname: 'www.oceancowboy.com' },
      // { protocol: 'https', hostname: 'www.blackcarrot.in' },
    ],
    dangerouslyAllowSVG: false,
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/store',
        permanent: true,
        basePath: false,
      },
    ];
  },
};

export default nextConfig;
