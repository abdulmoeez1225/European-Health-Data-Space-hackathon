"use client";

import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { useRef } from "react";

import { useRequests } from "@/api/queries";
import { readRequest } from "@/api/request";
import type { RequestResult } from "@/api/types";
import { useSignatures, useViewState } from "@/app/providers";
import { DecisionBadge } from "@/components/DecisionBadge";
import { PageIntro } from "@/components/PageIntro";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";
import { scrollBehavior } from "@/lib/motion";

import { CaseDetail } from "./CaseDetail";

export function StaffConsole() {
  const requests = useRequests();
  const { signatures } = useSignatures();
  const [selectedId, setSelectedId] = useViewState<string | null>("staff.selected", null);
  const detailRef = useRef<HTMLDivElement>(null);

  const results = requests.data ?? [];
  const selected = results.find((r) => r.request_id === selectedId) ?? results[0] ?? null;
  const flagged = results.filter((r) => (r.review_flags ?? []).length > 0).length;
  const unsigned = results.filter((r) => !signatures[r.request_id]).length;

  return (
    <div>
      <PageIntro
        title="Staff console"
        actions={
          <Button
            size="sm"
            icon={<RefreshCw aria-hidden className={cn("size-3.5", requests.isFetching && "animate-spin")} />}
            onClick={() => void requests.refetch()}
          >
            Refresh
          </Button>
        }
      >
        Every automated decision, with the AI assessment, the rule that decided, the generated queries and the
        privacy checks. Review, then sign or override.
      </PageIntro>

      {requests.isError && !requests.data ? (
        <ErrorState
          title="Could not load requests"
          error={requests.error}
          onRetry={() => void requests.refetch()}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside aria-label="Processed requests" className="lg:sticky lg:top-32">
            <div className="mb-3 flex items-baseline justify-between gap-2 px-1">
              <h2 className="font-semibold">Cases</h2>
              {requests.isSuccess ? (
                <p className="text-xs text-muted">
                  {results.length} total · {unsigned} to review{flagged ? ` · ${flagged} flagged` : ""}
                </p>
              ) : null}
            </div>
            {requests.isPending ? (
              <SkeletonRows rows={4} />
            ) : results.length === 0 ? (
              <EmptyState icon={<Inbox />} title="No requests processed yet">
                Submit a request in the Applicant portal and it appears here for review.
              </EmptyState>
            ) : (
              <ul className="grid max-h-[340px] gap-2 overflow-y-auto pr-1 lg:max-h-[calc(100dvh-11rem)]">
                {results.map((result) => (
                  <li key={result.request_id}>
                    <CaseListItem
                      result={result}
                      selected={result.request_id === selected?.request_id}
                      signed={signatures[result.request_id]?.kind}
                      onSelect={() => {
                        setSelectedId(result.request_id);
                        // Stacked layout (tablet): bring the case into view.
                        if (window.matchMedia("(max-width: 1023px)").matches) {
                          detailRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
                        }
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </aside>
          <div ref={detailRef} className="min-w-0 scroll-mt-36">
            {requests.isPending ? (
              <div className="grid gap-5" role="status" aria-label="Loading case">
                <Skeleton className="h-48 rounded-[14px]" />
                <Skeleton className="h-64 rounded-[14px]" />
              </div>
            ) : selected ? (
              <CaseDetail key={selected.request_id} result={selected} />
            ) : (
              <EmptyState icon={<Inbox />} title="Select a case to review the decision" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type ItemProps = {
  result: RequestResult;
  selected: boolean;
  signed: "sign" | "override" | undefined;
  onSelect: () => void;
};

function CaseListItem({ result, selected, signed, onSelect }: ItemProps) {
  const request = readRequest(result.request);
  const flags = (result.review_flags ?? []).length;
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border bg-surface p-3.5 text-left transition-[border-color,box-shadow] duration-150",
        selected ? "border-accent shadow-card ring-1 ring-accent" : "border-line hover:border-accent/50",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <DecisionBadge decision={result.decision} />
        {signed ? (
          <Pill tone={signed === "sign" ? "stats" : "warn"}>
            {signed === "sign" ? "Signed" : "Overridden"}
          </Pill>
        ) : null}
      </span>
      <span className="mt-2 line-clamp-2 block font-semibold leading-snug">
        {request.applicant.organisation || result.request_id}
      </span>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span className="font-mono">{result.request_id}</span>
        <span aria-hidden>·</span>
        <span>{formatTime(result.processed_at)}</span>
        {flags ? (
          <span className="inline-flex items-center gap-1 font-semibold text-warn">
            <AlertTriangle aria-hidden className="size-3" />
            {flags} flag{flags > 1 ? "s" : ""}
          </span>
        ) : null}
      </span>
    </button>
  );
}
