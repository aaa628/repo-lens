"use client";

import dagre from "@dagrejs/dagre";
import {
  Background,
  BackgroundVariant,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Bug, Cpu, Database, Maximize, Minus, Monitor, Play, Plus, Settings2, Webhook } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisResult, ArchNode, Layer } from "@/lib/types";
import { LAYER_STYLE } from "@/lib/ui";

const NODE_W = 240;
const NODE_H = 84;

/** Execution-trace timing: each BFS level waits STEP ms, each edge draws in DRAW ms. */
const STEP = 900;
const DRAW = 1150;

const LAYER_ICON: Record<Layer, typeof Monitor> = {
  frontend: Monitor,
  api: Webhook,
  logic: Cpu,
  data: Database,
  config: Settings2,
};

type CardData = {
  node: ArchNode;
  bugCount: number;
  dimmed: boolean;
  active: boolean;
  stepBadge?: number;
  ignite: number; // ms after run start when the trace reaches this node
  run: number;
};
type CardNode = Node<CardData, "arch">;

type FlowData = {
  label: string;
  grounded: boolean;
  dimmed: boolean;
  emphasized: boolean;
  showLabel: boolean;
  delay: number;
  run: number;
  motion: boolean;
};
type FlowEdge = Edge<FlowData, "flow">;

/* ------------------------------------------------------------------ */
/* Layout + trace schedule                                              */
/* ------------------------------------------------------------------ */

function layout(data: AnalysisResult): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 34, ranksep: 120, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of data.nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of data.edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of data.nodes) {
    const p = g.node(n.id);
    pos.set(n.id, { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 });
  }
  return pos;
}

/**
 * Breadth-first "execution" from entry modules (no incoming edges): every edge gets a start delay
 * and every node an ignite time, so the graph lights up like a pipeline run.
 */
function schedule(data: AnalysisResult) {
  const indeg = new Map(data.nodes.map((n) => [n.id, 0]));
  const out = new Map<string, string[]>(data.nodes.map((n) => [n.id, []]));
  for (const e of data.edges) {
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    out.get(e.source)?.push(e.target);
  }
  let roots = data.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0 && (out.get(n.id)?.length ?? 0) > 0).map((n) => n.id);
  if (!roots.length && data.nodes.length) {
    roots = [[...data.nodes].sort((a, b) => (out.get(b.id)?.length ?? 0) - (out.get(a.id)?.length ?? 0))[0].id];
  }

  const level = new Map<string, number>();
  const queue = [...roots];
  roots.forEach((r) => level.set(r, 0));
  while (queue.length) {
    const id = queue.shift()!;
    for (const t of out.get(id) ?? []) {
      if (!level.has(t)) {
        level.set(t, level.get(id)! + 1);
        queue.push(t);
      }
    }
  }
  const maxLevel = Math.max(0, ...level.values());

  const edgeDelay = new Map<string, number>();
  const ignite = new Map<string, number>(roots.map((r) => [r, 0]));
  data.edges.forEach((e, i) => {
    const l = level.get(e.source) ?? maxLevel + 1;
    const d = l * STEP + (i % 4) * 70;
    edgeDelay.set(e.id, d);
    const arrive = d + DRAW;
    if (!ignite.has(e.target) || ignite.get(e.target)! > arrive) ignite.set(e.target, arrive);
  });
  // Isolated modules (e.g. config with no edges) light up at the end of the run.
  for (const n of data.nodes) if (!ignite.has(n.id)) ignite.set(n.id, (maxLevel + 1) * STEP + DRAW);
  const total = Math.max(0, ...ignite.values()) + 400;
  return { edgeDelay, ignite, roots, total };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/* ------------------------------------------------------------------ */
/* Node                                                                 */
/* ------------------------------------------------------------------ */

const ArchCard = memo(function ArchCard({ data }: NodeProps<CardNode>) {
  const { node, bugCount, dimmed, active, stepBadge, ignite, run } = data;
  const layer = LAYER_STYLE[node.layer];
  const Icon = LAYER_ICON[node.layer];
  return (
    <div className="relative transition-[opacity,filter] duration-300" style={{ width: NODE_W, height: NODE_H, opacity: dimmed ? 0.18 : 1, filter: dimmed ? "grayscale(1)" : undefined }}>
      <Handle type="target" position={Position.Left} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-white/30" />
      <Handle type="source" position={Position.Right} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-white/30" />

      {/* key={run} remounts the card so the ignite animation replays on every trace run */}
      <div key={run} className="node-ignite relative flex h-full items-center gap-3 rounded-xl border bg-[#0a0a0a] px-3" style={{ ["--ignite" as string]: `${ignite}ms` }}>
        <div
          className="tile-ignite grid size-11 shrink-0 place-items-center rounded-lg border"
          style={{ ["--ignite" as string]: `${ignite}ms`, borderColor: `${layer.color}40`, background: layer.bg }}
        >
          <Icon size={19} style={{ color: layer.color }} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-zinc-500">
            <span style={{ color: layer.color }}>{layer.label}</span>
            <span>·</span>
            <span className="tabular-nums">{node.fileCount} {node.fileCount === 1 ? "file" : "files"}</span>
          </div>
          <div className="mt-0.5 truncate text-[13.5px] font-semibold tracking-tight text-white">{node.label}</div>
          <div className="truncate font-mono text-[10.5px] text-zinc-500">{node.files[0] ?? "external"}</div>
        </div>
        <div className="absolute right-2 top-2 flex items-center gap-1">
          {stepBadge !== undefined && (
            <span className="grid size-5 place-items-center rounded-[4px] bg-white font-mono text-[10px] font-bold text-black">{stepBadge}</span>
          )}
          {bugCount > 0 && (
            <span className="flex items-center gap-1 rounded-[3px] bg-signal-500 px-1.5 py-[1px] font-mono text-[9.5px] font-bold uppercase text-black">
              <Bug size={10} strokeWidth={2.5} /> {bugCount}
            </span>
          )}
        </div>
      </div>

      {/* selection / tour glow lives on its own layer so it never fights the ignite animation */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl transition-shadow duration-300"
        style={{
          boxShadow: active ? "0 0 0 1.5px #ffffff, 0 0 30px 2px rgba(255,255,255,0.35), 0 0 70px 6px rgba(255,30,30,0.35)" : "none",
        }}
      />
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Edge: dim rail + red trace that draws in + spark + recurring pulses  */
/* ------------------------------------------------------------------ */

function Spark({ path, begin, dur, repeat, r, color }: { path: string; begin: number; dur: number; repeat?: boolean; r: number; color: string }) {
  const motion = useRef<SVGAnimateMotionElement>(null);
  const fade = useRef<SVGAnimateElement>(null);
  useEffect(() => {
    // SMIL clocks are document-relative; start explicitly so replays and late mounts line up.
    motion.current?.beginElementAt(begin / 1000);
    fade.current?.beginElementAt(begin / 1000);
  }, [begin]);
  return (
    <circle r={r} fill={color} opacity={0} style={{ filter: `drop-shadow(0 0 4px ${color}) drop-shadow(0 0 10px ${color})` }}>
      <animateMotion ref={motion} path={path} dur={`${dur}ms`} begin="indefinite" fill="freeze" repeatCount={repeat ? "indefinite" : 1} calcMode="spline" keyTimes="0;1" keySplines="0.5 0 0.3 1" />
      <animate ref={fade} attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.85;1" dur={`${dur}ms`} begin="indefinite" fill="freeze" repeatCount={repeat ? "indefinite" : 1} />
    </circle>
  );
}

function FlowEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<FlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14, offset: 22 });
  const d = data!;
  const color = d.grounded ? "#ff1e1e" : "#f5f5f5";
  const width = d.emphasized ? 2.4 : 1.6;
  return (
    <g style={{ opacity: d.dimmed ? 0.08 : 1, transition: "opacity 300ms" }}>
      <path d={path} fill="none" stroke="rgba(255,255,255,0.11)" strokeWidth={1.2} />
      <path
        key={d.run}
        id={id}
        d={path}
        pathLength={1}
        className={d.motion ? "edge-trace" : undefined}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeOpacity={d.grounded ? 1 : 0.75}
        style={{
          ["--delay" as string]: `${d.delay}ms`,
          ["--draw" as string]: `${DRAW}ms`,
          filter: `drop-shadow(0 0 ${d.emphasized ? 6 : 3}px ${d.grounded ? "rgba(255,30,30,0.9)" : "rgba(255,255,255,0.6)"})`,
        }}
      />
      {d.motion && !d.dimmed && (
        <g key={`s${d.run}`}>
          <Spark path={path} begin={d.delay} dur={DRAW} r={3.2} color="#ffffff" />
          <Spark path={path} begin={d.delay + DRAW + 300 + (d.delay % 900)} dur={2600} repeat r={1.9} color={color} />
        </g>
      )}
      {d.showLabel && !d.dimmed && (
        <EdgeLabelRenderer>
          <div
            className={`nodrag nopan pointer-events-none absolute rounded-[3px] border bg-black px-1.5 py-[1px] font-mono text-[9.5px] ${d.emphasized ? "border-signal-500/60 text-white" : "border-white/10 text-zinc-400"}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}

const nodeTypes = { arch: ArchCard };
const edgeTypes = { flow: FlowEdgeView };

/* ------------------------------------------------------------------ */
/* Canvas                                                               */
/* ------------------------------------------------------------------ */

export type Focus = { nodeId: string | null; nonce: number };

export default function GraphCanvas({
  data,
  highlight,
  activeNodeId,
  stepBadges,
  focus,
  onNodeClick,
  onPaneClick,
}: {
  data: AnalysisResult;
  /** Node ids to keep bright; everything else is dimmed. null = nothing dimmed. */
  highlight: Set<string> | null;
  activeNodeId: string | null;
  stepBadges?: Map<string, number>;
  focus: Focus;
  onNodeClick: (id: string) => void;
  onPaneClick: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const positions = useMemo(() => layout(data), [data]);
  const plan = useMemo(() => schedule(data), [data]);
  const [run, setRun] = useState(0);
  const [running, setRunning] = useState(true);
  const [ready, setReady] = useState(false); // set by onInit once React Flow can move the viewport

  useEffect(() => {
    setRunning(true);
    const t = setTimeout(() => setRunning(false), reduced ? 0 : plan.total);
    return () => clearTimeout(t);
  }, [run, plan.total, reduced]);

  const bugCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of data.bugs) m.set(b.nodeId, (m.get(b.nodeId) ?? 0) + 1);
    return m;
  }, [data]);

  const nodes: CardNode[] = useMemo(
    () =>
      data.nodes.map((n) => ({
        id: n.id,
        type: "arch",
        position: positions.get(n.id)!,
        data: {
          node: n,
          bugCount: bugCounts.get(n.id) ?? 0,
          dimmed: highlight ? !highlight.has(n.id) : false,
          active: n.id === activeNodeId,
          stepBadge: stepBadges?.get(n.id),
          ignite: reduced ? 0 : (plan.ignite.get(n.id) ?? 0),
          run,
        },
        width: NODE_W,
        height: NODE_H,
      })),
    [data, positions, bugCounts, highlight, activeNodeId, stepBadges, plan, run, reduced],
  );

  const edges: FlowEdge[] = useMemo(
    () =>
      data.edges.map((e) => {
        const touchesActive = !!activeNodeId && (e.source === activeNodeId || e.target === activeNodeId);
        const dimmed = highlight ? !(highlight.has(e.source) && highlight.has(e.target)) && !touchesActive : false;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "flow",
          data: {
            label: e.label,
            grounded: e.grounded,
            dimmed,
            emphasized: touchesActive,
            // Dense graphs get unreadable with every label on; show them only around the focused module.
            showLabel: touchesActive || (!activeNodeId && data.edges.length <= 14),
            delay: reduced ? 0 : (plan.edgeDelay.get(e.id) ?? 0),
            run,
            motion: !reduced,
          },
        };
      }),
    [data, highlight, activeNodeId, plan, run, reduced],
  );

  return (
    <div className="relative h-full w-full">
      <ReactFlow<CardNode, FlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, n) => onNodeClick(n.id)}
        onPaneClick={onPaneClick}
        onInit={() => setReady(true)}
        nodesConnectable={false}
        nodesDraggable
        elementsSelectable={false}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        forceColorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.1} color="rgba(255,255,255,0.07)" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => LAYER_STYLE[(n as CardNode).data.node.layer].color}
          nodeStrokeWidth={0}
          nodeBorderRadius={4}
          className="!bg-black max-md:!hidden"
        />
        <TracePanel
          running={running}
          nodes={data.nodes.length}
          links={data.edges.length}
          onReplay={() => setRun((r) => r + 1)}
        />
        <CameraController ready={ready} focus={focus} positions={positions} roots={plan.roots} run={run} duration={reduced ? 0 : Math.min(plan.total * 0.8, 4200)} />
      </ReactFlow>
      {/* CRT texture from the reference palette: faint scanlines + vignette, never interactive */}
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.022)_0px,rgba(255,255,255,0.022)_1px,transparent_1px,transparent_3px)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}

function TracePanel({ running, nodes, links, onReplay }: { running: boolean; nodes: number; links: number; onReplay: () => void }) {
  const rf = useReactFlow();
  const btn = "grid size-7 place-items-center text-zinc-400 transition hover:bg-white/10 hover:text-white";
  return (
    <Panel position="top-right" className="!m-3 flex items-center gap-2">
      <div className="hidden items-center gap-2 rounded-md border border-white/10 bg-black/80 px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-zinc-400 backdrop-blur sm:flex">
        <span className={`size-1.5 rounded-full ${running ? "animate-pulse bg-signal-500 shadow-[0_0_8px_#ff1e1e]" : "bg-white/40"}`} />
        {running ? "tracing" : "trace complete"} · {nodes} modules · {links} links
      </div>
      <button
        onClick={onReplay}
        className="flex items-center gap-1.5 rounded-md border border-signal-500/50 bg-signal-500/10 px-2.5 py-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-signal-300 transition hover:bg-signal-500 hover:text-black"
      >
        <Play size={11} strokeWidth={2.5} /> Run trace
      </button>
      <div className="flex overflow-hidden rounded-md border border-white/10 bg-black/80 backdrop-blur">
        <button className={btn} onClick={() => rf.zoomIn({ duration: 200 })} aria-label="Zoom in"><Plus size={13} /></button>
        <button className={btn} onClick={() => rf.zoomOut({ duration: 200 })} aria-label="Zoom out"><Minus size={13} /></button>
        <button className={btn} onClick={() => rf.fitView({ padding: 0.18, duration: 500 })} aria-label="Fit view"><Maximize size={12} /></button>
      </div>
    </Panel>
  );
}

/**
 * Viewport choreography: a slow fly-in from the entry module to the full graph on every trace run,
 * and smooth setCenter / fitView whenever `focus.nonce` changes (inspector, bug radar, tour).
 */
function CameraController({
  ready,
  focus,
  positions,
  roots,
  run,
  duration,
}: {
  ready: boolean;
  focus: Focus;
  positions: Map<string, { x: number; y: number }>;
  roots: string[];
  run: number;
  duration: number;
}) {
  const rf = useReactFlow();

  const flyIn = useCallback(() => {
    const root = roots[0] ? positions.get(roots[0]) : undefined;
    if (root && duration > 0) {
      void rf.setCenter(root.x + NODE_W / 2, root.y + NODE_H / 2, { zoom: 1.35 });
      setTimeout(() => void rf.fitView({ padding: 0.18, duration }), 60);
    } else {
      void rf.fitView({ padding: 0.18 });
    }
  }, [rf, roots, positions, duration]);

  useEffect(() => {
    if (ready) flyIn();
  }, [ready, run]);

  // Compare nonces instead of a "first run" flag: StrictMode re-runs effects in dev and would fire a stray fitView.
  const lastNonce = useRef(focus.nonce);
  useEffect(() => {
    if (focus.nonce === lastNonce.current) return;
    lastNonce.current = focus.nonce;
    if (focus.nodeId) {
      const p = positions.get(focus.nodeId);
      if (p) void rf.setCenter(p.x + NODE_W / 2, p.y + NODE_H / 2, { zoom: 1.15, duration: 750 });
    } else {
      void rf.fitView({ padding: 0.18, duration: 650 });
    }
  }, [focus.nonce]);
  return null;
}
