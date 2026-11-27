/**
 * Runs Stages 1-2 only (GitHub ingestion + import parsing) and prints what Stage 3 would receive.
 * Useful for tuning file selection without spending LLM tokens.
 *
 *   npm run ingest -- https://github.com/owner/repo [--prompt out.txt]
 */
import { writeFileSync } from "node:fs";
import { buildUserPrompt, ingestRepo } from "../lib/analyzer";

const [url, flag, out] = process.argv.slice(2);
if (!url) {
  console.error("usage: npm run ingest -- <github-url> [--prompt out.txt]");
  process.exit(1);
}

const ctx = await ingestRepo(url, (p) => console.error(`[${p.stage}] ${p.message}${p.detail ? ` — ${p.detail}` : ""}`));

console.log(`\nSelected files (${ctx.files.length}):`);
for (const f of ctx.files) {
  const parsed = ctx.graph.files.find((g) => g.path === f.path)!;
  console.log(
    `  ${f.path.padEnd(60)} ${String(f.content.length).padStart(6)}B  imports:${parsed.imports.length}${f.truncated ? "  [truncated]" : ""}`,
  );
}
console.log(`\nImport edges (${ctx.graph.edges.length}):`);
for (const e of ctx.graph.edges) console.log(`  ${e.from} -> ${e.to}`);
console.log(`\nExternal: ${ctx.graph.externalPackages.map((p) => `${p.name}(${p.count})`).join(", ")}`);

if (flag === "--prompt" && out) {
  const prompt = buildUserPrompt(ctx);
  writeFileSync(out, prompt);
  console.log(`\nWrote Stage 3 prompt to ${out} (${(prompt.length / 1024).toFixed(0)} KB, ~${Math.round(prompt.length / 4).toLocaleString()} tokens)`);
}
