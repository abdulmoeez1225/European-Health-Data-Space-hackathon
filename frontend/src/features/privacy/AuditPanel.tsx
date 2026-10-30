"use client";

import { ScrollText } from "lucide-react";

import { useAudit } from "@/api/queries";
import type { AuditEvent } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState } from "@/components/States";
import { cn } from "@/lib/cn";
import { formatTime, humanise } from "@/lib/format";

import { TableSkeleton } from "./LedgerPanel";
import { STICKY_HEADER, TABLE_FRAME } from "./tableStyles";

function eventDot(event: string): string {
  if (/blocked/.test(event)) return "bg-destructive";
  if (/released|created/.test(event)) return "bg-success";
  if (event === "decision") return "bg-primary";
  if (/reset/.test(event)) return "bg-warning";
  return "bg-muted-foreground";
}

function valueText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(valueText).join(", ");
  if (value !== null && typeof value === "object") {
    return Object.entries(value)
      .map(([key, inner]) => `${key} ${valueText(inner)}`)
      .join(", ");
  }
  return String(value);
}

function detailText(detail: AuditEvent["detail"]): string {
  return Object.entries(detail ?? {})
    .filter(([, value]) => !(value !== null && typeof value === "object" && Object.keys(value).length === 0))
    .map(([key, value]) => `${humanise(key)}: ${valueText(value)}`)
    .join(" · ");
}

/** Mounted only while its tab is visible, so auto-refresh runs only then. */
export function AuditPanel() {
  const audit = useAudit(true);
  const events = audit.data ?? [];

  if (audit.isPending) return <TableSkeleton />;
  if (audit.isError && !audit.data) {
    return (
      <ErrorState
        title="Could not load the audit log"
        error={audit.error}
        onRetry={() => void audit.refetch()}
      />
    );
  }
  if (events.length === 0) {
    return (
      <div className={TABLE_FRAME}>
        <EmptyState icon={<ScrollText />} title="No audit events yet" />
      </div>
    );
  }

  return (
    <div className={TABLE_FRAME}>
      <Table label="Audit events" containerClassName="max-h-[480px] overflow-auto">
        <TableHeader className={STICKY_HEADER}>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Time</TableHead>
            <TableHead scope="col">Event</TableHead>
            <TableHead scope="col">Actor</TableHead>
            <TableHead scope="col">Subject</TableHead>
            <TableHead scope="col">Detail</TableHead>
            <TableHead scope="col">ID</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event, index) => (
            <TableRow key={event.id ?? index} className="align-top">
              <TableCell className="align-top whitespace-nowrap text-muted-foreground">
                {formatTime(event.time)}
              </TableCell>
              <TableCell className="align-top">
                <Badge variant="outline">
                  <span aria-hidden className={cn("size-1.5 rounded-full", eventDot(event.event))} />
                  {humanise(event.event)}
                </Badge>
              </TableCell>
              <TableCell className="align-top">{event.actor}</TableCell>
              <TableCell className="align-top font-mono text-xs whitespace-nowrap">{event.subject}</TableCell>
              <TableCell className="max-w-[420px] min-w-[240px] align-top text-xs break-words whitespace-normal text-muted-foreground">
                {detailText(event.detail)}
              </TableCell>
              <TableCell className="align-top font-mono text-xs text-muted-foreground">{event.id}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
