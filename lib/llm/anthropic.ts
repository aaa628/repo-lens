import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { LlmAnalysisSchema, type LlmAnalysis } from "../types";
import type { SynthesisInput, SynthesisProgress } from "./index";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";

export async function synthesizeWithAnthropic(
  input: SynthesisInput,
  onProgress: SynthesisProgress,
  signal?: AbortSignal,
): Promise<{ analysis: LlmAnalysis; model: string }> {
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL;
  const effort = (process.env.ANTHROPIC_EFFORT as Effort | undefined) || "medium";

  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: 32000,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
      output_config: { effort, format: betaZodOutputFormat(LlmAnalysisSchema) },
      // If a safety classifier declines, the API re-runs the request on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { signal },
  );

  let chars = 0;
  let lastEmit = 0;
  let announcedThinking = false;
  stream.on("streamEvent", (event) => {
    if (event.type === "content_block_start" && event.content_block.type === "thinking" && !announcedThinking) {
      announcedThinking = true;
      onProgress("Reasoning about module boundaries…");
    }
  });
  stream.on("text", (delta) => {
    chars += delta.length;
    const now = Date.now();
    if (now - lastEmit > 700) {
      lastEmit = now;
      onProgress(`Writing structured analysis… ~${Math.round(chars / 4).toLocaleString()} tokens`);
    }
  });

  let message;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error("Anthropic API key is invalid (ANTHROPIC_API_KEY).");
    if (err instanceof Anthropic.RateLimitError) throw new Error("Anthropic rate limit hit — wait a moment and retry.");
    if (err instanceof Anthropic.BadRequestError) throw new Error(`Anthropic rejected the request: ${err.message}`);
    if (err instanceof Anthropic.APIError) throw new Error(`Anthropic API error ${err.status ?? ""}: ${err.message}`);
    throw err;
  }

  if (message.stop_reason === "refusal") {
    throw new Error("The model declined to analyze this repository.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("The analysis was cut off (max_tokens). Try a smaller repository.");
  }
  if (!message.parsed_output) {
    throw new Error("The model returned output that didn't match the analysis schema.");
  }
  return { analysis: message.parsed_output, model: message.model };
}
