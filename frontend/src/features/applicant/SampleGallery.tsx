"use client";

import { BarChart3, ChevronDown, Database } from "lucide-react";
import { useState } from "react";

import { useSamples } from "@/api/queries";
import { readRequest } from "@/api/request";
import type { JsonObject } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { cn } from "@/lib/cn";

type Filter = "all" | "statistics" | "records";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "statistics", label: "Statistics" },
  { value: "records", label: "Records (SPE)" },
];

const INITIAL = 6;

const isAccessApplication = (sample: JsonObject) =>
  /access application/i.test(readRequest(sample).requestedAs);

type GalleryProps = { selectedId: string | null; onPick: (sample: JsonObject) => void };

export function SampleGallery({ selectedId, onPick }: GalleryProps) {
  const samples = useSamples();
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);

  if (samples.isPending) {
    return (
      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        role="status"
        aria-label="Loading sample requests"
      >
        {Array.from({ length: INITIAL }, (_, i) => (
          <Skeleton key={i} className="h-[132px] rounded-[14px]" />
        ))}
      </div>
    );
  }
  if (samples.isError) {
    return (
      <ErrorState
        title="Could not load sample requests"
        error={samples.error}
        onRetry={() => void samples.refetch()}
      />
    );
  }

  const all = samples.data;
  const counts: Record<Filter, number> = {
    all: all.length,
    statistics: all.filter((s) => !isAccessApplication(s)).length,
    records: all.filter(isAccessApplication).length,
  };
  const filtered = all.filter((s) =>
    filter === "all" ? true : filter === "records" ? isAccessApplication(s) : !isAccessApplication(s),
  );
  const visible = expanded ? filtered : filtered.slice(0, INITIAL);

  return (
    <div>
      <div
        role="group"
        aria-label="Filter sample requests"
        className="mb-4 inline-flex rounded-[10px] border border-line bg-surface-2 p-1"
      >
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
              filter === value ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
            )}
          >
            {label} <span className="font-normal text-muted tabular-nums">{counts[value]}</span>
          </button>
        ))}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((sample, index) => {
          const request = readRequest(sample);
          const records = isAccessApplication(sample);
          const id = request.id || `#${index + 1}`;
          const selected = selectedId === id;
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  onPick(sample);
                }}
                className={cn(
                  "group flex h-full w-full flex-col gap-2 rounded-[14px] border bg-surface p-4 text-left shadow-card transition-[border-color,box-shadow] duration-150",
                  selected ? "border-accent ring-2 ring-accent" : "border-line hover:border-accent/60",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-muted">{id}</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
                      records ? "bg-spe-soft text-spe" : "bg-accent-soft text-accent",
                    )}
                  >
                    {records ? (
                      <Database aria-hidden className="size-3" />
                    ) : (
                      <BarChart3 aria-hidden className="size-3" />
                    )}
                    {records ? "Access application" : "Data request"}
                  </span>
                </span>
                <span className="line-clamp-2 font-semibold leading-snug">
                  {request.applicant.organisation || "Unknown applicant"}
                </span>
                <span className="line-clamp-3 text-sm text-muted">{request.purpose}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {filtered.length > INITIAL ? (
        <div className="mt-3 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            icon={
              <ChevronDown
                aria-hidden
                className={cn("size-4 transition-transform", expanded && "rotate-180")}
              />
            }
            onClick={() => {
              setExpanded((value) => !value);
            }}
          >
            {expanded ? "Show fewer" : `Show all ${filtered.length} requests`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
