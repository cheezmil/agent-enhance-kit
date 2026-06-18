import type { NextConfig } from 'next';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:1351';
const isStaticExport = process.env.EXPORT === 'true';

const nextConfig: NextConfig = {
  output: isStaticExport ? 'export' : undefined,
  images: {
    unoptimized: true,
  },
  trailingSlash: false,
  distDir: 'dist',
  async rewrites() {
    if (isStaticExport) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: '/auth/:path*',
        destination: `${BACKEND_URL}/auth/:path*`,
      },
      {
        source: '/config/:path*',
        destination: `${BACKEND_URL}/config/:path*`,
      },
      {
        source: '/public-config/:path*',
        destination: `${BACKEND_URL}/public-config/:path*`,
      },
    ];
  },
};

export default nextConfig;
