import { z } from "zod";
import { LlmAnalysisSchema, type LlmAnalysis } from "../types";
import type { SynthesisInput, SynthesisProgress } from "./index";

// Alias for the newest stable Flash model: fast enough for serverless time limits, and has a free tier.
export const GEMINI_DEFAULT_MODEL = "gemini-flash-latest";

const { $schema: _, ...schema } = z.toJSONSchema(LlmAnalysisSchema);

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
  error?: { message?: string };
};

/** Gemini's native generateContent API with JSON-Schema structured output; plain fetch, no SDK. */
export async function synthesizeWithGemini(
  input: SynthesisInput,
  onProgress: SynthesisProgress,
  signal?: AbortSignal,
): Promise<{ analysis: LlmAnalysis; model: string }> {
  const model = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
  onProgress(`Waiting for ${model}…`);

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: "user", parts: [{ text: input.user }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema },
    }),
    signal,
  });
  const body = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (res.status === 429) throw new Error("Gemini rate limit or quota hit. Wait a minute and retry.");
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${body.error?.message ?? res.statusText}`);

  const candidate = body.candidates?.[0];
  if (body.promptFeedback?.blockReason || /SAFETY|PROHIBITED|BLOCKLIST|RECITATION/.test(candidate?.finishReason ?? "")) {
    throw new Error("The model declined to analyze this repository.");
  }
  if (candidate?.finishReason === "MAX_TOKENS") throw new Error("The analysis was cut off (max tokens). Try a smaller repository.");

  const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  const parsed = LlmAnalysisSchema.safeParse(json);
  if (!parsed.success) throw new Error("The model returned output that didn't match the analysis schema.");
  return { analysis: parsed.data, model: body.modelVersion ?? model };
}
