"use client";

import { useSearchParams } from "next/navigation";
import { Inbox, RotateCw } from "lucide-react";
import { useState } from "react";

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
  // Issued permits, withdrawn grants and reopened refusals: decisions staff have acted on.
  if (filter === "actioned") return results.filter((result) => result.staff_action);
  return results;
}

/** Every decision; staff issue waiting permits, answer review requests and check where the AI was unsure. */
export function Requests() {
  const t = useT();
  const requests = useRequests();
  const [filter, setFilter] = useViewState<QueueFilter>("staff.filter", "attention");

  const selectedParam = useSearchParams().get("id");
  // A request staff just acted on no longer matches the filter; it stays listed, and open, until
  // staff pick another request or change the filter.
  const [kept, setKept] = useState<{ id: string; filter: QueueFilter } | null>(null);
  const [previous, setPrevious] = useState(requests.data);
  if (requests.data !== previous) {
    setPrevious(requests.data);
    const acted = requests.data?.find((result) => {
      const before = previous?.find((item) => item.request_id === result.request_id);
      return before && result.staff_action?.at !== before.staff_action?.at;
    });
    if (acted) setKept({ id: acted.request_id, filter });
  }
  const keptId = kept?.filter === filter && (!selectedParam || selectedParam === kept.id) ? kept.id : null;

  const results = requests.data ?? [];
  const attention = filterQueue(results, "attention").length;
  const actioned = filterQueue(results, "actioned").length;
  const matching = new Set(filterQueue(results, filter));
  const shown = results.filter((result) => matching.has(result) || result.request_id === keptId);

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
