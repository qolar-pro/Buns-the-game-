import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Every route is static, so the game can ship either as a Next server
   * (Vercel, zero config) or as plain files behind any static host.
   * `STATIC_EXPORT=1 npm run build` produces the latter in `out/`.
   */
  ...(process.env.STATIC_EXPORT === '1' ? { output: 'export' as const } : {}),
  eslint: {
    // Lint is part of the build. Do not turn this off to get a green build.
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
