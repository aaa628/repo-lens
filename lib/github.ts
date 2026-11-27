/**
 * Stage 1 — GitHub ingestion & smart pruning.
 *
 * Fetches repo metadata + the full recursive tree, filters out noise, scores every remaining
 * file by how much architectural signal it is likely to carry, and downloads the top files
 * concurrently under a total byte budget.
 */

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export type RepoRef = { owner: string; repo: string };

export type TreeEntry = { path: string; size: number };

export type RepoInfo = {
  owner: string;
  name: string;
  description: string;
  stars: number;
  primaryLanguage: string;
  topics: string[];
  htmlUrl: string;
  defaultBranch: string;
};

export type FetchedFile = {
  path: string;
  content: string;
  /** Size of the original file in bytes (before any truncation). */
  size: number;
  truncated: boolean;
};

const MAX_FILES = 28;
const MAX_TOTAL_BYTES = 150_000;
const MAX_FILE_BYTES = 24_000;
const MAX_PER_DIR = 6;
const MAX_PER_AREA = 8;
const MAX_PER_TOP = 13;
const MAX_PER_LOW_VALUE_AREA = 3;
const FETCH_CONCURRENCY = 8;

/* ------------------------------------------------------------------ */
/* URL parsing                                                          */
/* ------------------------------------------------------------------ */

export function parseRepoUrl(input: string): RepoRef | null {
  const s = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  // owner/repo shorthand
  const short = s.match(/^([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)$/);
  if (short) return { owner: short[1], repo: short[2] };
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)(?:[/?#].*)?$/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

/* ------------------------------------------------------------------ */
/* REST helpers                                                         */
/* ------------------------------------------------------------------ */

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "RepoLens",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function gh<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, { headers: headers(), signal, cache: "no-store" });
  if (res.ok) return (await res.json()) as T;

  if (res.status === 404) {
    throw new GitHubError("Repository not found. Check the URL — private repos aren't supported.", 404);
  }
  if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
    const mins = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60_000)) : null;
    throw new GitHubError(
      `GitHub API rate limit reached${mins ? ` (resets in ~${mins} min)` : ""}. ` +
        (process.env.GITHUB_TOKEN ? "" : "Set GITHUB_TOKEN to raise the limit to 5,000 requests/hour."),
      429,
    );
  }
  let detail = "";
  try {
    detail = ((await res.json()) as { message?: string }).message ?? "";
  } catch {}
  throw new GitHubError(`GitHub API error ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
}

export async function fetchRepoInfo({ owner, repo }: RepoRef, signal?: AbortSignal): Promise<RepoInfo> {
  const r = await gh<{
    name: string;
    owner: { login: string };
    description: string | null;
    stargazers_count: number;
    language: string | null;
    topics?: string[];
    html_url: string;
    default_branch: string;
    private: boolean;
  }>(`/repos/${owner}/${repo}`, signal);
  return {
    owner: r.owner.login,
    name: r.name,
    description: r.description ?? "",
    stars: r.stargazers_count,
    primaryLanguage: r.language ?? "Unknown",
    topics: r.topics ?? [],
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch,
  };
}

export async function fetchTree(
  { owner, repo }: RepoRef,
  branch: string,
  signal?: AbortSignal,
): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
  const t = await gh<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    signal,
  );
  return {
    entries: t.tree.filter((e) => e.type === "blob").map((e) => ({ path: e.path, size: e.size ?? 0 })),
    truncated: t.truncated,
  };
}

/* ------------------------------------------------------------------ */
/* Noise filtering                                                      */
/* ------------------------------------------------------------------ */

const NOISE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", ".output", "coverage",
  "vendor", "__pycache__", ".venv", "venv", "env", "target", "bin", "obj", ".idea", ".vscode", ".turbo",
  ".cache", ".parcel-cache", "__snapshots__", ".yarn", ".pnpm-store", "bower_components", ".gradle",
  ".husky", ".changeset", "storybook-static", ".docusaurus", "site-packages", ".mypy_cache", ".pytest_cache",
  ".tox", "Pods", "DerivedData",
]);

const LOCKFILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock", "Cargo.lock", "poetry.lock",
  "Gemfile.lock", "composer.lock", "go.sum", "uv.lock", "Pipfile.lock", "flake.lock", "mix.lock", "pubspec.lock",
  "npm-shrinkwrap.json", ".DS_Store", "Thumbs.db",
]);

const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "avif", "bmp", "tiff", "psd", "woff", "woff2", "ttf",
  "eot", "otf", "mp4", "mp3", "wav", "webm", "mov", "ogg", "flac", "zip", "gz", "tgz", "tar", "rar", "7z",
  "exe", "dll", "so", "dylib", "wasm", "pdf", "jar", "class", "pyc", "pyo", "o", "a", "lib", "bin", "dat",
  "db", "sqlite", "sqlite3", "parquet", "pkl", "npy", "onnx", "pt", "h5", "keras", "ckpt", "safetensors",
  "lockb", "snap", "map", "ipynb",
]);

const TEST_RE = /(^|\/)(__tests__|__mocks__|tests?|spec|e2e|cypress|playwright|testdata|fixtures?)(\/|$)|\.(test|spec|e2e)\.[a-z]+$|_test\.go$|(^|\/)test_[^/]+\.py$|_spec\.rb$/i;

function ext(path: string): string {
  const base = path.split("/").pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}

export function isNoise(path: string, size: number): boolean {
  const parts = path.split("/");
  const base = parts[parts.length - 1];
  if (parts.slice(0, -1).some((p) => NOISE_DIRS.has(p))) return true;
  if (LOCKFILES.has(base)) return true;
  if (BINARY_EXT.has(ext(path))) return true;
  if (/\.min\.(js|css)$/.test(base) || /\.(bundle|chunk)\.js$/.test(base)) return true;
  if (size > 250_000) return true; // almost certainly generated
  return false;
}

export function isTest(path: string): boolean {
  return TEST_RE.test(path);
}

/* ------------------------------------------------------------------ */
/* Signal scoring                                                       */
/* ------------------------------------------------------------------ */

const SOURCE_EXT = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts", "py", "go", "rs", "java", "kt", "kts", "scala", "rb",
  "php", "cs", "swift", "vue", "svelte", "astro", "ex", "exs", "dart", "c", "cc", "cpp", "h", "hpp", "lua",
  "zig", "sql", "prisma", "graphql", "gql", "proto",
]);

const ROOT_MANIFESTS = new Set([
  "package.json", "pyproject.toml", "setup.py", "setup.cfg", "requirements.txt", "go.mod", "Cargo.toml",
  "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json", "mix.exs", "pubspec.yaml",
  "deno.json", "Pipfile",
]);

const ENTRY_NAMES = /^(index|main|app|server|cli|__main__|__init__|mod|lib|manage|wsgi|asgi|program|bootstrap|entry|root|layout|page|route|router|routes)\.[a-z]+$/i;
const API_RE = /(^|\/)(api|routes?|controllers?|handlers?|endpoints?|resolvers?|rpc|trpc|graphql|middlewares?)(\/|$)|(^|\/)(route|views|urls|router)\.[a-z]+$/i;
const DATA_RE = /(^|\/)(models?|db|database|prisma|schema|schemas|store|stores|repositor(y|ies)|entities|dal|orm|queries|state|redux|slices)(\/|$)|schema\.prisma$|\.(sql|prisma)$/i;
const DATA_FILE_RE = /^(db|database|prisma|schema|models?|store|storage|repository|queries|cache|redis|supabase|firebase|drizzle)\.[a-z]+$/i;
const CORE_RE = /^(src|lib|app|pkg|internal|cmd|core|server|packages\/[^/]+\/src)\//;
const CONFIG_RE = /(^|\/)(next|vite|nuxt|svelte|astro|webpack|rollup|tsup|turbo|tailwind|remix|drizzle)\.config\.[a-z]+$|(^|\/)(Dockerfile|docker-compose\.ya?ml|\.env\.example|vercel\.json|netlify\.toml|tsconfig\.json|Makefile)$/;
const LOW_VALUE_RE = /(^|\/)(examples?|docs?|scripts|benchmarks?|bench|demo|samples?|website|\.github|stories|storybook|i18n|locales?|translations?|migrations?)(\/|$)/i;

export function scoreFile(path: string, size: number): number {
  const parts = path.split("/");
  const base = parts[parts.length - 1];
  const depth = parts.length - 1;
  const e = ext(path);
  let score = 0;

  if (depth === 0 && ROOT_MANIFESTS.has(base)) score += 100;
  else if (ROOT_MANIFESTS.has(base)) score += 45; // nested manifests matter in monorepos
  if (depth === 0 && /^readme(\.md|\.rst|\.txt)?$/i.test(base)) score += 90;

  if (SOURCE_EXT.has(e)) score += 20;
  else if (["md", "json", "yaml", "yml", "toml"].includes(e)) score += 4;
  else score -= 5;

  if (ENTRY_NAMES.test(base)) score += depth <= 2 ? 45 : 28;
  if (API_RE.test(path)) score += 32;
  if (DATA_RE.test(path) || DATA_FILE_RE.test(base)) score += 28;
  if (/^middleware\.[jt]s$/.test(base) && depth <= 1) score += 30;
  if (CORE_RE.test(path)) score += 18;
  if (CONFIG_RE.test(path)) score += 22;
  if (LOW_VALUE_RE.test(path)) score -= 30;
  if (base.endsWith(".d.ts")) score -= 25;
  if (/\.(stories|story)\.[a-z]+$/.test(base)) score -= 30;
  if (/^(CHANGELOG|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY|LICENSE|HISTORY)/i.test(base)) score -= 40;

  score -= Math.max(0, depth - 2) * 4;
  if (size < 150) score -= 18;
  else if (size < 400) score -= 8;
  if (size > 60_000) score -= 12;

  return score;
}

export function selectFiles(entries: TreeEntry[]): TreeEntry[] {
  const candidates = entries.filter((e) => !isNoise(e.path, e.size));
  const nonTest = candidates.filter((e) => !isTest(e.path));
  // Only fall back to tests when the repo has almost no other source.
  const pool = nonTest.length >= 8 ? nonTest : candidates;

  const ranked = pool
    .map((e) => ({ ...e, score: scoreFile(e.path, e.size) }))
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length);

  const chosen: TreeEntry[] = [];
  const taken = new Set<string>();
  const perDir = new Map<string, number>();
  const perArea = new Map<string, number>();
  const perTop = new Map<string, number>();
  let bytes = 0;

  const tryTake = (f: (typeof ranked)[number]): boolean => {
    if (chosen.length >= MAX_FILES || taken.has(f.path)) return false;
    const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
    const area = areaOf(f.path);
    const areaCap = LOW_VALUE_RE.test(f.path) ? MAX_PER_LOW_VALUE_AREA : MAX_PER_AREA;
    const top = f.path.includes("/") ? f.path.split("/")[0] : "<root>";
    if ((perDir.get(dir) ?? 0) >= MAX_PER_DIR || (perArea.get(area) ?? 0) >= areaCap) return false;
    if ((perTop.get(top) ?? 0) >= MAX_PER_TOP) return false;
    const cost = Math.min(f.size, MAX_FILE_BYTES);
    if (bytes + cost > MAX_TOTAL_BYTES) return false;
    chosen.push({ path: f.path, size: f.size });
    taken.add(f.path);
    perDir.set(dir, (perDir.get(dir) ?? 0) + 1);
    perArea.set(area, (perArea.get(area) ?? 0) + 1);
    perTop.set(top, (perTop.get(top) ?? 0) + 1);
    bytes += cost;
    return true;
  };

  // Pass 1 — coverage: the best file from each distinct area (lib/, prisma/, app/api, …) so no
  // single folder crowds out the data layer or config.
  const bestPerArea = new Map<string, (typeof ranked)[number]>();
  for (const f of ranked) if (!bestPerArea.has(areaOf(f.path))) bestPerArea.set(areaOf(f.path), f);
  for (const f of [...bestPerArea.values()].filter((f) => f.score > 10).slice(0, 14)) tryTake(f);

  // Pass 2 — fill the remaining budget by score.
  for (const f of ranked) {
    if (chosen.length >= MAX_FILES) break;
    if (f.score > 0) tryTake(f);
  }
  return chosen;
}

const AREA_ROOTS = new Set(["src", "app", "lib", "packages", "apps", "pkg", "internal", "cmd", "server", "client", "source"]);

/** Coarse "area" of the codebase a file belongs to: top-level dir, or second level under src/app/lib/... */
function areaOf(path: string): string {
  const parts = path.split("/");
  if (parts.length === 1) return "<root>";
  if (AREA_ROOTS.has(parts[0]) && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

/* ------------------------------------------------------------------ */
/* Content fetching                                                     */
/* ------------------------------------------------------------------ */

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function fetchContents(
  { owner, repo }: RepoRef,
  branch: string,
  files: TreeEntry[],
  signal?: AbortSignal,
): Promise<FetchedFile[]> {
  const results = await mapLimit(files, FETCH_CONCURRENCY, async (f): Promise<FetchedFile | null> => {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${f.path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    try {
      const res = await fetch(url, {
        signal,
        cache: "no-store",
        headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : undefined,
      });
      if (!res.ok) return null;
      let content = await res.text();
      if (content.includes("\u0000")) return null; // binary that slipped through
      let truncated = false;
      if (content.length > MAX_FILE_BYTES) {
        const cut = content.lastIndexOf("\n", MAX_FILE_BYTES);
        content = content.slice(0, cut > 0 ? cut : MAX_FILE_BYTES);
        truncated = true;
      }
      return { path: f.path, content, size: f.size, truncated };
    } catch (err) {
      if (signal?.aborted) throw err;
      return null;
    }
  });
  return results.filter((r): r is FetchedFile => r !== null);
}

/* ------------------------------------------------------------------ */
/* Pruned directory outline for the prompt                              */
/* ------------------------------------------------------------------ */

export function buildOutline(entries: TreeEntry[], maxLines = 320): string {
  const paths = entries.filter((e) => !isNoise(e.path, e.size)).map((e) => e.path).sort();
  if (paths.length <= maxLines) return paths.join("\n");

  // Too many files: list directories with file counts, plus the files of shallow directories.
  const dirCounts = new Map<string, number>();
  for (const p of paths) {
    const parts = p.split("/");
    for (let d = 1; d < parts.length; d++) {
      const dir = parts.slice(0, d).join("/");
      dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
    }
  }
  const lines: string[] = [];
  for (const p of paths) {
    if (p.split("/").length <= 2) lines.push(p);
  }
  for (const [dir, n] of [...dirCounts].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (dir.split("/").length <= 3) lines.push(`${dir}/  (${n} files)`);
  }
  return lines.sort().slice(0, maxLines).join("\n") + (lines.length > maxLines ? `\n… (${lines.length - maxLines} more entries)` : "");
}
