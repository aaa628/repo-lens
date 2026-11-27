import { ExternalLink, Telescope } from "lucide-react";
import Link from "next/link";
import { DEMOS } from "@/lib/demos";

export const SOURCE_URL = "https://github.com/aaa628/repo-lens";

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-[5px] bg-signal-500 shadow-[0_0_20px_-4px_rgba(255,30,30,0.8)]"
      style={{ width: size, height: size }}
    >
      <Telescope size={size * 0.6} className="text-black" strokeWidth={2.5} />
    </div>
  );
}

const NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/#demos", label: "Demos" },
];

export function SiteHeader() {
  return (
    <header className="relative z-10 flex h-[52px] shrink-0 items-center justify-between border-b border-line px-4 sm:px-6">
      <Link href="/" className="flex items-center gap-2.5">
        <Logo />
        <span className="text-sm font-semibold tracking-tight">RepoLens</span>
      </Link>
      <nav className="flex items-center gap-4 text-[13px] text-muted sm:gap-6">
        {NAV.map((l) => (
          <Link key={l.href} href={l.href} className="transition hover:text-fg">
            {l.label}
          </Link>
        ))}
        <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 transition hover:text-fg">
          Source <ExternalLink size={11} />
        </a>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 text-[12.5px] text-dim sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Logo size={18} />
          <span className="text-muted">RepoLens</span>
          <span>Works on public GitHub repos. Findings are model output: check them before acting.</span>
        </div>
        <nav className="flex gap-5">
          {NAV.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-fg">
              {l.label}
            </Link>
          ))}
          <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="hover:text-fg">
            Source
          </a>
        </nav>
      </div>
    </footer>
  );
}

export function DemoLinks() {
  return (
    <div id="demos" className="flex scroll-mt-20 flex-col items-center gap-3">
      <span className="text-[11px] uppercase tracking-[0.14em] text-dim">Instant demos · no wait</span>
      <div className="flex flex-wrap justify-center gap-2">
        {DEMOS.map((d) => (
          <Link
            key={d.slug}
            href={`/analyze?demo=${d.slug}`}
            className="group flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-[12.5px] transition hover:border-signal-500/50 hover:bg-signal-500/[0.06]"
          >
            <span className="font-mono text-fg">{d.repo}</span>
            <span className="text-dim group-hover:text-muted">{d.blurb}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
