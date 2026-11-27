import { z } from "zod";

export const LAYERS = ["frontend", "api", "logic", "data", "config"] as const;
export type Layer = (typeof LAYERS)[number];

export const SEVERITIES = ["high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

/* ------------------------------------------------------------------ */
/* Schema the LLM must return (Stage 3).                               */
/* Optional fields are `.nullable()` rather than `.optional()` so the  */
/* same schema works with both Anthropic and OpenAI strict JSON modes. */
/* ------------------------------------------------------------------ */

export const LlmNodeSchema = z.object({
  id: z.string().describe("Unique kebab-case id, e.g. 'auth-api'"),
  label: z.string().describe("Short module name shown on the card"),
  layer: z.enum(LAYERS),
  summary: z.string().describe("1-3 sentences: what this module is responsible for"),
  files: z
    .array(z.string())
    .describe("Repo-relative paths (files or directories) exactly as they appear in the outline"),
  keySnippet: z
    .object({
      file: z.string(),
      code: z.string().describe("3-15 lines copied verbatim from the provided file content, without line numbers"),
      language: z.string(),
    })
    .nullable(),
});

export const LlmEdgeSchema = z.object({
  id: z.string(),
  source: z.string().describe("Node id of the dependent (the caller / importer)"),
  target: z.string().describe("Node id of the dependency (the callee / imported module)"),
  label: z.string().describe("2-4 words, e.g. 'REST fetch', 'reads/writes', 'imports state'"),
  animated: z.boolean().nullable(),
});

export const LlmBugSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  severity: z.enum(SEVERITIES),
  title: z.string(),
  file: z.string(),
  lineHint: z.string().describe("Line number or range from the numbered listing, e.g. '42' or '42-47'"),
  description: z.string(),
  suggestedFix: z.string(),
});

export const LlmWalkthroughSchema = z.object({
  step: z.number().int(),
  nodeId: z.string(),
  title: z.string(),
  explanation: z.string(),
  whatToReadFirst: z.string().describe("A concrete file path (optionally with a symbol) to open first"),
});

export const LlmAnalysisSchema = z.object({
  summary: z.string().describe("2-4 sentence plain-English overview of what the repo does and how it is structured"),
  techStack: z.array(z.string()),
  nodes: z.array(LlmNodeSchema),
  edges: z.array(LlmEdgeSchema),
  bugs: z.array(LlmBugSchema),
  walkthrough: z.array(LlmWalkthroughSchema),
});

export type LlmAnalysis = z.infer<typeof LlmAnalysisSchema>;

/* ------------------------------------------------------------------ */
/* Final, grounded result sent to the client.                          */
/* ------------------------------------------------------------------ */

export type RepoMeta = {
  owner: string;
  name: string;
  description: string;
  stars: number;
  primaryLanguage: string;
  techStack: string[];
  htmlUrl: string;
  defaultBranch: string;
};

export type ArchNode = {
  id: string;
  label: string;
  layer: Layer;
  summary: string;
  files: string[];
  /** Number of files in the repo tree owned by this node (via exact path or directory prefix). */
  fileCount: number;
  keySnippet?: { file: string; code: string; language: string; startLine?: number };
};

export type ArchEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  animated?: boolean;
  /** True when the static import parser found at least one import between the two modules. */
  grounded: boolean;
  importCount: number;
};

export type Bug = {
  id: string;
  nodeId: string;
  severity: Severity;
  title: string;
  file: string;
  lineHint: string;
  description: string;
  suggestedFix: string;
  /** First cited line, when it could be parsed and lies inside the fetched file. */
  line?: number;
  /** True when the file was fetched and the cited line exists in it. */
  verified: boolean;
  /** Real source lines around the cited line, taken from the fetched file. */
  context?: { startLine: number; code: string; language: string };
};

export type WalkthroughStep = {
  step: number;
  nodeId: string;
  title: string;
  explanation: string;
  whatToReadFirst: string;
};

export type AnalysisResult = {
  repoMeta: RepoMeta;
  summary: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  bugs: Bug[];
  walkthrough: WalkthroughStep[];
  stats: {
    totalFiles: number;
    analyzedFiles: number;
    analyzedBytes: number;
    importEdges: number;
    groundedEdges: number;
  };
  generatedBy: {
    provider: string;
    model: string;
    analyzedAt: string;
    note?: string;
  };
};

/* ------------------------------------------------------------------ */
/* Streaming progress protocol (SSE).                                   */
/* ------------------------------------------------------------------ */

export const STAGES = [
  { id: "fetch", label: "Fetching repo tree" },
  { id: "parse", label: "Parsing imports" },
  { id: "synthesize", label: "Synthesizing architecture" },
  { id: "ground", label: "Grounding & validating" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export type ProgressEvent = {
  stage: StageId;
  status: "active" | "done";
  message: string;
  detail?: string;
};
