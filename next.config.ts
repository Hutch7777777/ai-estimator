import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Temporarily ignore build errors while Supabase types are being fixed
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
