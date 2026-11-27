import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader, SOURCE_URL } from "@/components/Site";

export const metadata: Metadata = {
  title: "How it works",
  description: "How RepoLens picks files, parses imports, asks a model for an architecture map, and checks the answer against the repo.",
};

const STAGES = [
  {
    title: "Fetch",
    body: [
      "Two GitHub API calls get the repo's metadata and its full file tree. Lockfiles, build output, binaries, vendored code and generated files are dropped. Tests are skipped unless the repo has almost nothing else.",
      "Every remaining file gets a score: manifests, the README, entry points, API routes, data-layer files and core source score highest. RepoLens first takes the best file from each area of the codebase, then fills the rest by score, up to about 28 files and 150 KB. Caps per folder keep one big directory (or examples/) from crowding out the rest.",
    ],
  },
  {
    title: "Parse imports",
    body: [
      "A static parser reads imports and exports in TypeScript, JavaScript, Vue, Svelte, Astro, Python, Go, Rust, Java, Kotlin, Scala and Ruby. Imports are resolved against the full tree, so a link to a file RepoLens didn't download still counts. Stylesheets and images are ignored.",
    ],
  },
  {
    title: "Synthesize",
    body: [
      "The model receives the directory outline, the import graph, exported symbols, the top external packages and the selected files with line numbers. It must answer with JSON that matches a fixed schema: 5–12 modules, the links between them, up to about 8 findings, and a 5–7 step tour. Claude is the default model; OpenAI can be used instead.",
    ],
  },
  {
    title: "Ground",
    body: [
      "The answer is not taken at face value. Paths that don't exist in the repo are dropped. A link between two modules is marked import-verified when the parser found an import between their files, and import links the model missed are added. A finding must cite a real file; its line number is checked against the downloaded file, and the code shown next to it is read from that file, not copied from the model.",
    ],
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function HowItWorks() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:py-20">
        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-signal-400">How it works</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A model writes the map. The repo checks it.</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          RepoLens reads a repository the way a new teammate would: manifest and README first, then the entry points,
          the API surface and the data layer. Each analysis runs in four stages, and you can watch them as they happen.
        </p>

        <ol className="mt-12 space-y-8">
          {STAGES.map((s, i) => (
            <li key={s.title} className="grid gap-2 sm:grid-cols-[3rem_1fr]">
              <span className="font-mono text-[13px] text-signal-400">0{i + 1}</span>
              <div>
                <h2 className="text-lg font-medium">{s.title}</h2>
                {s.body.map((p) => (
                  <p key={p.slice(0, 24)} className="mt-2 text-[14px] leading-relaxed text-muted">
                    {p}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>

        <Section title="Reading the results">
          <p>
            <span className="text-fg">Red links</span> are import-verified and carry a check mark in the inspector.{" "}
            <span className="text-fg">White links</span> are runtime relationships the model inferred from the code,
            such as an HTTP call or a database write. Exports to Markdown and Mermaid keep the difference: solid arrows
            are verified, dotted arrows inferred.
          </p>
          <p>
            Each finding says whether its line reference was verified. Treat findings as leads, not verdicts: they are
            model output, checked only for where they point, not for whether they are right.
          </p>
        </Section>

        <Section title="Limits">
          <ul className="list-disc space-y-2 pl-5">
            <li>Public repositories only.</li>
            <li>About 28 files are read, so a very large repo gets a partial view. The directory outline and module file counts still cover the whole tree.</li>
            <li>An analysis takes 30–120 seconds. Results are cached for an hour, so opening the same repo again is instant.</li>
            <li>Without a GitHub token the server gets 60 GitHub API requests an hour, about 30 analyses.</li>
          </ul>
        </Section>

        <Section title="What leaves your browser">
          <p>
            Your browser sends the repo URL to the RepoLens server. The server downloads the files from GitHub and sends
            the selected files to the model provider (Anthropic by default). The result is kept in server memory for up
            to an hour; it is not written to a database. The instant demos are static files and make no model calls.
          </p>
        </Section>

        <Section title="Run your own">
          <p>
            RepoLens is a standard Next.js app.{" "}
            <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="text-fg underline underline-offset-4 hover:text-signal-200">
              Get the source
            </a>
            , add an <code className="font-mono text-[13px] text-fg">ANTHROPIC_API_KEY</code> (and ideally a{" "}
            <code className="font-mono text-[13px] text-fg">GITHUB_TOKEN</code>) to <code className="font-mono text-[13px] text-fg">.env.local</code>,
            then run <code className="font-mono text-[13px] text-fg">npm install</code> and{" "}
            <code className="font-mono text-[13px] text-fg">npm run dev</code>. It deploys to Vercel or Netlify as is.
          </p>
        </Section>

        <div className="mt-16 flex flex-wrap gap-3">
          <Link href="/" className="rounded-lg bg-signal-600 px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-signal-500">
            Analyze a repo
          </Link>
          <Link href="/analyze?demo=zustand" className="rounded-lg border border-line px-4 py-2.5 text-[13px] text-muted transition hover:border-line-strong hover:text-fg">
            Open a demo
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
