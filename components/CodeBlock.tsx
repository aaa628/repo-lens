"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

const LANG_MAP: Record<string, string> = {
  docker: "dockerfile",
  text: "text",
  makefile: "makefile",
};

/** Client-side Shiki highlighting with real line numbers and an optional highlighted line. */
export default function CodeBlock({
  code,
  language,
  startLine = 1,
  highlightLine,
  file,
  href,
}: {
  code: string;
  language: string;
  startLine?: number;
  highlightLine?: number;
  file?: string;
  href?: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { codeToHtml } = await import("shiki");
      const render = (lang: string) =>
        codeToHtml(code, {
          lang,
          theme: "github-dark-default",
          transformers: [
            {
              line(node, line) {
                if (highlightLine && line + startLine - 1 === highlightLine) this.addClassToHast(node, "hl");
              },
            },
          ],
        });
      let out: string;
      try {
        out = await render(LANG_MAP[language] ?? language);
      } catch {
        out = await render("text");
      }
      if (!cancelled) setHtml(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [code, language, startLine, highlightLine]);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-[#070707]">
      {file && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
          {href ? (
            <a href={href} target="_blank" rel="noreferrer" className="truncate font-mono text-[11px] text-muted hover:text-fg">
              {file}
              {startLine > 1 ? `:${startLine}` : ""}
            </a>
          ) : (
            <span className="truncate font-mono text-[11px] text-muted">{file}</span>
          )}
          <button
            onClick={() => {
              void navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="shrink-0 rounded p-1 text-dim hover:bg-white/5 hover:text-fg"
            aria-label="Copy code"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      )}
      <div className="code-block scroll-thin max-h-[320px] overflow-auto" style={{ ["--start" as string]: startLine - 1 }}>
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre>
            <code>
              {code.split("\n").map((l, i) => (
                <span key={i}>
                  <span className="line">{l}</span>
                  {"\n"}
                </span>
              ))}
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}
