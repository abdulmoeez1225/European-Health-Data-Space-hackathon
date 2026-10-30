"use client";

import { Inbox, RotateCw } from "lucide-react";

import { useRequests } from "@/api/queries";
import type { RequestResult } from "@/api/types";
import { useViewState } from "@/app/providers";
import { ListDetail } from "@/components/ListDetail";
import { PageHeader } from "@/components/PageHeader";
import { RequestList } from "@/components/RequestList";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";

import { RequestDetail } from "./RequestDetail";

export type QueueFilter = "attention" | "all" | "actioned";

export function filterQueue(results: RequestResult[], filter: QueueFilter): RequestResult[] {
  if (filter === "attention") return results.filter((result) => result.needs_attention);
  // Withdrawn grants and reopened refusals: decisions staff have acted on.
  if (filter === "actioned") return results.filter((result) => result.status !== "issued");
  return results;
}

/** Every decision, issued instantly; staff look at the ones the AI was unsure about. */
export function Requests() {
  const t = useT();
  const requests = useRequests();
  const [filter, setFilter] = useViewState<QueueFilter>("staff.filter", "attention");

  const results = requests.data ?? [];
  const attention = filterQueue(results, "attention").length;
  const actioned = filterQueue(results, "actioned").length;
  const shown = filterQueue(results, filter);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="grid gap-5 border-b border-divider px-6 pt-10 pb-5">
        <PageHeader
          title={t.staff.queue.title}
          description={
            requests.isSuccess
              ? `${t.staff.queue.needAttention(attention)} · ${t.staff.queue.intro}`
              : t.staff.queue.intro
          }
          actions={
            <Button variant="outline" onClick={() => void requests.refetch()}>
              <RotateCw aria-hidden className={cn(requests.isFetching && "animate-spin")} />
              {t.staff.queue.refresh}
            </Button>
          }
        />
        <Segmented
          label={t.staff.queue.filterLabel}
          value={filter}
          onChange={setFilter}
          options={[
            {
              value: "attention",
              label: t.common.needsAttention,
              count: requests.isSuccess ? attention : undefined,
            },
            {
              value: "all",
              label: t.staff.queue.filterAll,
              count: requests.isSuccess ? results.length : undefined,
            },
            {
              value: "actioned",
              label: t.staff.queue.filterActioned,
              count: requests.isSuccess ? actioned : undefined,
            },
          ]}
        />
      </div>

      {requests.isError && !requests.data ? (
        <div className="p-8">
          <ErrorState
            title={t.staff.queue.loadFailed}
            error={requests.error}
            onRetry={() => void requests.refetch()}
          />
        </div>
      ) : requests.isPending ? (
        <div className="grid gap-px p-4" role="status" aria-label={t.staff.queue.loading}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState icon={<Inbox />} title={t.staff.queue.empty[filter].title}>
          {t.staff.queue.empty[filter].text}
        </EmptyState>
      ) : (
        <ListDetail
          results={shown}
          lookup={results}
          basePath="/staff/"
          list={({ selectedId, onSelect, selectOnArrow }) => (
            <RequestList
              label={t.staff.queue.title}
              results={shown}
              selectedId={selectedId}
              onSelect={onSelect}
              selectOnArrow={selectOnArrow}
              staff
            />
          )}
          detail={(result) => <RequestDetail result={result} />}
        />
      )}
    </div>
  );
}
