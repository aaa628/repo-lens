import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // shiki ships WASM + many grammar chunks; keep it out of the server bundle analysis.
  serverExternalPackages: ["shiki"],
  // Old deep links (/?demo=zustand, /?repo=owner/name) now live on /analyze; the query is passed through.
  redirects: async () =>
    ["demo", "repo"].map((key) => ({ source: "/", has: [{ type: "query" as const, key }], destination: "/analyze", permanent: false })),
};

export default nextConfig;
