"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseRepoUrl } from "@/lib/github";

export default function AnalyzeForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const ref = parseRepoUrl(url);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ref) router.push(`/analyze?repo=${ref.owner}/${ref.repo}`);
      }}
      className="glow-input flex w-full items-center gap-2 rounded-xl bg-panel p-1.5 transition-shadow"
    >
      <span className="pl-3 font-mono text-[13px] text-dim max-sm:hidden">⌕</span>
      <input
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://github.com/owner/repo"
        spellCheck={false}
        aria-label="GitHub repository URL"
        className="min-w-0 flex-1 bg-transparent px-2 py-2.5 font-mono text-[13px] text-fg outline-none placeholder:text-zinc-600"
      />
      <button
        type="submit"
        disabled={!ref}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-signal-600 px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-signal-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
      >
        Analyze <span className="max-sm:hidden">Repo</span> <ArrowRight size={14} />
      </button>
    </form>
  );
}
