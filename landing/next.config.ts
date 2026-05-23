import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: path.join(__dirname, ".."),
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      { source: "/about", destination: "/", permanent: true },
      { source: "/docs", destination: "/", permanent: true },
      { source: "/docs/:path*", destination: "/", permanent: true },
      { source: "/pricing", destination: "/", permanent: true },
      { source: "/models", destination: "/", permanent: true },
      { source: "/agents", destination: "/", permanent: true },
      { source: "/personal", destination: "/", permanent: true },
      { source: "/apikeys", destination: "/", permanent: true },
      { source: "/token", destination: "/", permanent: false },
      { source: "/dashboard/token", destination: "/", permanent: false },
      { source: "/dashboard", destination: "/", permanent: true },
      { source: "/dashboard/:path*", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
