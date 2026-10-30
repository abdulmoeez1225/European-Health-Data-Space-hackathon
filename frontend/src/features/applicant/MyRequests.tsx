"use client";

import { ListChecks, Plus } from "lucide-react";
import Link from "next/link";

import { useMyRequests } from "@/api/queries";
import { DecisionLetter } from "@/components/letter/DecisionLetter";
import { ListDetail } from "@/components/ListDetail";
import { PageHeader } from "@/components/PageHeader";
import { RequestList } from "@/components/RequestList";
import { EmptyState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyRequestIds } from "@/lib/my-requests";

export function MyRequests() {
  const ids = useMyRequestIds();
  const { results, isPending } = useMyRequests(ids);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-4 sm:px-6">
        <PageHeader
          title="My requests"
          description="Decisions on the requests submitted from this browser."
          actions={
            <Button asChild variant="outline">
              <Link href="/">
                <Plus aria-hidden />
                Request data
              </Link>
            </Button>
          }
        />
      </div>

      {ids.length === 0 || (!isPending && results.length === 0) ? (
        <EmptyState icon={<ListChecks />} title="No requests yet">
          <p>Each request you submit is listed here with its decision letter.</p>
          <Button asChild className="mt-3">
            <Link href="/">Request data</Link>
          </Button>
        </EmptyState>
      ) : isPending && results.length === 0 ? (
        <div className="grid gap-px p-4" role="status" aria-label="Loading your requests">
          {ids.slice(0, 6).map((id) => (
            <Skeleton key={id} className="h-9" />
          ))}
        </div>
      ) : (
        <ListDetail
          results={results}
          basePath="/requests/"
          list={({ selectedId, onSelect, selectOnArrow }) => (
            <RequestList
              label="My requests"
              results={results}
              selectedId={selectedId}
              onSelect={onSelect}
              selectOnArrow={selectOnArrow}
            />
          )}
          detail={(result) => (
            <div className="p-4 sm:p-6">
              <DecisionLetter result={result} />
            </div>
          )}
        />
      )}
    </div>
  );
}
