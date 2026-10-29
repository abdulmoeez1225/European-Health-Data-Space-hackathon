"use client";

import { Lock, ShieldCheck } from "lucide-react";

import { useLedger } from "@/api/queries";
import { Section } from "@/components/ui/Card";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { formatTime, humanise, plural } from "@/lib/format";

function labelsText(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  return entries.length ? entries.map(([key, value]) => `${humanise(key)}: ${value}`).join(", ") : "All";
}

export function LedgerTable() {
  const ledger = useLedger(true);
  const events = ledger.data ?? [];

  return (
    <Section
      headingLevel={2}
      title="Release ledger"
      icon={<Lock />}
      description="Values withheld because, combined with an earlier release to the same applicant, they would reveal fewer than 10 patients."
      actions={
        ledger.isSuccess ? (
          <span className="text-sm text-muted">{plural(events.length, "suppression")}</span>
        ) : null
      }
    >
      {ledger.isPending ? (
        <SkeletonRows rows={2} />
      ) : ledger.isError && !ledger.data ? (
        <ErrorState
          title="Could not load the ledger"
          error={ledger.error}
          onRetry={() => void ledger.refetch()}
        />
      ) : events.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title="No differencing attacks blocked yet">
          Run the red team above to see the ledger intervene.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead className="bg-surface-2 text-xs tracking-wide text-muted uppercase">
              <tr>
                {[
                  "Time",
                  "Applicant",
                  "Request",
                  "Metric",
                  "Group",
                  "Combined with",
                  "Patients revealed",
                ].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className={
                      h === "Patients revealed"
                        ? "px-4 py-2.5 text-right font-semibold"
                        : "px-4 py-2.5 text-left font-semibold"
                    }
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={`${event.request_id}-${event.metric}-${JSON.stringify(event.labels)}-${event.time ?? ""}`}
                  className="border-t border-line"
                >
                  <td className="px-4 py-2.5 text-muted">{formatTime(event.time)}</td>
                  <td className="px-4 py-2.5">{event.applicant_key}</td>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold">{event.request_id}</td>
                  <td className="px-4 py-2.5">{humanise(event.metric)}</td>
                  <td className="px-4 py-2.5">{labelsText(event.labels)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{event.other_request_id}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-reject-soft px-2.5 py-0.5 font-semibold text-reject">
                      <Lock aria-hidden className="size-3" />
                      {event.revealed_count}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
