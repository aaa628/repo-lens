import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { parseRepoUrl } from "./github";
import { synthesizeWithGemini } from "./llm/gemini";
import { parseImports } from "./parser";
import { allowAnalysis, MAX_ANALYSES_PER_HOUR } from "./rateLimit";

test("parseRepoUrl accepts the forms people paste and rejects the rest", () => {
  const ok = { owner: "pmndrs", repo: "zustand" };
  for (const s of [
    "pmndrs/zustand",
    "https://github.com/pmndrs/zustand",
    "github.com/pmndrs/zustand/",
    "https://www.github.com/pmndrs/zustand.git",
    "https://github.com/pmndrs/zustand/tree/main/src",
    "  https://github.com/pmndrs/zustand?tab=readme  ",
  ])
    assert.deepEqual(parseRepoUrl(s), ok, s);
  for (const s of ["", "zustand", "https://gitlab.com/pmndrs/zustand", "https://github.com/pmndrs", "a/b/c"])
    assert.equal(parseRepoUrl(s), null, s);
});

test("parseImports resolves relative, alias and TS-ESM imports against the full tree", () => {
  const tree = ["src/index.ts", "src/store.ts", "src/utils/index.ts", "src/styles.css", "src/unfetched.ts"];
  const graph = parseImports(
    [
      {
        path: "src/index.ts",
        content: `import { a } from "./store.js";\nimport u from "@/utils";\nimport "./styles.css";\nimport "./unfetched";\nimport React from "react";\n// import "./ignored";`,
        size: 0,
        truncated: false,
      },
    ],
    tree,
  );
  // .js → .ts, "@/" alias found under src/, the stylesheet skipped, the unfetched file still linked
  assert.deepEqual(
    graph.edges.map((e) => e.to),
    ["src/store.ts", "src/utils/index.ts", "src/unfetched.ts"],
  );
  assert.deepEqual(graph.externalPackages, [{ name: "react", count: 1 }]);
});

test("allowAnalysis caps each visitor per rolling hour", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < MAX_ANALYSES_PER_HOUR; i++) assert.equal(allowAnalysis("1.2.3.4", t0 + i), true);
  assert.equal(allowAnalysis("1.2.3.4", t0 + 10), false, "over the cap");
  assert.equal(allowAnalysis("5.6.7.8", t0 + 10), true, "other visitors unaffected");
  assert.equal(allowAnalysis("1.2.3.4", t0 + 60 * 60 * 1000 + 1), true, "allowed again after an hour");
});

test("Gemini adapter sends a clean JSON Schema and validates the reply", async (t) => {
  process.env.GEMINI_API_KEY = "test-key";
  const analysis = JSON.parse(readFileSync("demos-src/zustand.json", "utf8"));
  let sent: { url: string; init: RequestInit } | undefined;
  const reply = (status: number, body: unknown) => async (url: string | URL | Request, init?: RequestInit) => {
    sent = { url: String(url), init: init! };
    return new Response(JSON.stringify(body), { status });
  };
  t.mock.method(globalThis, "fetch", reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] }, finishReason: "STOP" }], modelVersion: "gemini-test" }));

  const out = await synthesizeWithGemini({ system: "sys", user: "usr" }, () => {});
  assert.equal(out.model, "gemini-test");
  assert.equal(out.analysis.nodes.length, analysis.nodes.length);
  assert.match(sent!.url, /\/models\/gemini-flash-latest:generateContent$/);
  assert.equal((sent!.init.headers as Record<string, string>)["x-goog-api-key"], "test-key");
  const { generationConfig } = JSON.parse(String(sent!.init.body));
  assert.equal(generationConfig.responseMimeType, "application/json");
  assert.equal(generationConfig.responseJsonSchema.$schema, undefined);
  assert.ok(generationConfig.responseJsonSchema.properties.nodes);

  t.mock.method(globalThis, "fetch", reply(200, { candidates: [{ content: { parts: [{ text: '{"nodes": []}' }] } }] }));
  await assert.rejects(synthesizeWithGemini({ system: "", user: "" }, () => {}), /didn't match the analysis schema/);
  t.mock.method(globalThis, "fetch", reply(429, { error: { message: "quota" } }));
  await assert.rejects(synthesizeWithGemini({ system: "", user: "" }, () => {}), /rate limit or quota/);
});
