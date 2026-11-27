"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Bug, Check, Compass, LoaderCircle, Network, Telescope, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { DEMOS } from "@/lib/demos";
import { STAGES, type ProgressEvent } from "@/lib/types";

type Loading = { repo: string; events: ProgressEvent[]; startedAt: number };

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

export default function Landing({
  loading,
  error,
  onAnalyze,
  onDemo,
  onCancel,
}: {
  loading: Loading | null;
  error: string | null;
  onAnalyze: (url: string) => void;
  onDemo: (slug: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState("");
  const valid = /github\.com\/[\w.-]+\/[\w.-]+|^[\w.-]+\/[\w.-]+$/i.test(url.trim());

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      {/* backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[30%] h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal-600/10 blur-[120px]" />

      <header className="relative z-10 flex h-[52px] items-center justify-between border-b border-line px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-sm font-semibold tracking-tight">RepoLens</span>
        </div>
        <span className="hidden font-mono text-[11px] text-dim sm:block">repo → architecture → onboarding</span>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-[11px] text-muted"
        >
          <Zap size={12} className="text-signal-400" /> Grounded in real imports, not guesses
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="text-balance text-center text-4xl font-semibold tracking-[-0.03em] sm:text-5xl"
        >
          Understand any codebase
          <br />
          <span className="glitch text-signal-500 [text-shadow:0_0_28px_rgba(255,30,30,0.45)]" data-text="in under a minute">
            in under a minute
          </span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mt-4 max-w-md text-balance text-center text-sm leading-relaxed text-muted"
        >
          Paste a public GitHub repo. Get an interactive architecture map, a bug radar with exact file:line references,
          and a guided tour for your first contribution.
        </motion.p>

        <AnimatePresence mode="wait">
          {loading ? (
            <ProgressCard key="progress" loading={loading} onCancel={onCancel} />
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, delay: 0.12 }}
              className="mt-9 w-full"
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (valid) onAnalyze(url.trim());
                }}
                className="glow-input flex items-center gap-2 rounded-xl bg-panel p-1.5 transition-shadow"
              >
                <span className="pl-3 font-mono text-[13px] text-dim max-sm:hidden">⌕</span>
                <input
                  autoFocus
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  spellCheck={false}
                  aria-label="GitHub repository URL"
                  className="min-w-0 flex-1 bg-transparent px-2 py-2.5 font-mono text-[13px] text-fg outline-none placeholder:text-zinc-600"
                />
                <button
                  type="submit"
                  disabled={!valid}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-signal-600 px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-signal-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  Analyze Repo <ArrowRight size={14} />
                </button>
              </form>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 rounded-lg border border-signal-500/25 bg-signal-500/[0.07] px-3 py-2 text-[12.5px] leading-relaxed text-signal-300"
                  role="alert"
                >
                  {error}
                </motion.div>
              )}

              <div className="mt-7 flex flex-col items-center gap-3">
                <span className="text-[11px] uppercase tracking-[0.14em] text-dim">Instant demos · no wait</span>
                <div className="flex flex-wrap justify-center gap-2">
                  {DEMOS.map((d) => (
                    <button
                      key={d.slug}
                      onClick={() => onDemo(d.slug)}
                      className="group flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-1.5 text-[12.5px] transition hover:border-signal-500/50 hover:bg-signal-500/[0.06]"
                    >
                      <span className="font-mono text-fg">{d.repo}</span>
                      <span className="text-dim group-hover:text-muted">{d.blurb}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-14 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: Network, title: "Architecture map", text: "Auto-laid-out module graph, edges verified by static import parsing." },
            { icon: Bug, title: "Bug radar", text: "Severity-ranked findings with exact file:line and a suggested fix." },
            { icon: Compass, title: "Guided tour", text: "5–7 steps from README to your first good contribution." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-line bg-panel/60 p-3.5">
              <Icon size={15} className="mb-2 text-signal-400" />
              <div className="text-[13px] font-medium">{title}</div>
              <div className="mt-1 text-[12px] leading-relaxed text-dim">{text}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function ProgressCard({ loading, onCancel }: { loading: Loading; onCancel: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const latest = new Map<string, ProgressEvent>();
  for (const e of loading.events) latest.set(e.stage, e);
  const activeIdx = STAGES.findIndex((s) => latest.get(s.id)?.status !== "done");
  const elapsed = ((now - loading.startedAt) / 1000).toFixed(1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mt-9 w-full rounded-xl border border-line bg-panel p-4 shadow-[0_0_60px_-20px_rgba(255,30,30,0.45)]"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="truncate font-mono text-[12px] text-muted">{loading.repo.replace(/^https?:\/\/(www\.)?github\.com\//, "")}</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] tabular-nums text-dim">{elapsed}s</span>
          <button onClick={onCancel} className="rounded p-1 text-dim hover:bg-white/5 hover:text-fg" aria-label="Cancel">
            <X size={14} />
          </button>
        </div>
      </div>
      <ol className="space-y-1">
        {STAGES.map((s, i) => {
          const ev = latest.get(s.id);
          const done = ev?.status === "done";
          const active = i === activeIdx;
          return (
            <li
              key={s.id}
              className={`flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors ${active ? "bg-white/[0.03]" : ""}`}
            >
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
                {done ? (
                  <Check size={14} className="text-zinc-100" />
                ) : active ? (
                  <LoaderCircle size={14} className="animate-spin text-signal-400" />
                ) : (
                  <span className="size-1.5 rounded-full bg-zinc-700" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] ${done || active ? "text-fg" : "text-dim"}`}>
                  {ev ? ev.message.replace(/…$/, active ? "…" : "") : s.label}
                </div>
                {ev?.detail && <div className="truncate font-mono text-[11px] text-dim">{ev.detail}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </motion.div>
  );
}
