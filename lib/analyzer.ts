/**
 * Stage 3 — structured AI synthesis, plus the post-hoc grounding pass that checks the model's
 * output against the real repository (tree paths, import graph, line numbers).
 */
import {
  buildOutline,
  fetchContents,
  fetchRepoInfo,
  fetchTree,
  GitHubError,
  parseRepoUrl,
  selectFiles,
  type FetchedFile,
  type RepoInfo,
  type TreeEntry,
} from "./github";
import { languageOf, parseImports, type ImportGraph } from "./parser";
import { synthesize } from "./llm";
import type { AnalysisResult, ArchEdge, ArchNode, Bug, LlmAnalysis, ProgressEvent, WalkthroughStep } from "./types";

export type Progress = (e: ProgressEvent) => void;

export type IngestContext = {
  info: RepoInfo;
  entries: TreeEntry[];
  treeTruncated: boolean;
  files: FetchedFile[];
  graph: ImportGraph;
  outline: string;
};

/* ------------------------------------------------------------------ */
/* Stages 1 + 2                                                         */
/* ------------------------------------------------------------------ */

export async function ingestRepo(url: string, progress: Progress, signal?: AbortSignal): Promise<IngestContext> {
  const ref = parseRepoUrl(url);
  if (!ref) throw new GitHubError("That doesn't look like a GitHub repo URL. Use https://github.com/owner/repo", 400);

  progress({ stage: "fetch", status: "active", message: "Fetching repo metadata…", detail: `${ref.owner}/${ref.repo}` });
  const info = await fetchRepoInfo(ref, signal);

  progress({ stage: "fetch", status: "active", message: "Fetching repo tree…", detail: `branch ${info.defaultBranch}` });
  const { entries, truncated } = await fetchTree(ref, info.defaultBranch, signal);
  if (entries.length === 0) throw new GitHubError("This repository is empty.", 422);

  const selected = selectFiles(entries);
  progress({
    stage: "fetch",
    status: "active",
    message: `Downloading ${selected.length} high-signal files…`,
    detail: `${entries.length.toLocaleString()} files in tree`,
  });
  const files = await fetchContents({ owner: info.owner, repo: info.name }, info.defaultBranch, selected, signal);
  if (files.length === 0) throw new GitHubError("Couldn't download any source files from this repository.", 422);
  const bytes = files.reduce((s, f) => s + f.content.length, 0);
  progress({
    stage: "fetch",
    status: "done",
    message: `Fetched ${files.length} files`,
    detail: `${(bytes / 1024).toFixed(0)} KB of source`,
  });

  progress({ stage: "parse", status: "active", message: "Parsing imports…" });
  const graph = parseImports(files, entries.map((e) => e.path));
  progress({
    stage: "parse",
    status: "done",
    message: `Found ${graph.edges.length} internal import edges`,
    detail: graph.externalPackages.slice(0, 5).map((p) => p.name).join(", ") || undefined,
  });

  return { info, entries, treeTruncated: truncated, files, graph, outline: buildOutline(entries) };
}

/* ------------------------------------------------------------------ */
/* Prompt                                                               */
/* ------------------------------------------------------------------ */

export const SYSTEM_PROMPT = `You are RepoLens, a staff engineer who onboards new contributors to unfamiliar codebases. You receive a pruned view of a public GitHub repository: metadata, a directory outline, an import graph extracted by a static parser (treat it as ground truth), and the contents of the highest-signal files with line numbers. From these you produce an architecture map, a bug radar, and a guided tour, as JSON matching the provided schema.

Architecture nodes — 5 to 12 cohesive modules. A node groups related files (a file can be its own node only when it is central). Layers:
- frontend: UI, components, pages, views, CLI presentation
- api: HTTP routes, handlers, controllers, RPC, the public API surface of a library
- logic: core domain logic, services, algorithms, shared utilities
- data: persistence, DB schemas/models/ORM, state stores, caches, clients for external data
- config: build, tooling, environment, deployment, package manifests
List files using paths exactly as they appear in the outline (directories allowed). Use kebab-case ids.

Edges point from the dependent to its dependency (source uses target). Prefer edges the import graph supports. Add a non-import edge only when the code shows a runtime relationship (HTTP call, DB read/write, event, config read), and label it with what flows (2-4 words). Set animated to true for runtime data flow, false for plain imports.

Bugs — only issues you can point to in the provided file contents, with the exact file path and the line number(s) from the numbered listing. Real defects (unhandled errors, races, injection, missing validation, resource leaks, wrong logic) are high or medium; code smells are low. Do not cite files you were not shown or lines beyond a truncated file's end. Returning few or zero bugs is fine when the code is clean; quality beats quantity (at most ~8). Write descriptions and fixes concretely, referencing identifiers from the code.

Walkthrough — 5 to 7 steps that take a newcomer from orientation (README/manifest) to the entry point, the core logic, the data layer, and finally a concrete good first contribution grounded in something you saw (for example a low-severity finding or a missing guard). Every step's nodeId must be one of your node ids. whatToReadFirst names a real file path, optionally with a symbol.

keySnippet — 3 to 15 consecutive lines copied verbatim from a provided file (without the line-number prefix) that best show what the node does; null when no provided file fits.`;

function numbered(content: string): string {
  const lines = content.split("\n");
  const w = String(lines.length).length;
  return lines.map((l, i) => `${String(i + 1).padStart(w, " ")}| ${l}`).join("\n");
}

export function buildUserPrompt(ctx: IngestContext): string {
  const { info, graph, files } = ctx;
  const byFile = new Map<string, string[]>();
  for (const e of graph.edges) byFile.set(e.from, [...(byFile.get(e.from) ?? []), e.to]);

  const importLines = [...byFile].map(([from, tos]) => `${from} -> ${tos.join(", ")}`).join("\n");
  const exportLines = graph.files
    .filter((f) => f.exports.length)
    .map((f) => `${f.path}: ${f.exports.join(", ")}`)
    .join("\n");

  const fileBlocks = files
    .map((f) => {
      const attrs = `path="${f.path}" lines="${f.content.split("\n").length}"${f.truncated ? ` truncated="true" original_bytes="${f.size}"` : ""}`;
      return `<file ${attrs}>\n${numbered(f.content)}\n</file>`;
    })
    .join("\n\n");

  return `<repo>
name: ${info.owner}/${info.name}
description: ${info.description || "(none)"}
primary language: ${info.primaryLanguage}
stars: ${info.stars}
topics: ${info.topics.join(", ") || "(none)"}
default branch: ${info.defaultBranch}
total files in tree: ${ctx.entries.length}${ctx.treeTruncated ? " (GitHub truncated the tree listing)" : ""}
</repo>

<directory_outline>
${ctx.outline}
</directory_outline>

<import_graph note="static parse of the fetched files; 'a -> b' means a imports b">
${importLines || "(no internal imports detected)"}
</import_graph>

<exports>
${exportLines || "(none detected)"}
</exports>

<external_packages note="package: number of fetched files importing it">
${graph.externalPackages.map((p) => `${p.name}: ${p.count}`).join("\n") || "(none detected)"}
</external_packages>

<files note="${files.length} of ${ctx.entries.length} files; each line is prefixed with its line number">
${fileBlocks}
</files>

Analyze this repository and return the architecture map, bug radar and guided tour.`;
}

/* ------------------------------------------------------------------ */
/* Grounding                                                            */
/* ------------------------------------------------------------------ */

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "node"
  );
}

function normPath(p: string): string {
  return p.trim().replace(/^\.?\//, "").replace(/\/+$/, "");
}

/** Find where an LLM-quoted snippet lives in the real file, so we can show real lines + numbers. */
function locateSnippet(content: string, code: string): { startLine: number; code: string } | null {
  const fileLines = content.split("\n");
  const snipLines = code.split("\n").map((l) => l.replace(/^\s*\d+\|\s?/, "")); // tolerate copied line numbers
  const firstIdx = snipLines.findIndex((l) => l.trim().length > 0);
  if (firstIdx === -1) return null;
  const meaningful = snipLines.slice(firstIdx).filter((l) => l.trim());
  for (let i = 0; i < fileLines.length; i++) {
    if (fileLines[i].trim() !== meaningful[0].trim()) continue;
    // verify the next few meaningful lines appear in order
    let j = i;
    let ok = true;
    for (const want of meaningful.slice(1, 4)) {
      j++;
      while (j < fileLines.length && !fileLines[j].trim()) j++;
      if (j >= fileLines.length || fileLines[j].trim() !== want.trim()) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const length = Math.min(Math.max(snipLines.length - firstIdx, 3), 18);
    return { startLine: i + 1, code: fileLines.slice(i, i + length).join("\n").replace(/\s+$/, "") };
  }
  return null;
}

export function groundAnalysis(
  ctx: IngestContext,
  llm: LlmAnalysis,
  generatedBy: AnalysisResult["generatedBy"],
): AnalysisResult {
  const allPaths = ctx.entries.map((e) => e.path);
  const pathSet = new Set(allPaths);
  const contents = new Map(ctx.files.map((f) => [f.path, f.content]));

  const resolveFile = (p: string): string | null => {
    const n = normPath(p);
    if (pathSet.has(n)) return n;
    if (allPaths.some((a) => a.startsWith(n + "/"))) return n; // directory reference
    const suffix = allPaths.filter((a) => a.endsWith("/" + n));
    return suffix.length === 1 ? suffix[0] : null;
  };

  /* ---- nodes ---- */
  const idMap = new Map<string, string>();
  const nodes: ArchNode[] = [];
  for (const n of llm.nodes) {
    let id = slug(n.id || n.label);
    while (nodes.some((x) => x.id === id)) id += "-2";
    idMap.set(n.id, id);
    const files = [...new Set(n.files.map(resolveFile).filter((f): f is string => !!f))];
    let keySnippet: ArchNode["keySnippet"];
    if (n.keySnippet?.code?.trim()) {
      const file = resolveFile(n.keySnippet.file) ?? n.keySnippet.file;
      const real = contents.has(file) ? locateSnippet(contents.get(file)!, n.keySnippet.code) : null;
      keySnippet = real
        ? { file, code: real.code, language: languageOf(file), startLine: real.startLine }
        : { file, code: n.keySnippet.code, language: n.keySnippet.language || languageOf(file) };
    }
    nodes.push({ id, label: n.label, layer: n.layer, summary: n.summary, files, fileCount: 0, keySnippet });
  }
  const nodeIds = new Set(nodes.map((n) => n.id));
  const mapId = (id: string) => idMap.get(id) ?? (nodeIds.has(slug(id)) ? slug(id) : null);

  /* ---- file ownership: exact file match wins, else the longest directory prefix ---- */
  const exactOwner = new Map<string, string>();
  const dirOwners: { dir: string; id: string }[] = [];
  for (const n of nodes) {
    for (const f of n.files) {
      if (pathSet.has(f)) exactOwner.set(f, n.id);
      else dirOwners.push({ dir: f + "/", id: n.id });
    }
  }
  dirOwners.sort((a, b) => b.dir.length - a.dir.length);
  const ownerOf = (path: string): string | null =>
    exactOwner.get(path) ?? dirOwners.find((d) => path.startsWith(d.dir))?.id ?? null;

  const counts = new Map<string, number>();
  for (const p of allPaths) {
    const o = ownerOf(p);
    if (o) counts.set(o, (counts.get(o) ?? 0) + 1);
  }
  for (const n of nodes) n.fileCount = counts.get(n.id) ?? n.files.length;

  /* ---- edges: verify against the static import graph ---- */
  const importPairs = new Map<string, number>();
  for (const e of ctx.graph.edges) {
    const a = ownerOf(e.from);
    const b = ownerOf(e.to);
    if (a && b && a !== b) importPairs.set(`${a}|${b}`, (importPairs.get(`${a}|${b}`) ?? 0) + 1);
  }

  const edges: ArchEdge[] = [];
  const pairSeen = new Set<string>();
  for (const e of llm.edges) {
    const s = mapId(e.source);
    const t = mapId(e.target);
    if (!s || !t || s === t || pairSeen.has(`${s}|${t}`)) continue;
    pairSeen.add(`${s}|${t}`);
    const fwd = importPairs.get(`${s}|${t}`) ?? 0;
    const rev = importPairs.get(`${t}|${s}`) ?? 0;
    edges.push({
      id: `e-${s}-${t}`,
      source: s,
      target: t,
      label: e.label,
      animated: e.animated ?? true,
      grounded: fwd + rev > 0,
      importCount: fwd + rev,
    });
  }
  // Add import relationships the model missed.
  for (const [pair, count] of importPairs) {
    const [s, t] = pair.split("|");
    if (pairSeen.has(pair) || pairSeen.has(`${t}|${s}`)) continue;
    pairSeen.add(pair);
    edges.push({ id: `e-${s}-${t}`, source: s, target: t, label: "imports", animated: false, grounded: true, importCount: count });
  }

  /* ---- bugs: must cite a real file; verify the line exists ---- */
  const bugs: Bug[] = [];
  for (const b of llm.bugs) {
    const file = resolveFile(b.file);
    if (!file || !pathSet.has(file)) continue; // ungrounded: drop
    const nodeId = mapId(b.nodeId) ?? ownerOf(file);
    if (!nodeId) continue;
    const content = contents.get(file);
    const lineNum = Number(b.lineHint.match(/\d+/)?.[0] ?? NaN);
    const fileLines = content?.split("\n") ?? [];
    const verified = !!content && Number.isFinite(lineNum) && lineNum >= 1 && lineNum <= fileLines.length;
    let context: Bug["context"];
    if (verified) {
      const start = Math.max(1, lineNum - 3);
      const end = Math.min(fileLines.length, lineNum + 5);
      context = { startLine: start, code: fileLines.slice(start - 1, end).join("\n"), language: languageOf(file) };
    }
    let bugId = slug(b.id || b.title);
    while (bugs.some((x) => x.id === bugId)) bugId += "-2";
    bugs.push({
      id: bugId,
      nodeId,
      severity: b.severity,
      title: b.title,
      file,
      lineHint: b.lineHint,
      description: b.description,
      suggestedFix: b.suggestedFix,
      line: verified ? lineNum : undefined,
      verified,
      context,
    });
  }
  const rank = { high: 0, medium: 1, low: 2 } as const;
  bugs.sort((a, b) => rank[a.severity] - rank[b.severity]);

  /* ---- walkthrough ---- */
  const walkthrough: WalkthroughStep[] = llm.walkthrough
    .map((w) => ({ ...w, nodeId: mapId(w.nodeId) ?? "" }))
    .filter((w) => w.nodeId)
    .sort((a, b) => a.step - b.step)
    .slice(0, 7)
    .map((w, i) => ({ ...w, step: i + 1 }));

  return {
    repoMeta: {
      owner: ctx.info.owner,
      name: ctx.info.name,
      description: ctx.info.description,
      stars: ctx.info.stars,
      primaryLanguage: ctx.info.primaryLanguage,
      techStack: llm.techStack.slice(0, 12),
      htmlUrl: ctx.info.htmlUrl,
      defaultBranch: ctx.info.defaultBranch,
    },
    summary: llm.summary,
    nodes,
    edges,
    bugs,
    walkthrough,
    stats: {
      totalFiles: ctx.entries.length,
      analyzedFiles: ctx.files.length,
      analyzedBytes: ctx.files.reduce((s, f) => s + f.content.length, 0),
      importEdges: ctx.graph.edges.length,
      groundedEdges: edges.filter((e) => e.grounded).length,
    },
    generatedBy,
  };
}

/* ------------------------------------------------------------------ */
/* Full pipeline                                                        */
/* ------------------------------------------------------------------ */

export async function analyzeRepo(url: string, progress: Progress, signal?: AbortSignal): Promise<AnalysisResult> {
  const ctx = await ingestRepo(url, progress, signal);

  progress({ stage: "synthesize", status: "active", message: "Synthesizing architecture…", detail: "Sending context to the model" });
  const { analysis, model, provider } = await synthesize(
    { system: SYSTEM_PROMPT, user: buildUserPrompt(ctx) },
    (detail) => progress({ stage: "synthesize", status: "active", message: "Synthesizing architecture…", detail }),
    signal,
  );
  progress({
    stage: "synthesize",
    status: "done",
    message: `Model proposed ${analysis.nodes.length} modules`,
    detail: `${analysis.bugs.length} findings · ${analysis.walkthrough.length} tour steps`,
  });

  progress({ stage: "ground", status: "active", message: "Verifying edges and line references…" });
  const result = groundAnalysis(ctx, analysis, { provider, model, analyzedAt: new Date().toISOString() });
  progress({
    stage: "ground",
    status: "done",
    message: `${result.stats.groundedEdges}/${result.edges.length} edges import-verified`,
    detail: `${result.bugs.filter((b) => b.verified).length}/${result.bugs.length} findings line-verified`,
  });
  return result;
}
