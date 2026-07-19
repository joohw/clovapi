import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: path.join(__dirname, ".."),
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      { source: "/about", destination: "/zh-CN/about", permanent: true },
      { source: "/privacy", destination: "/zh-CN/privacy", permanent: true },
      { source: "/docs", destination: "/zh-CN", permanent: true },
      { source: "/docs/:path*", destination: "/zh-CN", permanent: true },
      { source: "/pricing", destination: "/zh-CN", permanent: true },
      { source: "/models", destination: "/zh-CN", permanent: true },
      { source: "/personal", destination: "/zh-CN", permanent: true },
      { source: "/apikeys", destination: "/zh-CN", permanent: true },
      { source: "/token", destination: "/zh-CN", permanent: false },
      { source: "/dashboard/token", destination: "/zh-CN", permanent: false },
      { source: "/dashboard", destination: "/zh-CN", permanent: true },
      { source: "/dashboard/:path*", destination: "/zh-CN", permanent: true },
    ];
  },
};

export default nextConfig;
