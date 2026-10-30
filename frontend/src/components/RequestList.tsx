"use client";

import { CheckCircle2, Flag, Undo2 } from "lucide-react";
import type { KeyboardEvent } from "react";

import { readRequest } from "@/api/request";
import type { RequestResult } from "@/api/types";
import type { Signature } from "@/app/providers";
import { DecisionBadge } from "@/components/DecisionBadge";
import { cn } from "@/lib/cn";
import { formatShortTime, formatTime } from "@/lib/format";

type ListProps = {
  results: RequestResult[];
  selectedId: string | null;
  onSelect: (requestId: string) => void;
  /** Arrow keys also select when the detail sits beside the list; otherwise they only move focus. */
  selectOnArrow: boolean;
  /** Staff only: review flags and local sign-off. Applicants never see review flags. */
  signatures?: Record<string, Signature>;
  label: string;
};

export function RequestList({ results, selectedId, onSelect, selectOnArrow, signatures, label }: ListProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-request]")];
    const index = buttons.findIndex((button) => button === document.activeElement);
    const next =
      buttons[Math.min(buttons.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    event.preventDefault();
    next.focus();
    if (selectOnArrow) onSelect(next.dataset.request ?? "");
  };

  return (
    <ul aria-label={label} onKeyDown={onKeyDown}>
      {results.map((result) => {
        const request = readRequest(result.request);
        const flags = signatures ? (result.review_flags?.length ?? 0) : 0;
        const signature = signatures?.[result.request_id];
        const selected = result.request_id === selectedId;
        return (
          <li key={result.request_id} className="border-b">
            <button
              type="button"
              data-request={result.request_id}
              aria-current={selected ? "true" : undefined}
              onClick={() => {
                onSelect(result.request_id);
              }}
              className={cn(
                "flex h-10 w-full cursor-pointer items-center gap-3 px-4 text-left text-[13px] transition-colors duration-100 outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5",
                selected && "bg-accent hover:bg-accent",
              )}
            >
              <span className="w-11 shrink-0 font-mono text-xs text-muted-foreground">
                {result.request_id}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {request.applicant.organisation || "Unknown applicant"}
              </span>
              {flags ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-warning"
                  title={`${flags} review flag${flags > 1 ? "s" : ""}`}
                >
                  <Flag aria-hidden className="size-3" />
                  {flags}
                  <span className="sr-only"> review flag{flags > 1 ? "s" : ""}</span>
                </span>
              ) : null}
              {signature ? (
                <span
                  title={signature.kind === "sign" ? "Approved by staff" : "Overridden by staff"}
                  className="shrink-0"
                >
                  {signature.kind === "sign" ? (
                    <CheckCircle2 aria-label="Approved by staff" className="size-3.5 text-success" />
                  ) : (
                    <Undo2 aria-label="Overridden by staff" className="size-3.5 text-warning" />
                  )}
                </span>
              ) : null}
              <span className="hidden shrink-0 sm:inline-flex">
                <DecisionBadge decision={result.decision} short />
              </span>
              <time
                dateTime={result.processed_at}
                title={formatTime(result.processed_at)}
                className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
              >
                {formatShortTime(result.processed_at)}
              </time>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
