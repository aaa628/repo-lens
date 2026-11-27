import { ArrowRight } from "lucide-react";

/** A plain GET form: no client JS. /analyze turns whatever was pasted into owner/name, or shows why it can't. */
export default function AnalyzeForm() {
  return (
    <form action="/analyze" className="glow-input flex w-full items-center gap-2 rounded-xl bg-panel p-1.5 transition-shadow">
      <span className="pl-3 font-mono text-[13px] text-dim max-sm:hidden">⌕</span>
      <input
        name="repo"
        required
        autoFocus
        placeholder="https://github.com/owner/repo"
        spellCheck={false}
        autoComplete="off"
        aria-label="GitHub repository URL"
        className="min-w-0 flex-1 bg-transparent px-2 py-2.5 font-mono text-[13px] text-fg outline-none placeholder:text-zinc-600"
      />
      <button
        type="submit"
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-signal-600 px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-signal-500"
      >
        Analyze <span className="max-sm:hidden">Repo</span> <ArrowRight size={14} />
      </button>
    </form>
  );
}
