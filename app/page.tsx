import { ArrowRight, Bug, Compass, Network, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import AnalyzeForm from "@/components/AnalyzeForm";
import { DemoLinks, SiteFooter, SiteHeader } from "@/components/Site";
import shot from "@/public/workspace.jpg";

const FEATURES = [
  {
    icon: Network,
    title: "Architecture map",
    text: "5–12 modules laid out left to right. Red links are backed by imports a static parser found; white links are runtime relationships the model inferred.",
  },
  {
    icon: Bug,
    title: "Bug radar",
    text: "Findings ranked by severity, each with an exact file:line, the real source lines around it and a suggested fix. Findings that cite files outside the repo are dropped.",
  },
  {
    icon: Compass,
    title: "Guided tour",
    text: "5–7 steps from the README to the entry point, the core logic, the data layer and a concrete first contribution. The map pans to each module as you go.",
  },
];

const STEPS = [
  { title: "Fetch", text: "Reads the file tree and picks about 28 high-signal files: manifests, README, entry points, routes, the data layer." },
  { title: "Parse", text: "Extracts imports for TS/JS, Python, Go, Rust, JVM languages and Ruby into a file-level dependency graph." },
  { title: "Synthesize", text: "A model groups files into modules, flags issues and writes the tour, as JSON checked against a schema." },
  { title: "Ground", text: "Every path, link and line number is checked against the repo. Code you see is always read from the real file." },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden px-4 pb-16 pt-16 sm:pt-24">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
          <div className="pointer-events-none absolute left-1/2 top-[30%] h-[420px] w-[720px] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal-600/10 blur-[120px]" />

          <div className="relative mx-auto flex max-w-2xl flex-col items-center">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-[11px] text-muted">
              <Zap size={12} className="text-signal-400" /> Grounded in real imports, not guesses
            </div>
            <h1 className="text-balance text-center text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
              Understand any codebase
              <br />
              <span className="glitch text-signal-500 [text-shadow:0_0_28px_rgba(255,30,30,0.45)]" data-text="in under a minute">
                in under a minute
              </span>
            </h1>
            <p className="mt-4 max-w-md text-balance text-center text-sm leading-relaxed text-muted">
              Paste a public GitHub repo. Get an interactive architecture map, a bug radar with exact file:line references,
              and a guided tour for your first contribution.
            </p>
            <div className="mt-9 w-full">
              <AnalyzeForm />
            </div>
            <div className="mt-7">
              <DemoLinks />
            </div>
          </div>
        </section>

        <section className="px-4 pb-20">
          <Link
            href="/analyze?demo=zustand"
            className="group mx-auto block max-w-5xl overflow-hidden rounded-xl border border-line-strong shadow-[0_0_80px_-30px_rgba(255,30,30,0.6)] transition hover:border-signal-500/50"
          >
            <Image
              src={shot}
              alt="RepoLens workspace showing the architecture map of pmndrs/zustand, with module cards, import-verified links and the inspector panel"
              placeholder="blur"
              sizes="(min-width: 1056px) 1024px, 100vw"
              className="h-auto w-full"
            />
          </Link>
          <p className="mt-3 text-center text-[12px] text-dim">
            The pmndrs/zustand demo.{" "}
            <Link href="/analyze?demo=zustand" className="text-muted hover:text-fg">
              Open it live →
            </Link>
          </p>
        </section>

        <section className="border-t border-line px-4 py-20">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-xl border border-line bg-panel/60 p-5">
                <Icon size={17} className="mb-3 text-signal-400" />
                <h2 className="text-[15px] font-medium">{title}</h2>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line px-4 py-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              The model writes the map. RepoLens then checks every claim it can against the code, and shows you which
              parts it could verify.
            </p>
            <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-xl border border-line p-5">
                  <span className="font-mono text-[11px] text-signal-400">0{i + 1}</span>
                  <h3 className="mt-1 text-[15px] font-medium">{s.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
            <Link href="/how-it-works" className="mt-8 inline-flex items-center gap-1.5 text-[13px] text-signal-300 hover:text-signal-200">
              Read the details <ArrowRight size={13} />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
