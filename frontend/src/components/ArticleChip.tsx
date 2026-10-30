"use client";

import { useLaw } from "@/api/queries";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ARTICLE_TITLES } from "@/lib/decisions";

/**
 * "Art. 53" chip. Hover or focus shows the article title, why it applies to this decision
 * (`detail`, from the legal basis) and a plain-language summary from /api/law.
 */
export function ArticleChip({ article, detail }: { article: string; detail?: string }) {
  const { data } = useLaw();
  const entry = data?.articles.find((a) => a.number === article);
  const title = entry?.title ?? ARTICLE_TITLES[article] ?? "Regulation (EU) 2025/327";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Art. ${article}: ${title}`}
          className="inline-flex h-5 shrink-0 cursor-help items-center rounded-[4px] border px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums transition-colors duration-100 outline-none hover:border-foreground/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Art. {article}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <span className="block font-medium">
          Art. {article} · {title}
        </span>
        {detail ? <span className="mt-1 block">{detail}</span> : null}
        {entry ? <span className="mt-1 block text-muted-foreground">{entry.summary}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}
