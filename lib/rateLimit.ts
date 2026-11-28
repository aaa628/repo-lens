// shortcut: counts live in this server instance's memory, so on serverless each instance keeps its own
// count and a determined visitor can get more. Move to a shared store (e.g. Upstash Redis) if that matters.
export const MAX_ANALYSES_PER_HOUR = 5;
const HOUR = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

/** Records one analysis for `visitor`; false once they've started MAX_ANALYSES_PER_HOUR in the last hour. */
export function allowAnalysis(visitor: string, now = Date.now()): boolean {
  const recent = (hits.get(visitor) ?? []).filter((t) => now - t < HOUR);
  if (recent.length >= MAX_ANALYSES_PER_HOUR) return false;
  if (hits.size > 10_000) hits.clear(); // bound memory; forgetting old visitors only makes the limit looser
  hits.set(visitor, [...recent, now]);
  return true;
}
