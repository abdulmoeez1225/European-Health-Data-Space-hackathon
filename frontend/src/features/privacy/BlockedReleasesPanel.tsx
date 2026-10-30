"use client";

import { Lock, ShieldCheck } from "lucide-react";

import { useLedger } from "@/api/queries";
import { EmptyState, ErrorState } from "@/components/States";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatShortTime, formatTime, humanise, plural } from "@/lib/format";

import { STICKY_HEADER, TABLE_FRAME } from "./tableStyles";

function groupText(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  return entries.length
    ? entries.map(([key, value]) => `${humanise(key)}: ${value}`).join(", ")
    : "All patients";
}

export function BlockedReleasesPanel() {
  const ledger = useLedger(true);
  const events = ledger.data ?? [];

  return (
    <div className="grid gap-4">
      <p className="max-w-[60ch] text-body text-muted-foreground">
        Answers withheld because, combined with an earlier answer to the same applicant, they would reveal
        fewer than 10 patients.
      </p>
      {ledger.isPending ? (
        <TableSkeleton />
      ) : ledger.isError && !ledger.data ? (
        <ErrorState
          title="Could not load the blocked releases"
          error={ledger.error}
          onRetry={() => void ledger.refetch()}
        />
      ) : events.length === 0 ? (
        <div className={TABLE_FRAME}>
          <EmptyState icon={<ShieldCheck />} title="Nothing blocked yet.">
            Run the red-team check to see one.
          </EmptyState>
        </div>
      ) : (
        <div className={TABLE_FRAME}>
          <Table label="Blocked releases" containerClassName="max-h-[520px] overflow-auto">
            <TableHeader className={STICKY_HEADER}>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">Time</TableHead>
                <TableHead scope="col">Applicant</TableHead>
                <TableHead scope="col">Request</TableHead>
                <TableHead scope="col">Withheld value</TableHead>
                <TableHead scope="col">Combined with</TableHead>
                <TableHead scope="col" className="text-right">
                  Would reveal
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow
                  key={`${event.request_id}-${event.metric}-${JSON.stringify(event.labels)}-${event.time ?? ""}`}
                >
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    <time dateTime={event.time} title={formatTime(event.time)}>
                      {formatShortTime(event.time)}
                    </time>
                  </TableCell>
                  <TableCell>{event.applicant_key}</TableCell>
                  <TableCell className="font-mono">{event.request_id}</TableCell>
                  <TableCell>
                    {humanise(event.metric)}
                    <span className="block text-caption text-muted-foreground">
                      {groupText(event.labels)}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono">{event.other_request_id}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 font-medium text-destructive tabular-nums">
                      <Lock aria-hidden className="size-3.5" />
                      {plural(event.revealed_count, "patient")}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="grid gap-2">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-11" />
      ))}
    </div>
  );
}
