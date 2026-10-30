"use client";

import { CircleSlash, KeyRound, MessageSquareText, RotateCcw, TriangleAlert } from "lucide-react";
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
        const awaitingPermit = result.status === "awaiting_permit";
        const reviewRequested = Boolean(result.appeal) && result.status === "issued";
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
              {staff ? <QueueStatus result={result} /> : null}
              <span className="min-w-11 shrink-0 font-mono whitespace-nowrap text-subtle-foreground">
                {result.request_id}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {request.applicant.organisation || t.common.unknownApplicant}
              </span>
              {!staff && withdrawn ? <Badge variant="warning">{t.common.withdrawn}</Badge> : null}
              {!staff && reopened ? <Badge variant="info">{t.common.reconsidering}</Badge> : null}
              {!staff && awaitingPermit ? <Badge variant="info">{t.common.awaitingPermit}</Badge> : null}
              {!staff && reviewRequested ? <Badge variant="neutral">{t.common.reviewRequested}</Badge> : null}
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

/**
 * Staff queue: why a decision needs attention (a waiting permit, a review request or an unsure AI),
 * a muted mark once actioned, else nothing.
 */
function QueueStatus({ result }: { result: RequestResult }) {
  const t = useT();
  const mark = (() => {
    if (result.status === "reopened") return { Icon: RotateCcw, label: t.common.reopened, muted: true };
    if (result.status === "withdrawn") return { Icon: CircleSlash, label: t.common.withdrawn, muted: true };
    if (result.status === "awaiting_permit")
      return { Icon: KeyRound, label: t.common.awaitingPermit, muted: false };
    if (result.appeal && result.status === "issued") {
      return { Icon: MessageSquareText, label: t.common.reviewRequested, muted: false };
    }
    if (result.needs_attention) return { Icon: TriangleAlert, label: t.common.needsAttention, muted: false };
    return null;
  })();
  if (!mark) return <span aria-hidden className="size-4 shrink-0" />;
  const { Icon, label, muted } = mark;
  return (
    <span title={label} className="shrink-0">
      <Icon aria-hidden className={cn("size-4", muted ? "text-subtle-foreground" : "text-warning")} />
      <span className="sr-only">{label}: </span>
    </span>
  );
}
