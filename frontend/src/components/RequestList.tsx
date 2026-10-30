"use client";

import { CircleSlash, RotateCcw, TriangleAlert } from "lucide-react";
import type { KeyboardEvent } from "react";

import { readRequest } from "@/api/request";
import type { RequestResult } from "@/api/types";
import { DecisionBadge } from "@/components/DecisionBadge";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatShortTime, formatTime } from "@/lib/format";

type ListProps = {
  results: RequestResult[];
  selectedId: string | null;
  onSelect: (requestId: string) => void;
  /** Arrow keys also select when the detail sits beside the list; otherwise they only move focus. */
  selectOnArrow: boolean;
  /** Staff see which decisions need attention; applicants never see review flags. */
  staff?: boolean;
  label: string;
};

export function RequestList({
  results,
  selectedId,
  onSelect,
  selectOnArrow,
  staff = false,
  label,
}: ListProps) {
  const t = useT();
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
        const withdrawn = result.status === "withdrawn";
        const reopened = result.status === "reopened";
        const selected = result.request_id === selectedId;
        return (
          <li key={result.request_id} className="border-b border-divider">
            <button
              type="button"
              data-request={result.request_id}
              aria-current={selected ? "true" : undefined}
              onClick={() => {
                onSelect(result.request_id);
              }}
              className={cn(
                "flex h-11 w-full cursor-pointer items-center gap-3 px-6 text-left text-data transition-colors duration-100 outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                selected && "bg-accent hover:bg-accent",
              )}
            >
              {staff ? (
                <QueueStatus attention={result.needs_attention} withdrawn={withdrawn} reopened={reopened} />
              ) : null}
              <span className="w-11 shrink-0 font-mono text-subtle-foreground">{result.request_id}</span>
              <span className="min-w-0 flex-1 truncate">
                {request.applicant.organisation || t.common.unknownApplicant}
              </span>
              {!staff && withdrawn ? <Badge variant="warning">{t.common.withdrawn}</Badge> : null}
              {!staff && reopened ? <Badge variant="info">{t.common.reconsidering}</Badge> : null}
              <span className="hidden shrink-0 sm:inline-flex">
                <DecisionBadge decision={result.decision} short />
              </span>
              <time
                dateTime={result.processed_at}
                title={formatTime(result.processed_at)}
                className="w-14 shrink-0 text-right text-caption text-subtle-foreground tabular-nums"
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

/** Staff queue: an alert icon when the AI was unsure, a muted mark once actioned, else nothing. */
function QueueStatus({
  attention,
  withdrawn,
  reopened,
}: {
  attention: boolean;
  withdrawn: boolean;
  reopened: boolean;
}) {
  const t = useT();
  if (reopened) {
    return (
      <span title={t.common.reopened} className="shrink-0">
        <RotateCcw aria-hidden className="size-4 text-subtle-foreground" />
        <span className="sr-only">{t.common.reopened}: </span>
      </span>
    );
  }
  if (withdrawn) {
    return (
      <span title={t.common.withdrawn} className="shrink-0">
        <CircleSlash aria-hidden className="size-4 text-subtle-foreground" />
        <span className="sr-only">{t.common.withdrawn}: </span>
      </span>
    );
  }
  if (attention) {
    return (
      <span title={t.common.needsAttention} className="shrink-0">
        <TriangleAlert aria-hidden className="size-4 text-warning" />
        <span className="sr-only">{t.common.needsAttention}: </span>
      </span>
    );
  }
  return <span aria-hidden className="size-4 shrink-0" />;
}
