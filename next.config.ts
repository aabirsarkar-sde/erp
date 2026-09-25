import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // photos are compressed in the browser first; this covers PDFs/docs.
  // Note: Vercel caps request bodies at ~4.5 MB on the free plan.
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
};
export default nextConfig;
