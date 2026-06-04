import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '',
  assetPrefix: '',
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000/api')
                .replace(/\/+$/, '')
                .replace(/\/api$/, '');

    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
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
        destination: '',
        permanent: true,
        basePath: false,
      },
    ];
  },
};

export default nextConfig;
