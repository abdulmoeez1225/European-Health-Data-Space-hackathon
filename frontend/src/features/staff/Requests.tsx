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
import { cn } from "@/lib/cn";

import { RequestDetail } from "./RequestDetail";

export type QueueFilter = "attention" | "all" | "withdrawn";

export function filterQueue(results: RequestResult[], filter: QueueFilter): RequestResult[] {
  if (filter === "attention") return results.filter((result) => result.needs_attention);
  if (filter === "withdrawn") return results.filter((result) => result.status === "withdrawn");
  return results;
}

const EMPTY_TEXT: Record<QueueFilter, { title: string; text: string }> = {
  attention: {
    title: "Nothing needs attention",
    text: "Every decision was issued without a doubt from the AI. You are alerted here when it is unsure.",
  },
  all: {
    title: "No decisions yet",
    text: "Decisions appear here as soon as an applicant submits a request.",
  },
  withdrawn: { title: "Nothing withdrawn", text: "Decisions you withdraw are listed here." },
};

/** Every decision, issued instantly; staff look at the ones the AI was unsure about. */
export function Requests() {
  const requests = useRequests();
  const [filter, setFilter] = useViewState<QueueFilter>("staff.filter", "attention");

  const results = requests.data ?? [];
  const attention = filterQueue(results, "attention").length;
  const withdrawn = filterQueue(results, "withdrawn").length;
  const shown = filterQueue(results, filter);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="grid gap-5 border-b border-divider px-6 pt-10 pb-5">
        <PageHeader
          title="Decision queue"
          description={
            requests.isSuccess
              ? `${attention} need attention · Decisions are issued instantly; you are alerted when the AI was unsure.`
              : "Decisions are issued instantly; you are alerted when the AI was unsure."
          }
          actions={
            <Button variant="outline" onClick={() => void requests.refetch()}>
              <RotateCw aria-hidden className={cn(requests.isFetching && "animate-spin")} />
              Refresh
            </Button>
          }
        />
        <Segmented
          label="Show decisions"
          value={filter}
          onChange={setFilter}
          options={[
            {
              value: "attention",
              label: "Needs attention",
              count: requests.isSuccess ? attention : undefined,
            },
            { value: "all", label: "All", count: requests.isSuccess ? results.length : undefined },
            { value: "withdrawn", label: "Withdrawn", count: requests.isSuccess ? withdrawn : undefined },
          ]}
        />
      </div>

      {requests.isError && !requests.data ? (
        <div className="p-8">
          <ErrorState
            title="Could not load decisions"
            error={requests.error}
            onRetry={() => void requests.refetch()}
          />
        </div>
      ) : requests.isPending ? (
        <div className="grid gap-px p-4" role="status" aria-label="Loading decisions">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState icon={<Inbox />} title={EMPTY_TEXT[filter].title}>
          {EMPTY_TEXT[filter].text}
        </EmptyState>
      ) : (
        <ListDetail
          results={shown}
          lookup={results}
          basePath="/staff/"
          list={({ selectedId, onSelect, selectOnArrow }) => (
            <RequestList
              label="Decision queue"
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
