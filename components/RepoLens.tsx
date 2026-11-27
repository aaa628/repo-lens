"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { STAGES, type AnalysisResult, type ProgressEvent } from "@/lib/types";
import AnalyzeForm from "./AnalyzeForm";
import { DemoLinks, SiteHeader } from "./Site";
import Workspace from "./Workspace";

type Phase =
  | { kind: "loading"; events: ProgressEvent[]; startedAt: number }
  | { kind: "workspace"; data: AnalysisResult }
  | { kind: "error"; message: string };

/** POSTs to /api/analyze and consumes the SSE stream until a result or error frame arrives. */
async function streamAnalysis(url: string, onProgress: (e: ProgressEvent) => void, signal: AbortSignal) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue; // comment / keep-alive
      const payload = JSON.parse(data);
      if (event === "progress") onProgress(payload as ProgressEvent);
      else if (event === "result") return payload as AnalysisResult;
      else if (event === "error") throw new Error((payload as { message: string }).message);
    }
  }
  throw new Error("The connection closed before the analysis finished. Please try again.");
}

async function loadDemo(slug: string, signal: AbortSignal) {
  const res = await fetch(`/demos/${slug}.json`, { signal });
  if (!res.ok) throw new Error("Demo not found");
  return (await res.json()) as AnalysisResult;
}

/** Shows a precomputed demo (`demo` slug) or streams a live analysis of `repo` (owner/name). */
export default function RepoLens({ repo, demo }: { repo?: string; demo?: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading", events: [], startedAt: Date.now() });

  useEffect(() => {
    const ctrl = new AbortController();
    setPhase({ kind: "loading", events: [], startedAt: Date.now() });
    const onProgress = (e: ProgressEvent) => setPhase((p) => (p.kind === "loading" ? { ...p, events: [...p.events, e] } : p));
    (demo ? loadDemo(demo, ctrl.signal) : streamAnalysis(`https://github.com/${repo}`, onProgress, ctrl.signal)).then(
      (data) => setPhase({ kind: "workspace", data }),
      (e) => !ctrl.signal.aborted && setPhase({ kind: "error", message: e instanceof Error ? e.message : "Analysis failed" }),
    );
    return () => ctrl.abort();
  }, [repo, demo]);

  if (phase.kind === "workspace") return <Workspace data={phase.data} isDemo={!!demo} />;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16">
        {phase.kind === "loading" ? (
          <ProgressCard repo={demo ?? repo ?? ""} events={phase.events} startedAt={phase.startedAt} />
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              Couldn&apos;t analyze <span className="font-mono text-signal-400">{repo ?? demo}</span>
            </h1>
            <div
              role="alert"
              className="mt-4 rounded-lg border border-signal-500/25 bg-signal-500/[0.07] px-3 py-2 text-[12.5px] leading-relaxed text-signal-300"
            >
              {phase.message}
            </div>
            <div className="mt-8">
              <AnalyzeForm />
            </div>
            <div className="mt-8">
              <DemoLinks />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function ProgressCard({ repo, events, startedAt }: { repo: string; events: ProgressEvent[]; startedAt: number }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const latest = new Map<string, ProgressEvent>();
  for (const e of events) latest.set(e.stage, e);
  const activeIdx = STAGES.findIndex((s) => latest.get(s.id)?.status !== "done");
  const elapsed = (Math.max(0, now - startedAt) / 1000).toFixed(1);

  return (
    <div className="w-full rounded-xl border border-line bg-panel p-4 shadow-[0_0_60px_-20px_rgba(255,30,30,0.45)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="truncate font-mono text-[12px] text-muted">{repo}</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] tabular-nums text-dim">{elapsed}s</span>
          <Link href="/" className="rounded p-1 text-dim hover:bg-white/5 hover:text-fg" aria-label="Cancel">
            <X size={14} />
          </Link>
        </div>
      </div>
      <ol className="space-y-1">
        {STAGES.map((s, i) => {
          const ev = latest.get(s.id);
          const done = ev?.status === "done";
          const active = i === activeIdx;
          return (
            <li key={s.id} className={`flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors ${active ? "bg-white/[0.03]" : ""}`}>
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
    </div>
  );
}
