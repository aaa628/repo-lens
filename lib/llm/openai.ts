import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { LlmAnalysisSchema, type LlmAnalysis } from "../types";
import type { SynthesisInput, SynthesisProgress } from "./index";

export const OPENAI_DEFAULT_MODEL = "gpt-5";

export async function synthesizeWithOpenAI(
  input: SynthesisInput,
  onProgress: SynthesisProgress,
  signal?: AbortSignal,
): Promise<{ analysis: LlmAnalysis; model: string }> {
  const client = new OpenAI();
  const model = process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;
  onProgress(`Waiting for ${model}…`);

  let response;
  try {
    response = await client.responses.parse(
      {
        model,
        input: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        text: { format: zodTextFormat(LlmAnalysisSchema, "repo_analysis") },
      },
      { signal },
    );
  } catch (err) {
    if (err instanceof OpenAI.AuthenticationError) throw new Error("OpenAI API key is invalid (OPENAI_API_KEY).");
    if (err instanceof OpenAI.RateLimitError) throw new Error("OpenAI rate limit hit — wait a moment and retry.");
    if (err instanceof OpenAI.APIError) throw new Error(`OpenAI API error ${err.status ?? ""}: ${err.message}`);
    throw err;
  }

  if (!response.output_parsed) throw new Error("The model returned output that didn't match the analysis schema.");
  return { analysis: response.output_parsed, model: response.model };
}
