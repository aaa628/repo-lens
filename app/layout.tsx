import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

const description =
  "Paste a public GitHub repo and get an interactive architecture graph, a grounded bug radar, and a guided walkthrough for new contributors.";

export const metadata: Metadata = {
  // Absolute URL for the social image. Netlify sets URL; on Vercel Next.js detects it; elsewhere set URL yourself.
  ...(process.env.URL && { metadataBase: new URL(process.env.URL) }),
  title: { default: "RepoLens — Understand any codebase in under a minute", template: "%s · RepoLens" },
  description,
  openGraph: { title: "RepoLens", description, type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
