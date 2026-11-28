# RepoLens

Paste a public GitHub repo URL and get:

1. **Architecture map**: an auto-laid-out React Flow graph of the repo's modules, with edges checked against real imports.
2. **Bug radar**: findings ranked by severity, each with an exact `file:line`, the real source lines around it, and a suggested fix.
3. **Guided tour**: a 5–7 step walkthrough for new contributors that pans the canvas to each module.

The pipeline is built so the LLM's output is checked against the repository, not taken at face value.

## Quick start

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY (and ideally GITHUB_TOKEN)
npm run dev                  # http://localhost:3000
```

The three **Instant Demo** pills work with no API key.

### Pages

| Path | What it is |
|---|---|
| `/` | Landing page: analyze form, demos, product overview (static; ships no graph code) |
| `/how-it-works` | The pipeline, how to read results, limits, what data goes where |
| `/analyze?repo=owner/name` | Runs a live analysis, then opens the workspace |
| `/analyze?demo=<slug>` | Opens a precomputed demo |

Old links (`/?demo=…`, `/?repo=…`) redirect to `/analyze`.

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `anthropic`, `openai` or `gemini` |
| `ANTHROPIC_API_KEY` | – | Required when the provider is `anthropic` |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Model for Stage 3 |
| `ANTHROPIC_EFFORT` | `medium` | `low` … `max`; higher effort is slower but more thorough |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | – / `gpt-5` | Used when `LLM_PROVIDER=openai` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | – / `gemini-flash-latest` | Used when `LLM_PROVIDER=gemini` |
| `GITHUB_TOKEN` | – | Raises the GitHub limit from 60 to 5,000 req/h. Each analysis makes 2 API calls (raw file downloads don't count against it). |
| `URL` | – | Public site URL for the social preview image. Netlify sets it; Vercel needs nothing. |

## How the pipeline works (`POST /api/analyze`, streamed as SSE)

```
Stage 1  lib/github.ts    repo meta + recursive tree → noise filter → signal scoring → top ~28 files (≤150 KB)
Stage 2  lib/parser.ts    regex import/export extraction (TS/JS, Python, Go, Rust, JVM, Ruby), resolved against the full tree
Stage 3  lib/analyzer.ts  outline + import graph + line-numbered sources → LLM → Zod-validated JSON
Ground   lib/analyzer.ts  drop unknown paths, mark import-verified edges, add missed import edges,
                          verify bug line numbers, replace snippets with the real lines from the file
```

- **File selection** scores manifests, READMEs, entry points, API routes, data-layer files and core `src/` code. It then makes two passes: first the best file from each area of the codebase (`lib/`, `prisma/`, `app/api`, …), then the remaining budget by score. Per-directory and per-area caps keep one big folder (or `examples/`) from crowding out the data layer.
- **Structured output**: Anthropic uses `client.beta.messages.stream` with `betaZodOutputFormat(LlmAnalysisSchema)`, so the response is validated against the schema in `lib/types.ts`. Server-side refusal fallbacks are on (`fallbacks: "default"`). OpenAI uses `responses.parse` with `zodTextFormat`. Gemini is called with plain `fetch` on its native `generateContent` API, passing `z.toJSONSchema(LlmAnalysisSchema)` as `responseJsonSchema` and validating the reply with zod. Optional fields are `.nullable()` so one schema satisfies every provider's strict mode.
- **Grounding** is shown in the UI. Import-verified edges are drawn in red with a ✓ in the inspector; inferred runtime edges are drawn in white. Every bug's code context comes from the fetched file, not from the model. Findings that cite files outside the repo are dropped.
- An in-memory cache returns repeat analyses of the same repo (per server instance, 1 h, at most 200 repos) instantly.
- In production each visitor (by IP) can start 5 live analyses an hour (`lib/rateLimit.ts`); cached results and demos don't count. The count is per server instance, so treat it as a speed bump, not a hard cap.

## Instant demos

`public/demos/*.json` hold analyses of `pmndrs/zustand`, `expressjs/express` and `shadcn-ui/taxonomy`.

**How they were made:** no LLM key was available while building, so the Stage 3 JSON in `demos-src/` was written by hand from the exact files the pipeline fetched. Stages 1–2 and the grounding pass ran live against GitHub: edge verification, line checks and code snippets are all real. Each demo says this in the inspector footer. To regenerate a demo with the model:

```bash
npm run demos -- https://github.com/pmndrs/zustand zustand            # full pipeline, needs a key
npm run demos -- <url> <slug> --analysis demos-src/<slug>.json        # re-ground a stored analysis
npm run ingest -- <url> --prompt prompt.txt                           # inspect Stages 1-2 / the prompt, no LLM
```

## Deploying

Works on Vercel or Netlify as a standard Next.js app. `/api/analyze` sets `maxDuration = 300`: Stage 3 takes about 30–120 s depending on repo size and effort. Plans that cap functions lower (e.g. Vercel Hobby without Fluid compute) can time out on large repos; lower `ANTHROPIC_EFFORT` to `low` there, or use a Flash model with `LLM_PROVIDER=gemini`.

## Project layout

```
app/page.tsx               landing page (server component; the form is a plain GET form, no page JS)
app/how-it-works/          docs page
app/analyze/page.tsx       reads ?repo= / ?demo= and renders the RepoLens client app
app/api/analyze/route.ts   SSE endpoint (progress → result | error)
lib/github.ts              Stage 1: ingestion, pruning, scoring
lib/parser.ts              Stage 2: static import graph
lib/analyzer.ts            Stage 3 prompt + grounding + full pipeline
lib/llm/                   provider adapters (anthropic.ts, openai.ts, gemini.ts)
lib/rateLimit.ts           per-visitor limit on live analyses
lib/export.ts              Markdown report + Mermaid diagram export
components/                Site (header, footer, demo links), AnalyzeForm, RepoLens (loading/error/workspace),
                           Workspace, GraphCanvas (React Flow + dagre), Inspector, CodeBlock (Shiki)
scripts/                   ingest.ts, generate-demos.ts
```
