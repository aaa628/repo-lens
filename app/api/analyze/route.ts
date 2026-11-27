import { analyzeRepo } from "@/lib/analyzer";
import { GitHubError, parseRepoUrl } from "@/lib/github";
import { missingCredentials } from "@/lib/llm";
import type { AnalysisResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Stage 3 can take a minute or two on large repos. Vercel Pro/Fluid and Netlify allow this; Hobby caps lower.
export const maxDuration = 300;

// Per-instance cache so repeated analyses of the same repo are instant.
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; result: AnalysisResult }>();

export async function POST(req: Request) {
  let url = "";
  try {
    url = String(((await req.json()) as { url?: string }).url ?? "");
  } catch {}

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      // Keep proxies from closing an idle connection while the model is thinking.
      const ping = setInterval(() => !closed && controller.enqueue(encoder.encode(`: ping\n\n`)), 15_000);

      try {
        const ref = parseRepoUrl(url);
        if (!ref) throw new GitHubError("That doesn't look like a GitHub repo URL. Use https://github.com/owner/repo", 400);

        const key = `${ref.owner}/${ref.repo}`.toLowerCase();
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
          send("progress", { stage: "ground", status: "done", message: "Loaded cached analysis" });
          send("result", hit.result);
          return;
        }

        const missing = missingCredentials();
        if (missing) throw new Error(`${missing} Meanwhile, try one of the Instant Demos.`);

        const result = await analyzeRepo(url, (p) => send("progress", p), req.signal);
        cache.set(key, { at: Date.now(), result });
        send("result", result);
      } catch (err) {
        if (req.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Analysis failed.";
        console.error("[analyze]", err);
        send("error", { message });
      } finally {
        clearInterval(ping);
        closed = true;
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
