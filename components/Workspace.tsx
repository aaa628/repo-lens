"use client";

import { ReactFlowProvider } from "@xyflow/react";
import {
  Bug,
  Check,
  ChevronDown,
  Compass,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Star,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { download, toMarkdown, toMermaid } from "@/lib/export";
import type { AnalysisResult } from "@/lib/types";
import { formatStars, LAYER_STYLE } from "@/lib/ui";
import GraphCanvas, { type Focus } from "./GraphCanvas";
import Inspector, { type Mode } from "./Inspector";
import { Logo } from "./Site";

export default function Workspace({ data, isDemo }: { data: AnalysisResult; isDemo: boolean }) {
  const [mode, setModeState] = useState<Mode>("architecture");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedBugId, setSelectedBugId] = useState<string | null>(null);
  const [tourStep, setTourStepState] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [focus, setFocus] = useState<Focus>({ nodeId: null, nonce: 0 });

  const focusOn = useCallback((nodeId: string | null) => setFocus((f) => ({ nodeId, nonce: f.nonce + 1 })), []);

  const setTourStep = useCallback(
    (n: number) => {
      const clamped = Math.max(0, Math.min(data.walkthrough.length - 1, n));
      setTourStepState(clamped);
      const step = data.walkthrough[clamped];
      if (step) focusOn(step.nodeId);
    },
    [data.walkthrough, focusOn],
  );

  const setMode = useCallback(
    (m: Mode) => {
      setModeState(m);
      setInspectorOpen(true);
      if (m === "tour") setTourStep(tourStep);
      else if (m === "bugs" && selectedBugId) focusOn(data.bugs.find((b) => b.id === selectedBugId)?.nodeId ?? null);
      else if (m === "architecture") focusOn(selectedNodeId);
      else focusOn(null);
    },
    [setTourStep, tourStep, selectedBugId, selectedNodeId, data.bugs, focusOn],
  );

  const selectNode = useCallback(
    (id: string | null) => {
      setSelectedNodeId(id);
      focusOn(id);
    },
    [focusOn],
  );

  const selectBug = useCallback(
    (id: string | null) => {
      setSelectedBugId(id);
      setModeState("bugs");
      setInspectorOpen(true);
      focusOn(id ? (data.bugs.find((b) => b.id === id)?.nodeId ?? null) : null);
    },
    [data.bugs, focusOn],
  );

  const onNodeClick = useCallback(
    (id: string) => {
      if (mode === "tour") {
        const idx = data.walkthrough.findIndex((w) => w.nodeId === id);
        if (idx >= 0) return setTourStep(idx);
      }
      if (mode === "bugs") {
        const bug = data.bugs.find((b) => b.nodeId === id);
        if (bug) return selectBug(bug.id);
      }
      setModeState("architecture");
      setInspectorOpen(true);
      selectNode(id);
    },
    [mode, data, setTourStep, selectBug, selectNode],
  );

  const onPaneClick = useCallback(() => {
    if (mode === "architecture" && selectedNodeId) selectNode(null);
  }, [mode, selectedNodeId, selectNode]);

  /* ---- what the canvas emphasizes in each mode ---- */
  const { highlight, activeNodeId } = useMemo((): { highlight: Set<string> | null; activeNodeId: string | null } => {
    if (mode === "tour") {
      const id = data.walkthrough[tourStep]?.nodeId ?? null;
      return { highlight: id ? new Set([id]) : null, activeNodeId: id };
    }
    if (mode === "bugs") {
      const bug = data.bugs.find((b) => b.id === selectedBugId);
      if (bug) return { highlight: new Set([bug.nodeId]), activeNodeId: bug.nodeId };
      const withBugs = new Set(data.bugs.map((b) => b.nodeId));
      return { highlight: withBugs.size ? withBugs : null, activeNodeId: null };
    }
    if (selectedNodeId) {
      const near = new Set([selectedNodeId]);
      for (const e of data.edges) {
        if (e.source === selectedNodeId) near.add(e.target);
        if (e.target === selectedNodeId) near.add(e.source);
      }
      return { highlight: near, activeNodeId: selectedNodeId };
    }
    return { highlight: null, activeNodeId: null };
  }, [mode, tourStep, selectedBugId, selectedNodeId, data]);

  const stepBadges = useMemo(() => {
    if (mode !== "tour") return undefined;
    const m = new Map<string, number>();
    data.walkthrough.forEach((w, i) => !m.has(w.nodeId) && m.set(w.nodeId, i + 1));
    return m;
  }, [mode, data.walkthrough]);

  const m = data.repoMeta;
  const tabs: { id: Mode; label: string; icon: typeof Network; count?: number }[] = [
    { id: "architecture", label: "Architecture", icon: Network },
    { id: "bugs", label: "Bug Radar", icon: Bug, count: data.bugs.length },
    { id: "tour", label: "Guided Tour", icon: Compass },
  ];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      {/* ---------------- Top bar ---------------- */}
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-panel/80 px-3 backdrop-blur sm:px-4">
        <Link href="/" className="flex items-center gap-2" title="Analyze another repo">
          <Logo />
          <span className="text-sm font-semibold tracking-tight max-lg:hidden">RepoLens</span>
        </Link>
        <span className="h-5 w-px bg-line max-sm:hidden" />
        <div className="flex min-w-0 items-center gap-2">
          <a
            href={m.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="group flex min-w-0 items-center gap-1.5 font-mono text-[12.5px] text-fg hover:text-signal-200"
          >
            <span className="truncate">
              <span className="text-dim">{m.owner}/</span>
              {m.name}
            </span>
            <ExternalLink size={11} className="shrink-0 text-dim group-hover:text-signal-300" />
          </a>
          <span className="hidden shrink-0 items-center gap-1 rounded border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-muted md:flex">
            {m.primaryLanguage}
          </span>
          <span className="hidden shrink-0 items-center gap-1 rounded border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-muted md:flex">
            <Star size={10} className="text-zinc-300" /> {formatStars(m.stars)}
          </span>
          {isDemo && (
            <span className="hidden shrink-0 rounded bg-signal-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-signal-300 xl:block">
              Demo
            </span>
          )}
        </div>

        <nav className="mx-auto flex items-center gap-0.5 rounded-lg border border-line bg-bg/60 p-0.5">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] transition ${mode === id ? "text-fg" : "text-dim hover:text-muted"}`}
            >
              {mode === id && <span className="absolute inset-0 rounded-md bg-white/[0.07] ring-1 ring-line-strong" />}
              <Icon size={13} className="relative" />
              <span className="relative max-md:hidden">{label}</span>
              {count !== undefined && count > 0 && (
                <span className="relative rounded bg-signal-500/15 px-1 font-mono text-[10px] text-signal-400">{count}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <ExportMenu data={data} />
          <button
            onClick={() => setInspectorOpen((o) => !o)}
            className="rounded-md p-1.5 text-dim transition hover:bg-white/5 hover:text-fg"
            title={inspectorOpen ? "Hide inspector" : "Show inspector"}
          >
            {inspectorOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
      </header>

      {/* ---------------- Canvas + inspector ---------------- */}
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <ReactFlowProvider>
            <GraphCanvas
              data={data}
              highlight={highlight}
              activeNodeId={activeNodeId}
              stepBadges={stepBadges}
              focus={focus}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
            />
          </ReactFlowProvider>
          <Legend />
        </div>

        {inspectorOpen && (
          <aside className="w-[var(--inspector-w)] shrink-0 overflow-hidden border-l border-line bg-panel [--inspector-w:clamp(340px,30vw,480px)] max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-20 max-md:[--inspector-w:min(100vw,420px)] max-md:shadow-2xl">
            <Inspector
              data={data}
              mode={mode}
              selectedNodeId={selectedNodeId}
              onSelectNode={selectNode}
              selectedBugId={selectedBugId}
              onSelectBug={selectBug}
              tourStep={tourStep}
              setTourStep={setTourStep}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-260px)] -translate-x-1/2 flex-wrap max-md:hidden items-center gap-x-3 gap-y-1 rounded-md border border-line bg-black/80 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] backdrop-blur">
      {Object.values(LAYER_STYLE).map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1.5 text-muted">
          <span className="size-2 rounded-[2px]" style={{ background: color }} />
          {label}
        </span>
      ))}
      <span className="h-3 w-px bg-line" />
      <span className="flex items-center gap-1.5 text-muted">
        <span className="h-[2px] w-4 bg-signal-500 shadow-[0_0_6px_#ff1e1e]" /> import-verified
      </span>
      <span className="flex items-center gap-1.5 text-muted">
        <span className="h-[2px] w-4 bg-white/70" /> inferred
      </span>
    </div>
  );
}

function ExportMenu({ data }: { data: AnalysisResult }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    // Capture phase: the graph canvas swallows mouse events, so a bubbling listener never hears clicks on it.
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [open]);

  const base = `${data.repoMeta.owner}-${data.repoMeta.name}`;
  const items = [
    { icon: FileText, label: "Markdown report", hint: ".md", run: () => download(`${base}-architecture.md`, toMarkdown(data)) },
    { icon: Workflow, label: "Mermaid diagram", hint: ".mmd", run: () => download(`${base}.mmd`, toMermaid(data), "text/plain") },
    {
      icon: copied ? Check : Copy,
      label: copied ? "Copied" : "Copy Mermaid",
      hint: "",
      run: () => {
        void navigator.clipboard.writeText(toMermaid(data));
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      keepOpen: true,
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-line bg-panel-2 px-2.5 py-1 text-[12.5px] text-muted transition hover:border-line-strong hover:text-fg"
      >
        <Download size={13} />
        <span className="max-sm:hidden">Export</span>
        <ChevronDown size={12} className="max-sm:hidden" />
      </button>
      {open && (
        <div className="fade-in absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-lg border border-line-strong bg-panel-2 p-1 shadow-2xl">
          {items.map((it) => (
            <button
              key={it.hint + it.label}
              onClick={() => {
                it.run();
                if (!it.keepOpen) setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-zinc-300 hover:bg-white/[0.06] hover:text-fg"
            >
              <it.icon size={13} className="text-dim" />
              {it.label}
              <span className="ml-auto font-mono text-[10.5px] text-dim">{it.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
