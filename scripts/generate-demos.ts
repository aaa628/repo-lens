/**
 * Builds an Instant Demo JSON into public/demos/<slug>.json.
 *
 *   # full pipeline (needs an LLM key):
 *   npm run demos -- https://github.com/pmndrs/zustand zustand
 *
 *   # reuse a stored Stage-3 JSON (LlmAnalysis shape); Stages 1-2 and grounding still run live:
 *   npm run demos -- https://github.com/pmndrs/zustand zustand --analysis demos-src/zustand.json --note "..."
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { analyzeRepo, groundAnalysis, ingestRepo } from "../lib/analyzer";
import { LlmAnalysisSchema } from "../lib/types";

const args = process.argv.slice(2);
const [url, slug] = args;
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!url || !slug) {
  console.error("usage: npm run demos -- <github-url> <slug> [--analysis file.json] [--note text]");
  process.exit(1);
}

const log = (p: { stage: string; message: string; detail?: string }) =>
  console.error(`[${p.stage}] ${p.message}${p.detail ? ` — ${p.detail}` : ""}`);

const analysisPath = flag("--analysis");
let result;
if (analysisPath) {
  const llm = LlmAnalysisSchema.parse(JSON.parse(readFileSync(analysisPath, "utf8")));
  const ctx = await ingestRepo(url, log);
  result = groundAnalysis(ctx, llm, {
    provider: "curated",
    model: flag("--model") ?? "stored analysis",
    analyzedAt: new Date().toISOString(),
    note: flag("--note"),
  });
} else {
  result = await analyzeRepo(url, log);
}

mkdirSync("public/demos", { recursive: true });
writeFileSync(`public/demos/${slug}.json`, JSON.stringify(result, null, 1));


console.error(
  `\nWrote public/demos/${slug}.json — ${result.nodes.length} nodes, ${result.edges.length} edges ` +
    `(${result.stats.groundedEdges} import-verified), ${result.bugs.length} bugs ` +
    `(${result.bugs.filter((b) => b.verified).length} line-verified), ${result.walkthrough.length} tour steps`,
);
for (const n of result.nodes) console.error(`  node ${n.id.padEnd(22)} files=${n.files.length} owned=${n.fileCount}${n.keySnippet ? ` snippet@${n.keySnippet.startLine ?? "UNLOCATED"}` : ""}`);
for (const e of result.edges) console.error(`  edge ${e.source} -> ${e.target} [${e.label}] ${e.grounded ? `✓${e.importCount}` : "inferred"}`);
for (const b of result.bugs) console.error(`  bug  ${b.severity.padEnd(6)} ${b.file}:${b.lineHint} ${b.verified ? "✓" : "UNVERIFIED"}`);
