"use client";

import { keepPreviousData, useQueries } from "@tanstack/react-query";
import { ScrollText, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { api, type AuditQuery } from "@/api/client";
import { AUTO_REFRESH_MS, keys, useAudit } from "@/api/queries";
import { EmptyState, ErrorState } from "@/components/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatShortTime, formatTime, formatValue } from "@/lib/format";

import {
  actorLabel,
  ALL_EVENTS,
  detailFull,
  detailLine,
  eventLabel,
  eventTone,
  filterOptions,
  mergePages,
} from "./auditLabels";
import { TableSkeleton } from "./BlockedReleasesPanel";
import { STICKY_HEADER, TABLE_FRAME } from "./tableStyles";

const PAGE = 200;
const MAX_LIMIT = 1000;
/** A query for one event: just the per-type counts, shared with the tab label. */
export const COUNTS_QUERY: AuditQuery = { limit: 1 };

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(value);
    }, ms);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, ms]);
  return debounced;
}

/** Mounted only while its tab is visible, so auto-refresh runs only then. */
export function ActivityPanel() {
  const id = useId();
  const [groupKey, setGroupKey] = useState(ALL_EVENTS);
  const [limit, setLimit] = useState(PAGE);
  const [subjectText, setSubjectText] = useState("");
  const subject = useDebounced(subjectText.trim(), 300) || undefined;

  const overview = useAudit(COUNTS_QUERY, true);
  const options = filterOptions(overview.data?.counts ?? {});
  const group = options.find((option) => option.key === groupKey) ?? options[0];
  // The API filters by one exact type: a group of several types is one query per type, merged.
  const types: (string | undefined)[] = group && group.key !== ALL_EVENTS ? group.types : [undefined];

  const page = useQueries({
    queries: types.map((event) => {
      const query: AuditQuery = { limit, event, subject };
      return {
        queryKey: [...keys.audit, query] as const,
        queryFn: () => api.audit(query),
        refetchInterval: AUTO_REFRESH_MS,
        placeholderData: keepPreviousData,
      };
    }),
    combine: (results) => ({
      data: results.every((result) => result.data)
        ? mergePages(
            results.flatMap((result) => (result.data ? [result.data] : [])),
            limit,
          )
        : undefined,
      isPending: results.some((result) => result.isPending),
      error: results.find((result) => result.error)?.error ?? null,
      refetch: () => Promise.all(results.map((result) => result.refetch())),
    }),
  });

  const events = page.data?.events ?? [];
  const total = page.data?.total ?? 0;
  const resetPaging = () => {
    setLimit(PAGE);
  };

  return (
    <div className="grid gap-4">
      <p className="max-w-[60ch] text-body text-muted-foreground">
        Every decision, withdrawal, workspace query, blocked download and export — append-only.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-type`}>Show</Label>
          <Select
            value={group?.key ?? ALL_EVENTS}
            onValueChange={(value) => {
              setGroupKey(value);
              resetPaging();
            }}
          >
            <SelectTrigger id={`${id}-type`} className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  <span className="flex-1">{option.label}</span>
                  <span className="text-data text-muted-foreground tabular-nums">
                    {formatValue(option.count)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-subject`}>Request or permit</Label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
            />
            <Input
              id={`${id}-subject`}
              value={subjectText}
              placeholder="e.g. R05 or permit-R05"
              className="w-60 pl-9 font-mono"
              spellCheck={false}
              onChange={(event) => {
                setSubjectText(event.target.value);
                resetPaging();
              }}
            />
          </div>
        </div>
        <p aria-live="polite" className="ml-auto pb-2 text-data text-muted-foreground tabular-nums">
          {page.data ? `Showing latest ${formatValue(events.length)} of ${formatValue(total)}` : ""}
        </p>
      </div>

      {page.isPending && !page.data ? (
        <TableSkeleton />
      ) : page.error && !page.data ? (
        <ErrorState
          title="Could not load the activity log"
          error={page.error}
          onRetry={() => void page.refetch()}
        />
      ) : events.length === 0 ? (
        <div className={TABLE_FRAME}>
          <EmptyState icon={<ScrollText />} title="No activity matches">
            {subject
              ? "No events for this request or permit."
              : "Nothing has been recorded for this filter yet."}
          </EmptyState>
        </div>
      ) : (
        <div className={TABLE_FRAME}>
          <Table
            label="Activity log"
            containerClassName="max-h-[560px] overflow-auto"
            className="table-fixed"
          >
            <colgroup>
              <col className="w-24" />
              <col className="w-52" />
              <col className="w-48" />
              <col className="w-32" />
              <col />
              <col className="w-32" />
            </colgroup>
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
                <TableRow key={event.id ?? index}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    <time dateTime={event.time} title={formatTime(event.time)}>
                      {formatShortTime(event.time)}
                    </time>
                  </TableCell>
                  <TableCell>
                    <Badge variant={eventTone(event.event)}>{eventLabel(event.event)}</Badge>
                  </TableCell>
                  <TableCell className="truncate">{actorLabel(event.actor)}</TableCell>
                  <TableCell className="truncate font-mono">{event.subject}</TableCell>
                  <TableCell className="truncate text-muted-foreground" title={detailFull(event)}>
                    {detailLine(event)}
                  </TableCell>
                  <TableCell className="truncate font-mono text-caption text-subtle-foreground">
                    {event.id}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {events.length < total && limit < MAX_LIMIT ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => {
              setLimit((current) => Math.min(current + PAGE, MAX_LIMIT));
            }}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
