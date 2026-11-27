"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  Bug as BugIcon,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileCode,
  Flag,
  Info,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LAYERS, type AnalysisResult, type ArchNode, type Bug, type Severity } from "@/lib/types";
import { blobUrl, LAYER_STYLE, SEVERITY_STYLE } from "@/lib/ui";
import CodeBlock from "./CodeBlock";

export type Mode = "architecture" | "bugs" | "tour";

function LayerBadge({ layer }: { layer: ArchNode["layer"] }) {
  const s = LAYER_STYLE[layer];
  return (
    <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity];
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider" style={{ color: s.color, background: s.bg }}>
      <span className="size-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-dim">{children}</h3>;
}

/* ================================================================== */
/* Architecture                                                         */
/* ================================================================== */

function ArchitecturePanel({
  data,
  selectedNodeId,
  onSelectNode,
  onSelectBug,
}: {
  data: AnalysisResult;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onSelectBug: (id: string) => void;
}) {
  const { repoMeta: m } = data;
  const node = data.nodes.find((n) => n.id === selectedNodeId);
  const label = (id: string) => data.nodes.find((n) => n.id === id)?.label ?? id;

  if (!node) {
    const byLayer = LAYERS.map((l) => ({ layer: l, nodes: data.nodes.filter((n) => n.layer === l) }))
      .filter((g) => g.nodes.length);
    const s = data.stats;
    return (
      <div className="space-y-6">
        <div>
          <SectionTitle>Overview</SectionTitle>
          <p className="text-[13px] leading-relaxed text-zinc-300">{data.summary}</p>
        </div>
        {m.techStack.length > 0 && (
          <div>
            <SectionTitle>Tech stack</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {m.techStack.map((t) => (
                <span key={t} className="rounded-md border border-line bg-panel-2 px-2 py-0.5 font-mono text-[11px] text-muted">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {[
            { k: "Files analyzed", v: `${s.analyzedFiles} / ${s.totalFiles.toLocaleString()}` },
            { k: "Source read", v: `${(s.analyzedBytes / 1024).toFixed(0)} KB` },
            { k: "Import edges", v: s.importEdges },
            { k: "Verified module edges", v: `${s.groundedEdges} / ${data.edges.length}` },
          ].map(({ k, v }) => (
            <div key={k} className="rounded-lg border border-line bg-panel-2/60 px-3 py-2">
              <div className="font-mono text-[15px] font-medium tabular-nums">{v}</div>
              <div className="text-[11px] text-dim">{k}</div>
            </div>
          ))}
        </div>
        <div>
          <SectionTitle>Modules</SectionTitle>
          <div className="space-y-3">
            {byLayer.map((g) => (
              <div key={g.layer}>
                <div className="mb-1">
                  <LayerBadge layer={g.layer} />
                </div>
                {g.nodes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onSelectNode(n.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] text-zinc-300 hover:bg-white/[0.04] hover:text-fg"
                  >
                    <span className="truncate">{n.label}</span>
                    <span className="flex shrink-0 items-center gap-2 font-mono text-[10.5px] text-dim">
                      {data.bugs.some((b) => b.nodeId === n.id) && <BugIcon size={11} className="text-signal-400" />}
                      {n.fileCount}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-panel-2/40 p-3 text-[11.5px] leading-relaxed text-dim">
          <div className="mb-1.5 flex items-center gap-2">
            <svg width="28" height="6">
              <line x1="0" y1="3" x2="28" y2="3" stroke="#ff1e1e" strokeWidth="2" />
            </svg>
            <span className="text-muted">Verified by static imports</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="28" height="6">
              <line x1="0" y1="3" x2="28" y2="3" stroke="#f5f5f5" strokeWidth="2" />
            </svg>
            <span className="text-muted">Inferred runtime relationship</span>
          </div>
        </div>
        <GeneratedBy data={data} />
      </div>
    );
  }

  const outgoing = data.edges.filter((e) => e.source === node.id);
  const incoming = data.edges.filter((e) => e.target === node.id);
  const bugs = data.bugs.filter((b) => b.nodeId === node.id);

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => onSelectNode(null)} className="mb-3 flex items-center gap-1 text-[12px] text-dim hover:text-fg">
          <ArrowLeft size={12} /> All modules
        </button>
        <div className="mb-2 flex items-center gap-2">
          <LayerBadge layer={node.layer} />
          <span className="font-mono text-[11px] text-dim">{node.fileCount} files</span>
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{node.label}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">{node.summary}</p>
      </div>

      {node.files.length > 0 && (
        <div>
          <SectionTitle>Key files</SectionTitle>
          <ul className="space-y-0.5">
            {node.files.map((f) => (
              <li key={f}>
                <a
                  href={blobUrl(m.htmlUrl, m.defaultBranch, f)}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-2 rounded-md px-2 py-1 font-mono text-[11.5px] text-muted hover:bg-white/[0.04] hover:text-fg"
                >
                  <FileCode size={12} className="shrink-0 text-dim" />
                  <span className="truncate">{f}</span>
                  <ExternalLink size={11} className="ml-auto shrink-0 opacity-0 group-hover:opacity-100" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(outgoing.length > 0 || incoming.length > 0) && (
        <div className="grid gap-4">
          {[
            { title: "Depends on", icon: ArrowUpRight, list: outgoing, other: (e: (typeof outgoing)[0]) => e.target },
            { title: "Used by", icon: ArrowDownLeft, list: incoming, other: (e: (typeof outgoing)[0]) => e.source },
          ]
            .filter((g) => g.list.length)
            .map(({ title, icon: Icon, list, other }) => (
              <div key={title}>
                <SectionTitle>
                  {title} · {list.length}
                </SectionTitle>
                <ul className="space-y-1">
                  {list.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => onSelectNode(other(e))}
                        className="flex w-full items-center gap-2 rounded-md border border-line bg-panel-2/50 px-2.5 py-1.5 text-left hover:border-line-strong"
                      >
                        <Icon size={12} className="shrink-0 text-dim" />
                        <span className="truncate text-[12.5px]">{label(other(e))}</span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-dim">{e.label}</span>
                        {e.grounded ? (
                          <span title={`${e.importCount} import${e.importCount === 1 ? "" : "s"} found by the static parser`}>
                            <BadgeCheck size={13} className="shrink-0 text-signal-400" />
                          </span>
                        ) : (
                          <span title="Inferred by the model (no direct import)">
                            <Info size={13} className="shrink-0 text-zinc-600" />
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}

      {node.keySnippet && (
        <div>
          <SectionTitle>Code preview</SectionTitle>
          <CodeBlock
            code={node.keySnippet.code}
            language={node.keySnippet.language}
            startLine={node.keySnippet.startLine ?? 1}
            file={node.keySnippet.file}
            href={blobUrl(m.htmlUrl, m.defaultBranch, node.keySnippet.file, node.keySnippet.startLine)}
          />
        </div>
      )}

      {bugs.length > 0 && (
        <div>
          <SectionTitle>Issues in this module</SectionTitle>
          <ul className="space-y-1">
            {bugs.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => onSelectBug(b.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.04]"
                >
                  <SeverityBadge severity={b.severity} />
                  <span className="truncate text-[12.5px] text-zinc-300">{b.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GeneratedBy({ data }: { data: AnalysisResult }) {
  const g = data.generatedBy;
  return (
    <div className="border-t border-line pt-3 font-mono text-[10.5px] leading-relaxed text-dim">
      {g.provider} · {g.model} · {new Date(g.analyzedAt).toLocaleDateString()}
      {g.note && <div className="mt-1 font-sans text-[11px]">{g.note}</div>}
    </div>
  );
}

/* ================================================================== */
/* Bug radar                                                            */
/* ================================================================== */

function BugCard({ bug, data, open, onClick }: { bug: Bug; data: AnalysisResult; open: boolean; onClick: () => void }) {
  const m = data.repoMeta;
  const node = data.nodes.find((n) => n.id === bug.nodeId);
  return (
    <li
      className={`overflow-hidden rounded-lg border transition-colors ${open ? "border-line-strong bg-panel-2/70" : "border-line bg-panel-2/30 hover:border-line-strong"}`}
    >
      <button onClick={onClick} className="w-full px-3 py-2.5 text-left">
        <div className="mb-1.5 flex items-center gap-2">
          <SeverityBadge severity={bug.severity} />
          {node && <span className="truncate text-[11px] text-dim">{node.label}</span>}
        </div>
        <div className="text-[13px] font-medium leading-snug text-fg">{bug.title}</div>
        <div className="mt-1 truncate font-mono text-[11px] text-muted">
          {bug.file}:{bug.lineHint}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <div className="space-y-3 px-3 pb-3">
              <p className="text-[12.5px] leading-relaxed text-zinc-300">{bug.description}</p>
              {bug.context ? (
                <CodeBlock
                  code={bug.context.code}
                  language={bug.context.language}
                  startLine={bug.context.startLine}
                  highlightLine={bug.line}
                  file={bug.file}
                  href={blobUrl(m.htmlUrl, m.defaultBranch, bug.file, bug.line)}
                />
              ) : (
                <div className="rounded-md border border-signal-400/20 bg-signal-400/[0.06] px-2.5 py-1.5 text-[11.5px] text-signal-300/90">
                  Line {bug.lineHint} couldn&apos;t be verified against the fetched source.
                </div>
              )}
              <div className="rounded-md border border-white/20 bg-white/[0.05] p-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-100">
                  <Wrench size={11} /> Suggested fix
                </div>
                <p className="text-[12.5px] leading-relaxed text-zinc-300">{bug.suggestedFix}</p>
              </div>
              <a
                href={blobUrl(m.htmlUrl, m.defaultBranch, bug.file, bug.line)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11.5px] text-signal-300 hover:text-signal-200"
              >
                Open on GitHub <ExternalLink size={11} />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function BugRadarPanel({
  data,
  selectedBugId,
  onSelectBug,
}: {
  data: AnalysisResult;
  selectedBugId: string | null;
  onSelectBug: (id: string | null) => void;
}) {
  const [filter, setFilter] = useState<Severity | "all">("all");
  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 } as Record<Severity, number>;
    for (const b of data.bugs) c[b.severity]++;
    return c;
  }, [data]);
  const list = data.bugs.filter((b) => filter === "all" || b.severity === filter);

  if (!data.bugs.length) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <ShieldCheck size={28} className="mb-3 text-zinc-100" />
        <div className="text-[14px] font-medium">No issues found</div>
        <p className="mt-1 max-w-[240px] text-[12px] text-dim">Nothing stood out in the {data.stats.analyzedFiles} files analyzed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(["all", "high", "medium", "low"] as const).map((f) => {
          const n = f === "all" ? data.bugs.length : counts[f];
          const active = filter === f;
          const color = f === "all" ? "#fafafa" : SEVERITY_STYLE[f].color;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              disabled={n === 0}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] capitalize transition disabled:opacity-35 ${active ? "border-line-strong bg-white/[0.06] text-fg" : "border-line text-muted hover:text-fg"}`}
            >
              {f !== "all" && <span className="size-1.5 rounded-full" style={{ background: color }} />}
              {f} <span className="font-mono text-[10.5px] text-dim">{n}</span>
            </button>
          );
        })}
      </div>
      <ul className="space-y-2">
        {list.map((b) => (
          <BugCard key={b.id} bug={b} data={data} open={b.id === selectedBugId} onClick={() => onSelectBug(b.id === selectedBugId ? null : b.id)} />
        ))}
      </ul>
      <p className="text-[11px] leading-relaxed text-dim">
        Findings cite only files RepoLens read; {data.bugs.filter((b) => b.verified).length} of {data.bugs.length} line references were checked against the fetched source.
      </p>
    </div>
  );
}

/* ================================================================== */
/* Guided tour                                                          */
/* ================================================================== */

function TourPanel({ data, step, setStep }: { data: AnalysisResult; step: number; setStep: (n: number) => void }) {
  const steps = data.walkthrough;
  const m = data.repoMeta;
  const current = steps[step];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") setStep(Math.min(steps.length - 1, step + 1));
      if (e.key === "ArrowLeft") setStep(Math.max(0, step - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, steps.length, setStep]);

  if (!current) return <div className="py-16 text-center text-[13px] text-dim">No walkthrough available.</div>;

  const node = data.nodes.find((n) => n.id === current.nodeId);
  const readPath = current.whatToReadFirst.match(/[\w@.\-/[\]()]+\.[A-Za-z0-9]+/)?.[0];
  const last = step === steps.length - 1;

  return (
    <div className="flex h-full flex-col">
      {/* stepper */}
      <ol className="mb-5 flex items-center gap-1">
        {steps.map((s, i) => (
          <li key={s.step} className="flex flex-1 items-center gap-1">
            <button
              onClick={() => setStep(i)}
              title={s.title}
              className={`grid size-6 shrink-0 place-items-center rounded-full font-mono text-[10.5px] font-medium transition ${
                i === step ? "bg-signal-500 text-white shadow-[0_0_16px_-2px_rgba(255,30,30,0.8)]" : i < step ? "bg-signal-500/25 text-signal-200" : "bg-panel-2 text-dim ring-1 ring-line"
              }`}
            >
              {i + 1}
            </button>
            {i < steps.length - 1 && <span className={`h-px flex-1 ${i < step ? "bg-signal-500/50" : "bg-line"}`} />}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <div className="font-mono text-[11px] text-dim">
            Step {step + 1} of {steps.length}
          </div>
          <h2 className="text-lg font-semibold leading-snug tracking-tight">
            {last && <Flag size={15} className="mr-1.5 inline -translate-y-px text-zinc-100" />}
            {current.title}
          </h2>
          {node && (
            <div className="flex items-center gap-2">
              <LayerBadge layer={node.layer} />
              <span className="text-[12.5px] text-muted">{node.label}</span>
            </div>
          )}
          <p className="text-[13px] leading-relaxed text-zinc-300">{current.explanation}</p>
          <div className={`rounded-lg border p-3 ${last ? "border-white/25 bg-white/[0.05]" : "border-signal-500/25 bg-signal-500/[0.05]"}`}>
            <div className={`mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider ${last ? "text-zinc-100" : "text-signal-300"}`}>
              {last ? <Lightbulb size={11} /> : <BookOpen size={11} />} {last ? "Where to start" : "Read first"}
            </div>
            {readPath ? (
              <a
                href={blobUrl(m.htmlUrl, m.defaultBranch, readPath)}
                target="_blank"
                rel="noreferrer"
                className="break-all font-mono text-[12px] text-fg hover:underline"
              >
                {current.whatToReadFirst}
              </a>
            ) : (
              <span className="font-mono text-[12px] text-fg">{current.whatToReadFirst}</span>
            )}
          </div>
          {node?.keySnippet && (
            <CodeBlock
              code={node.keySnippet.code}
              language={node.keySnippet.language}
              startLine={node.keySnippet.startLine ?? 1}
              file={node.keySnippet.file}
              href={blobUrl(m.htmlUrl, m.defaultBranch, node.keySnippet.file, node.keySnippet.startLine)}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-2 bg-panel pt-5">
        <button
          onClick={() => setStep(step - 1)}
          disabled={step === 0}
          className="flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-[12.5px] text-muted transition hover:text-fg disabled:opacity-30"
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <span className="font-mono text-[10.5px] text-dim max-sm:hidden">← → keys</span>
        {last ? (
          <button
            onClick={() => setStep(0)}
            className="flex items-center gap-1.5 rounded-md bg-panel-2 px-3 py-1.5 text-[12.5px] text-fg ring-1 ring-line transition hover:ring-line-strong"
          >
            <RotateCcw size={13} /> Restart
          </button>
        ) : (
          <button
            onClick={() => setStep(step + 1)}
            className="flex items-center gap-1 rounded-md bg-signal-600 px-3 py-1.5 text-[12.5px] font-medium text-white transition hover:bg-signal-500"
          >
            Next <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */

export default function Inspector(props: {
  data: AnalysisResult;
  mode: Mode;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  selectedBugId: string | null;
  onSelectBug: (id: string | null) => void;
  tourStep: number;
  setTourStep: (n: number) => void;
}) {
  const { data, mode } = props;
  const titles: Record<Mode, { title: string; sub: string }> = {
    architecture: { title: "Inspector", sub: props.selectedNodeId ? "Module details" : `${data.nodes.length} modules` },
    bugs: { title: "Bug Radar", sub: `${data.bugs.length} findings by severity` },
    tour: { title: "Guided Tour", sub: `${data.walkthrough.length} steps for new contributors` },
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="text-[13px] font-medium">{titles[mode].title}</span>
        <span className="text-[11.5px] text-dim">{titles[mode].sub}</span>
      </div>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        {mode === "architecture" && (
          <ArchitecturePanel
            data={data}
            selectedNodeId={props.selectedNodeId}
            onSelectNode={props.onSelectNode}
            onSelectBug={props.onSelectBug}
          />
        )}
        {mode === "bugs" && <BugRadarPanel data={data} selectedBugId={props.selectedBugId} onSelectBug={props.onSelectBug} />}
        {mode === "tour" && <TourPanel data={data} step={props.tourStep} setStep={props.setTourStep} />}
      </div>
    </div>
  );
}
