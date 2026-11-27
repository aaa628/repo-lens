/**
 * Stage 2 — static dependency grounding.
 *
 * A deliberately lightweight, regex-based import/export extractor. It resolves internal imports
 * against the *full* repo tree (not just the fetched files), so edges to files we didn't download
 * still count. The resulting graph is passed to the LLM as ground truth and later used to verify
 * the LLM's architecture edges.
 */
import type { FetchedFile } from "./github";

export type ParsedFile = {
  path: string;
  language: string;
  bytes: number;
  lines: number;
  truncated: boolean;
  /** Resolved repo-relative paths of internal imports. */
  imports: string[];
  /** Bare package specifiers (npm packages, Python modules, Go modules, crates…). */
  external: string[];
  exports: string[];
};

export type ImportEdge = { from: string; to: string };

export type ImportGraph = {
  files: ParsedFile[];
  edges: ImportEdge[];
  /** External packages ranked by how many fetched files import them. */
  externalPackages: { name: string; count: number }[];
};

const LANG_BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "tsx", mts: "typescript", cts: "typescript", js: "javascript", jsx: "jsx",
  mjs: "javascript", cjs: "javascript", py: "python", go: "go", rs: "rust", java: "java", kt: "kotlin",
  kts: "kotlin", scala: "scala", rb: "ruby", php: "php", cs: "csharp", swift: "swift", vue: "vue",
  svelte: "svelte", astro: "astro", json: "json", md: "markdown", mdx: "mdx", yml: "yaml", yaml: "yaml",
  toml: "toml", css: "css", scss: "scss", html: "html", sql: "sql", prisma: "prisma", graphql: "graphql",
  gql: "graphql", sh: "bash", bash: "bash", dockerfile: "docker", ex: "elixir", exs: "elixir", dart: "dart",
  c: "c", h: "c", cc: "cpp", cpp: "cpp", hpp: "cpp", lua: "lua", zig: "zig", proto: "proto", txt: "text",
};

export function languageOf(path: string): string {
  const base = path.split("/").pop() ?? "";
  if (/^dockerfile/i.test(base)) return "docker";
  if (/^makefile$/i.test(base)) return "makefile";
  const i = base.lastIndexOf(".");
  return i > 0 ? (LANG_BY_EXT[base.slice(i + 1).toLowerCase()] ?? "text") : "text";
}

/* ------------------------------------------------------------------ */
/* Path helpers                                                         */
/* ------------------------------------------------------------------ */

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

function normalize(p: string): string {
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

function join(a: string, b: string): string {
  return normalize(a ? `${a}/${b}` : b);
}

const ASSET_RE = /\.(css|scss|sass|less|styl|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|mp4|mp3|wav|txt|html)$/i;

const JS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".vue", ".svelte", ".astro", ".json"];

function resolveJsPath(base: string, paths: Set<string>): string | null {
  if (paths.has(base)) return base;
  // TS ESM convention: `import "./foo.js"` refers to foo.ts
  const stripped = base.replace(/\.(m|c)?js$/, "");
  for (const e of JS_EXTS) if (paths.has(stripped + e)) return stripped + e;
  for (const e of JS_EXTS) if (paths.has(`${base}/index${e}`)) return `${base}/index${e}`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Per-language extractors                                              */
/* ------------------------------------------------------------------ */

type Extracted = { specs: string[]; exports: string[] };

function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function extractJs(src: string): Extracted {
  const code = stripJsComments(src);
  const specs = new Set<string>();
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) specs.add(m[1]);

  const exports = new Set<string>();
  for (const m of code.matchAll(
    /\bexport\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)/g,
  ))
    exports.add(m[1]);
  if (/\bexport\s+default\b/.test(code) && exports.size === 0) exports.add("default");
  for (const m of code.matchAll(/\bmodule\.exports\s*=\s*([A-Za-z_$][\w$]*)/g)) exports.add(m[1]);
  for (const m of code.matchAll(/\bexports\.([A-Za-z_$][\w$]*)\s*=/g)) exports.add(m[1]);
  return { specs: [...specs], exports: [...exports] };
}

function extractPython(src: string): Extracted {
  const specs = new Set<string>();
  for (const m of src.matchAll(/^\s*from\s+(\.*[\w.]*)\s+import\s+\(?([\w\s,*]+)\)?/gm)) {
    const mod = m[1];
    const names = m[2].split(",").map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    specs.add(mod);
    // `from pkg import sub` may import a submodule; record candidates with a marker
    for (const n of names) if (n !== "*") specs.add(`${mod}${mod.endsWith(".") ? "" : "."}${n}?`);
  }
  for (const m of src.matchAll(/^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm)) {
    for (const mod of m[1].split(",")) specs.add(mod.trim());
  }
  const exports = new Set<string>();
  for (const m of src.matchAll(/^(?:async\s+)?def\s+([A-Za-z]\w*)|^class\s+([A-Za-z]\w*)/gm)) exports.add(m[1] ?? m[2]);
  return { specs: [...specs], exports: [...exports] };
}

function extractGo(src: string): Extracted {
  const specs = new Set<string>();
  for (const m of src.matchAll(/^\s*import\s+(?:\w+\s+)?"([^"]+)"/gm)) specs.add(m[1]);
  for (const block of src.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)) {
    for (const m of block[1].matchAll(/(?:^|\s)(?:[\w.]+\s+)?"([^"]+)"/g)) specs.add(m[1]);
  }
  const exports = new Set<string>();
  for (const m of src.matchAll(/^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)|^type\s+([A-Z]\w*)/gm)) exports.add(m[1] ?? m[2]);
  return { specs: [...specs], exports: [...exports] };
}

function extractRust(src: string): Extracted {
  const specs = new Set<string>();
  for (const m of src.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/gm)) specs.add(`mod:${m[1]}`);
  for (const m of src.matchAll(/^\s*(?:pub\s+)?use\s+crate::(\w+)/gm)) specs.add(`crate:${m[1]}`);
  for (const m of src.matchAll(/^\s*(?:pub\s+)?use\s+([a-z_]\w*)::/gm)) if (!["crate", "self", "super", "std", "core", "alloc"].includes(m[1])) specs.add(m[1]);
  const exports = new Set<string>();
  for (const m of src.matchAll(/^pub\s+(?:async\s+)?(?:fn|struct|enum|trait|type|const)\s+(\w+)/gm)) exports.add(m[1]);
  return { specs: [...specs], exports: [...exports] };
}

function extractJvm(src: string): Extracted {
  const specs = new Set<string>();
  for (const m of src.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+)(?:\.\*)?\s*;?/gm)) specs.add(m[1]);
  const exports = new Set<string>();
  for (const m of src.matchAll(/^\s*(?:public\s+)?(?:abstract\s+|final\s+|data\s+|sealed\s+|open\s+)*(?:class|interface|object|enum)\s+(\w+)/gm)) exports.add(m[1]);
  return { specs: [...specs], exports: [...exports] };
}

function extractRuby(src: string): Extracted {
  const specs = new Set<string>();
  for (const m of src.matchAll(/^\s*require_relative\s+["']([^"']+)["']/gm)) specs.add(`./${m[1]}`);
  for (const m of src.matchAll(/^\s*require\s+["']([^"']+)["']/gm)) specs.add(m[1]);
  const exports = new Set<string>();
  for (const m of src.matchAll(/^\s*(?:class|module)\s+([A-Z][\w:]*)/gm)) exports.add(m[1]);
  return { specs: [...specs], exports: [...exports] };
}

/* ------------------------------------------------------------------ */
/* Resolution                                                           */
/* ------------------------------------------------------------------ */

type Ctx = {
  paths: Set<string>;
  allPaths: string[];
  goModule: string | null;
  pyRoots: string[];
  jvmIndex: Map<string, string>;
};

function resolveSpec(file: string, lang: string, spec: string, ctx: Ctx): { internal?: string; external?: string } {
  const { paths } = ctx;
  const dir = dirname(file);

  if (["typescript", "tsx", "javascript", "jsx", "vue", "svelte", "astro"].includes(lang)) {
    if (spec.startsWith(".")) {
      const r = resolveJsPath(join(dir, spec), paths);
      return r ? { internal: r } : {};
    }
    if (/^[@~#]\//.test(spec)) {
      for (const root of ["", "src", "app"]) {
        const r = resolveJsPath(join(root, spec.slice(2)), paths);
        if (r) return { internal: r };
      }
      return {};
    }
    if (spec.startsWith("/")) return {};
    // A bare specifier with a path segment may be a baseUrl import like "components/Button".
    // Single-segment names like "react" are always packages — never match them to src/react.ts.
    if (spec.includes("/") && !spec.startsWith("@")) {
      const r = resolveJsPath(normalize(spec), paths);
      if (r) return { internal: r };
    }
    const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    return { external: pkg };
  }

  if (lang === "python") {
    const maybeSub = spec.endsWith("?");
    const s = maybeSub ? spec.slice(0, -1) : spec;
    let modPath: string;
    let roots: string[];
    if (s.startsWith(".")) {
      const dots = s.match(/^\.+/)![0].length;
      let base = dir;
      for (let i = 1; i < dots; i++) base = dirname(base);
      modPath = join(base, s.slice(dots).replace(/\./g, "/"));
      roots = [""];
    } else {
      modPath = s.replace(/\./g, "/");
      roots = ctx.pyRoots;
    }
    for (const root of roots) {
      const b = join(root, modPath);
      if (paths.has(`${b}.py`)) return { internal: `${b}.py` };
      if (paths.has(`${b}/__init__.py`)) return { internal: `${b}/__init__.py` };
    }
    if (maybeSub || s.startsWith(".")) return {};
    return { external: s.split(".")[0] };
  }

  if (lang === "go") {
    if (ctx.goModule && (spec === ctx.goModule || spec.startsWith(ctx.goModule + "/"))) {
      const target = spec.slice(ctx.goModule.length + 1);
      const inDir = ctx.allPaths.filter((p) => dirname(p) === target && p.endsWith(".go") && !p.endsWith("_test.go"));
      return inDir.length ? { internal: inDir.sort((a, b) => a.length - b.length)[0] } : {};
    }
    return spec.includes(".") ? { external: spec.split("/").slice(0, 3).join("/") } : {};
  }

  if (lang === "rust") {
    if (spec.startsWith("mod:")) {
      const name = spec.slice(4);
      const base = file.split("/").pop()!;
      const modDir = /^(lib|main|mod)\.rs$/.test(base) ? dir : join(dir, base.replace(/\.rs$/, ""));
      for (const c of [join(modDir, `${name}.rs`), join(modDir, `${name}/mod.rs`)]) if (paths.has(c)) return { internal: c };
      return {};
    }
    if (spec.startsWith("crate:")) {
      const name = spec.slice(6);
      const srcRoot = file.includes("src/") ? file.slice(0, file.indexOf("src/") + 3) : "src";
      for (const c of [join(srcRoot, `${name}.rs`), join(srcRoot, `${name}/mod.rs`)]) if (paths.has(c)) return { internal: c };
      return {};
    }
    return { external: spec };
  }

  if (lang === "java" || lang === "kotlin" || lang === "scala") {
    const hit = ctx.jvmIndex.get(spec);
    if (hit) return { internal: hit };
    return { external: spec.split(".").slice(0, 2).join(".") };
  }

  if (lang === "ruby") {
    if (spec.startsWith("./")) {
      const b = join(dir, spec);
      const c = b.endsWith(".rb") ? b : `${b}.rb`;
      return paths.has(c) ? { internal: c } : {};
    }
    for (const root of ["lib", "", "app"]) {
      const c = join(root, `${spec}.rb`);
      if (paths.has(c)) return { internal: c };
    }
    return { external: spec.split("/")[0] };
  }

  return {};
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

export function parseImports(files: FetchedFile[], allPaths: string[]): ImportGraph {
  const paths = new Set(allPaths);

  const goMod = files.find((f) => f.path === "go.mod")?.content.match(/^module\s+(\S+)/m)?.[1] ?? null;

  // Python import roots: repo root, src/, and any directory that directly contains a top-level package
  const pyRoots = new Set<string>(["", "src"]);
  for (const p of allPaths) {
    if (p.endsWith("/__init__.py")) {
      const pkgDir = dirname(p);
      const parent = dirname(pkgDir);
      if (!paths.has(`${parent ? parent + "/" : ""}__init__.py`)) pyRoots.add(parent);
    }
  }

  const jvmIndex = new Map<string, string>();
  for (const p of allPaths) {
    const m = p.match(/(?:^|\/)(?:java|kotlin|scala)\/(.+)\.(java|kt|scala)$/);
    if (m) jvmIndex.set(m[1].replace(/\//g, "."), p);
  }

  const ctx: Ctx = { paths, allPaths, goModule: goMod, pyRoots: [...pyRoots], jvmIndex };
  const externalCounts = new Map<string, number>();
  const edges: ImportEdge[] = [];
  const seen = new Set<string>();

  const parsed: ParsedFile[] = files.map((f) => {
    const language = languageOf(f.path);
    let ex: Extracted = { specs: [], exports: [] };
    if (["typescript", "tsx", "javascript", "jsx", "vue", "svelte", "astro"].includes(language)) ex = extractJs(f.content);
    else if (language === "python") ex = extractPython(f.content);
    else if (language === "go") ex = extractGo(f.content);
    else if (language === "rust") ex = extractRust(f.content);
    else if (["java", "kotlin", "scala"].includes(language)) ex = extractJvm(f.content);
    else if (language === "ruby") ex = extractRuby(f.content);

    const imports = new Set<string>();
    const external = new Set<string>();
    for (const spec of ex.specs) {
      const r = resolveSpec(f.path, language, spec, ctx);
      if (r.internal) {
        // stylesheets and images aren't architecture
        if (r.internal !== f.path && !ASSET_RE.test(r.internal)) imports.add(r.internal);
      } else if (r.external) external.add(r.external);
    }
    for (const to of imports) {
      const key = `${f.path}→${to}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ from: f.path, to });
      }
    }
    for (const e of external) externalCounts.set(e, (externalCounts.get(e) ?? 0) + 1);

    return {
      path: f.path,
      language,
      bytes: f.size,
      lines: f.content.split("\n").length,
      truncated: f.truncated,
      imports: [...imports],
      external: [...external],
      exports: ex.exports.slice(0, 12),
    };
  });

  return {
    files: parsed,
    edges,
    externalPackages: [...externalCounts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 40),
  };
}
