import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep ignoreBuildErrors for now, but add logging
  typescript: {
    ignoreBuildErrors: true,
  },

  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },

  // Add logging to help debug issues
  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
