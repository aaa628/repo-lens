import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // shiki ships WASM + many grammar chunks; keep it out of the server bundle analysis.
  serverExternalPackages: ["shiki"],
};

export default nextConfig;
