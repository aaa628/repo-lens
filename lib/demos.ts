export type DemoEntry = { slug: string; repo: string; blurb: string };

/** Pre-computed analyses served from /public/demos/<slug>.json — zero wait, no API key needed. */
export const DEMOS: DemoEntry[] = [
  { slug: "zustand", repo: "pmndrs/zustand", blurb: "React state library" },
  { slug: "express", repo: "expressjs/express", blurb: "Node web framework" },
  { slug: "taxonomy", repo: "shadcn-ui/taxonomy", blurb: "Full-stack Next.js app" },
];
