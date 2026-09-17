import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  distDir: process.env.CLOVAPI_NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: path.join(__dirname, ".."),
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      { source: "/about", destination: "/zh-CN/about", permanent: true },
      { source: "/privacy", destination: "/zh-CN/privacy", permanent: true },
      { source: "/docs", destination: "/zh-CN/docs", permanent: true },
      { source: "/docs/:path*", destination: "/zh-CN/docs/:path*", permanent: true },
      { source: "/pricing", destination: "/zh-CN", permanent: true },
      { source: "/models", destination: "/zh-CN/models", permanent: true },
      { source: "/personal", destination: "/zh-CN", permanent: true },
      { source: "/apikeys", destination: "/zh-CN", permanent: true },
      { source: "/token", destination: "/zh-CN", permanent: false },
      { source: "/dashboard/token", destination: "/zh-CN", permanent: false },
      { source: "/dashboard", destination: "/zh-CN", permanent: true },
      { source: "/dashboard/:path*", destination: "/zh-CN", permanent: true },
    ];
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
