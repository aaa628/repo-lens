import type { Layer, Severity } from "./types";

/**
 * Black / white / red palette. Layers are told apart by a tint *and* an icon (see GraphCanvas),
 * because a three-colour palette can't carry five categories on hue alone.
 */
export const LAYER_STYLE: Record<Layer, { label: string; color: string; bg: string }> = {
  frontend: { label: "Frontend", color: "#f5f5f5", bg: "rgba(255,255,255,0.08)" },
  api: { label: "API", color: "#ff1e1e", bg: "rgba(255,30,30,0.12)" },
  logic: { label: "Logic", color: "#b5b5b5", bg: "rgba(181,181,181,0.08)" },
  data: { label: "Data", color: "#ff7070", bg: "rgba(255,112,112,0.10)" },
  config: { label: "Config", color: "#6f6f6f", bg: "rgba(111,111,111,0.10)" },
};

export const SEVERITY_STYLE: Record<Severity, { label: string; color: string; bg: string }> = {
  high: { label: "High", color: "#ff1e1e", bg: "rgba(255,30,30,0.16)" },
  medium: { label: "Medium", color: "#ff8a8a", bg: "rgba(255,138,138,0.10)" },
  low: { label: "Low", color: "#bdbdbd", bg: "rgba(189,189,189,0.08)" },
};

export function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

export function blobUrl(htmlUrl: string, branch: string, file: string, line?: number) {
  return `${htmlUrl}/blob/${branch}/${file}${line ? `#L${line}` : ""}`;
}
