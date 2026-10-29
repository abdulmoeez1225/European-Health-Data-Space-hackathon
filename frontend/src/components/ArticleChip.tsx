"use client";

import { useLaw } from "@/api/queries";
import { ARTICLE_TITLES } from "@/lib/decisions";

import { Tooltip } from "./ui/Tooltip";

/** "Art. 53" chip; hover, focus or tap explains the article in plain language (from /api/law). */
export function ArticleChip({ article }: { article: string }) {
  const { data } = useLaw();
  const entry = data?.articles.find((a) => a.number === article);
  const title = entry?.title ?? ARTICLE_TITLES[article] ?? "Regulation (EU) 2025/327";
  return (
    <Tooltip
      content={
        <span className="block">
          <span className="block font-semibold">
            Art. {article} · {title}
          </span>
          {entry ? <span className="mt-1 block text-muted">{entry.summary}</span> : null}
          <span className="mt-1.5 block text-xs text-muted">
            Regulation (EU) 2025/327, plain-language summary
          </span>
        </span>
      }
    >
      <button
        type="button"
        aria-label={`Art. ${article}: ${title}`}
        className="inline-flex h-6 shrink-0 cursor-help items-center rounded-md bg-accent-soft px-2 text-xs font-bold text-accent tabular-nums ring-1 ring-accent/20 ring-inset transition-colors hover:ring-accent/50"
      >
        Art. {article}
      </button>
    </Tooltip>
  );
}
