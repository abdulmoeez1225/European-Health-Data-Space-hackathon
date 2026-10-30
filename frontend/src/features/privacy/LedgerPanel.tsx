"use client";

import { Lock, ShieldCheck } from "lucide-react";

import { useLedger } from "@/api/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState } from "@/components/States";
import { formatTime, humanise } from "@/lib/format";

import { STICKY_HEADER, TABLE_FRAME } from "./tableStyles";

function labelsText(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  return entries.length ? entries.map(([key, value]) => `${humanise(key)}: ${value}`).join(", ") : "All";
}

export function LedgerPanel() {
  const ledger = useLedger(true);
  const events = ledger.data ?? [];

  if (ledger.isPending) return <TableSkeleton />;
  if (ledger.isError && !ledger.data) {
    return (
      <ErrorState
        title="Could not load the ledger"
        error={ledger.error}
        onRetry={() => void ledger.refetch()}
      />
    );
  }
  if (events.length === 0) {
    return (
      <div className={TABLE_FRAME}>
        <EmptyState icon={<ShieldCheck />} title="No differencing attempts blocked yet">
          Run the attack to see the ledger intervene.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className={TABLE_FRAME}>
      <Table label="Release ledger" containerClassName="max-h-[480px] overflow-auto">
        <TableHeader className={STICKY_HEADER}>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Time</TableHead>
            <TableHead scope="col">Applicant</TableHead>
            <TableHead scope="col">Request</TableHead>
            <TableHead scope="col">Metric</TableHead>
            <TableHead scope="col">Group</TableHead>
            <TableHead scope="col">Combined with</TableHead>
            <TableHead scope="col" className="text-right">
              Revealed
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow
              key={`${event.request_id}-${event.metric}-${JSON.stringify(event.labels)}-${event.time ?? ""}`}
            >
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatTime(event.time)}
              </TableCell>
              <TableCell>{event.applicant_key}</TableCell>
              <TableCell className="font-mono text-xs">{event.request_id}</TableCell>
              <TableCell>{humanise(event.metric)}</TableCell>
              <TableCell>{labelsText(event.labels)}</TableCell>
              <TableCell className="font-mono text-xs">{event.other_request_id}</TableCell>
              <TableCell className="text-right">
                <span className="inline-flex items-center gap-1 font-medium text-destructive tabular-nums">
                  <Lock aria-hidden className="size-3" />
                  {event.revealed_count}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="grid gap-1.5">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-8" />
      ))}
    </div>
  );
}
