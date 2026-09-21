import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  distDir: process.env.CLOVAPI_NEXT_DIST_DIR || ".next",
  output: "export",
  skipTrailingSlashRedirect: true,
};

const withMDX = createMDX();

export default withMDX(nextConfig);
