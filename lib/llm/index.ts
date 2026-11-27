import type { LlmAnalysis } from "../types";

export type SynthesisInput = { system: string; user: string };
export type SynthesisProgress = (detail: string) => void;

export type Provider = "anthropic" | "openai";

export function activeProvider(): Provider {
  return process.env.LLM_PROVIDER?.toLowerCase() === "openai" ? "openai" : "anthropic";
}

/** Returns an error message when the selected provider has no credentials configured. */
export function missingCredentials(): string | null {
  const p = activeProvider();
  if (p === "openai" && !process.env.OPENAI_API_KEY) return "OPENAI_API_KEY is not set (LLM_PROVIDER=openai).";
  if (p === "anthropic" && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return "ANTHROPIC_API_KEY is not set. Add it to .env.local (or set LLM_PROVIDER=openai with OPENAI_API_KEY).";
  }
  return null;
}

export async function synthesize(
  input: SynthesisInput,
  onProgress: SynthesisProgress,
  signal?: AbortSignal,
): Promise<{ analysis: LlmAnalysis; model: string; provider: Provider }> {
  const provider = activeProvider();
  if (provider === "openai") {
    const { synthesizeWithOpenAI } = await import("./openai");
    return { ...(await synthesizeWithOpenAI(input, onProgress, signal)), provider };
  }
  const { synthesizeWithAnthropic } = await import("./anthropic");
  return { ...(await synthesizeWithAnthropic(input, onProgress, signal)), provider };
}
