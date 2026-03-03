import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    middlewareClientMaxBodySize: "25mb",
  },
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
