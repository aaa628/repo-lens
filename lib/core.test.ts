import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRepoUrl } from "./github";
import { parseImports } from "./parser";

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
