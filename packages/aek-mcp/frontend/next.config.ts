import type { NextConfig } from 'next';
import { readFileSync } from 'fs';
import { join } from 'path';

// Backend (gin) runs on port 1352; nextjs runs on port 1351 (main entry).
// Under basePath: '/aek-mcp', Next.js automatically strips the base path before
// matching rewrites, so source paths are relative to the base path (e.g. '/api/*',
// not '/aek-mcp/api/*').
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:1352';
// Read the aek-mcp package version (../package.json, not frontend/package.json
// which is "dev") so the login page renders e.g. "v0.11.0" instead of "vdev".
let PACKAGE_VERSION = 'dev';
try {
  PACKAGE_VERSION = JSON.parse(readFileSync(join(process.cwd(), '../package.json'), 'utf-8')).version;
} catch {}
const nextConfig: NextConfig = {
	basePath: '/aek-mcp',
	images: {
		unoptimized: true,
	},
	devIndicators: false,
	trailingSlash: false,
	distDir: 'dist',
	env: {
		NEXT_PUBLIC_BASE_PATH: '/aek-mcp',
		NEXT_PUBLIC_PACKAGE_VERSION: PACKAGE_VERSION,
	},
	async rewrites() {
		return [
			{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
			{ source: '/auth/:path*', destination: `${BACKEND_URL}/auth/:path*` },
			{ source: '/config', destination: `${BACKEND_URL}/config` },
			{ source: '/public-config', destination: `${BACKEND_URL}/public-config` },
			{ source: '/oauth/:path*', destination: `${BACKEND_URL}/oauth/:path*` },
			{ source: '/.well-known/:path*', destination: `${BACKEND_URL}/.well-known/:path*` },
			{ source: '/internal/:path*', destination: `${BACKEND_URL}/internal/:path*` },
			{ source: '/discovery/:path*', destination: `${BACKEND_URL}/discovery/:path*` },
			{ source: '/logs/stream', destination: `${BACKEND_URL}/logs/stream` },
			{ source: '/mcp/:path*', destination: `${BACKEND_URL}/mcp/:path*` },
		];
	},
};

export default nextConfig;
