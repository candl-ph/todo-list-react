import type { NextConfig } from "next";

const staticExport = process.env.STATIC_EXPORT === "true";
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  basePath,
  serverExternalPackages: ["pg"],
  ...(staticExport ? { output: "export", trailingSlash: true } : { output: "standalone" }),
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: process.env.SKIP_TYPECHECK === "true",
  },
  eslint: {
    ignoreDuringBuilds: process.env.SKIP_TYPECHECK === "true",
  },
};

export default nextConfig;
