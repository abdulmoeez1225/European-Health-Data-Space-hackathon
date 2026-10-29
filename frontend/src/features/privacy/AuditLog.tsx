"use client";

import { Pause, Play, ScrollText } from "lucide-react";
import { useState } from "react";

import { AUTO_REFRESH_MS, useAudit } from "@/api/queries";
import type { AuditEvent } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { cn } from "@/lib/cn";
import { formatTime, humanise } from "@/lib/format";

type Tone = Parameters<typeof Pill>[0]["tone"];

function eventTone(event: string): Tone {
  if (/blocked/.test(event)) return "reject";
  if (/released|created/.test(event)) return "stats";
  if (event === "decision") return "accent";
  if (/reset/.test(event)) return "warn";
  return "neutral";
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

export function AuditLog() {
  const [live, setLive] = useState(true);
  const audit = useAudit(live);
  const events = audit.data ?? [];

  return (
    <Section
      headingLevel={2}
      title="Audit log"
      icon={<ScrollText />}
      description="Append-only record of every decision, release and blocked action. Never contains patient data."
      actions={
        <>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span
              aria-hidden
              className={cn("size-2 rounded-full", live ? "animate-pulse bg-stats" : "bg-line-strong")}
            />
            {live ? `Live · every ${AUTO_REFRESH_MS / 1000} s` : "Paused"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon={
              live ? <Pause aria-hidden className="size-3.5" /> : <Play aria-hidden className="size-3.5" />
            }
            onClick={() => {
              setLive((value) => !value);
            }}
          >
            {live ? "Pause" : "Resume"}
          </Button>
        </>
      }
    >
      {audit.isPending ? (
        <SkeletonRows rows={3} />
      ) : audit.isError && !audit.data ? (
        <ErrorState
          title="Could not load the audit log"
          error={audit.error}
          onRetry={() => void audit.refetch()}
        />
      ) : events.length === 0 ? (
        <EmptyState icon={<ScrollText />} title="No audit events yet" />
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-label="Audit events"
          className="max-h-[560px] overflow-auto rounded-xl border border-line"
        >
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface-2 text-xs tracking-wide text-muted uppercase">
              <tr>
                {["Time", "Event", "Actor", "Subject", "Detail", "ID"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => (
                <tr key={event.id ?? index} className="border-t border-line align-top hover:bg-surface-2/50">
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">{formatTime(event.time)}</td>
                  <td className="px-4 py-2.5">
                    <Pill tone={eventTone(event.event)}>{humanise(event.event)}</Pill>
                  </td>
                  <td className="px-4 py-2.5">{event.actor}</td>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold whitespace-nowrap">
                    {event.subject}
                  </td>
                  <td className="max-w-[460px] px-4 py-2.5 text-xs break-words text-muted">
                    {detailText(event.detail)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">{event.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
