"use client";

import { Inbox, RotateCw } from "lucide-react";

import { useRequests } from "@/api/queries";
import { useSignatures } from "@/app/providers";
import { ListDetail } from "@/components/ListDetail";
import { PageHeader } from "@/components/PageHeader";
import { RequestList } from "@/components/RequestList";
import { EmptyState, ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";

import { RequestDetail } from "./RequestDetail";

/** Every automated decision, for a case officer to confirm or override. */
export function Requests() {
  const requests = useRequests();
  const { signatures } = useSignatures();

  const results = requests.data ?? [];
  const flagged = results.filter((result) => (result.review_flags?.length ?? 0) > 0).length;
  const toReview = results.filter((result) => !signatures[result.request_id]).length;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-4 sm:px-6">
        <PageHeader
          title="Decision queue"
          description={
            requests.isSuccess
              ? `AI-drafted decisions to confirm or override · ${plural(results.length, "decision")}, ${toReview} to review${flagged ? `, ${flagged} flagged` : ""}`
              : "AI-drafted decisions to confirm or override."
          }
          actions={
            <Button variant="outline" onClick={() => void requests.refetch()}>
              <RotateCw aria-hidden className={cn(requests.isFetching && "animate-spin")} />
              Refresh
            </Button>
          }
        />
      </div>

      {requests.isError && !requests.data ? (
        <div className="p-6">
          <ErrorState
            title="Could not load decisions"
            error={requests.error}
            onRetry={() => void requests.refetch()}
          />
        </div>
      ) : requests.isPending ? (
        <div className="grid gap-px p-4" role="status" aria-label="Loading decisions">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-9" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState icon={<Inbox />} title="No decisions yet">
          Decisions appear here as soon as an applicant submits a request.
        </EmptyState>
      ) : (
        <ListDetail
          results={results}
          basePath="/staff/"
          list={({ selectedId, onSelect, selectOnArrow }) => (
            <RequestList
              label="Decision queue"
              results={results}
              selectedId={selectedId}
              onSelect={onSelect}
              selectOnArrow={selectOnArrow}
              signatures={signatures}
            />
          )}
          detail={(result) => <RequestDetail result={result} />}
        />
      )}
    </div>
  );
}
