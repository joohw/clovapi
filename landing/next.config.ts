import type { NextConfig } from "next";
import path from "node:path";

const backendTarget =
  process.env.BACKEND_PROXY_TARGET?.trim().replace(/\/+$/, "") ||
  "http://127.0.0.1:27482";

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
      { source: "/personal", destination: "/dashboard", permanent: true },
      { source: "/apikeys", destination: "/dashboard", permanent: true },
      { source: "/token", destination: "/dashboard", permanent: false },
      { source: "/dashboard/token", destination: "/dashboard", permanent: false },
    ];
  },
  async rewrites() {
    return [
      { source: "/api/option", destination: `${backendTarget}/api/option/` },
      { source: "/api/channel", destination: `${backendTarget}/api/channel/` },
      { source: "/api/redemption", destination: `${backendTarget}/api/redemption/` },
      { source: "/api/user", destination: `${backendTarget}/api/user/` },
      { source: "/api/log", destination: `${backendTarget}/api/log/` },
      { source: "/api/mj", destination: `${backendTarget}/api/mj/` },
      { source: "/api/token", destination: `${backendTarget}/api/token/` },
      { source: "/api.json", destination: `${backendTarget}/api.json` },
      { source: "/api.ex.json", destination: `${backendTarget}/api.ex.json` },
      { source: "/api/:path*", destination: `${backendTarget}/api/:path*` },
      { source: "/v1/:path*", destination: `${backendTarget}/v1/:path*` },
      { source: "/pg/:path*", destination: `${backendTarget}/pg/:path*` },
      { source: "/assets/:path*", destination: `${backendTarget}/assets/:path*` },
    ];
  },
};

export default nextConfig;
