"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisResult, ProgressEvent } from "@/lib/types";
import { DEMOS } from "@/lib/demos";
import Landing from "./Landing";
import Workspace from "./Workspace";

type Phase =
  | { kind: "landing" }
  | { kind: "loading"; repo: string; events: ProgressEvent[]; startedAt: number }
  | { kind: "workspace"; data: AnalysisResult; demo: boolean };

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

export default function RepoLens() {
  const [phase, setPhase] = useState<Phase>({ kind: "landing" });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const openDemo = useCallback(async (slug: string) => {
    setError(null);
    try {
      const res = await fetch(`/demos/${slug}.json`);
      if (!res.ok) throw new Error("Demo not found");
      const data = (await res.json()) as AnalysisResult;
      setPhase({ kind: "workspace", data, demo: true });
      window.history.replaceState(null, "", `?demo=${slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load demo");
    }
  }, []);

  const analyze = useCallback(async (url: string) => {
    setError(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase({ kind: "loading", repo: url, events: [], startedAt: Date.now() });
    try {
      const data = await streamAnalysis(
        url,
        (e) => setPhase((p) => (p.kind === "loading" ? { ...p, events: [...p.events, e] } : p)),
        ctrl.signal,
      );
      setPhase({ kind: "workspace", data, demo: false });
      window.history.replaceState(null, "", `?repo=${data.repoMeta.owner}/${data.repoMeta.name}`);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Analysis failed");
      setPhase({ kind: "landing" });
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setPhase({ kind: "landing" });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPhase({ kind: "landing" });
    window.history.replaceState(null, "", "/");
  }, []);

  // Deep links: ?demo=zustand or ?repo=owner/name
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get("demo");
    const repo = params.get("repo");
    if (demo && DEMOS.some((d) => d.slug === demo)) void openDemo(demo);
    else if (repo) void analyze(`https://github.com/${repo}`);
  }, [openDemo, analyze]);

  return (
    <AnimatePresence mode="wait">
      {phase.kind === "workspace" ? (
        <motion.div
          key="workspace"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="h-dvh"
        >
          <Workspace data={phase.data} isDemo={phase.demo} onReset={reset} />
        </motion.div>
      ) : (
        <motion.div key="landing" exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }} className="h-dvh">
          <Landing
            loading={phase.kind === "loading" ? phase : null}
            error={error}
            onAnalyze={analyze}
            onDemo={openDemo}
            onCancel={cancel}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
