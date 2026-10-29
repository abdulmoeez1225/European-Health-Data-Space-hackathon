"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

export const PROGRESS_STEPS = [
  { label: "Reading request", detail: "Applicant, purpose and definitions" },
  { label: "Checking purpose (Art. 54)", detail: "Prohibited uses are rejected first" },
  { label: "Mapping terms to ICD-10/ATC/LOINC", detail: "Plain English to the codes in the data" },
  { label: "Computing with small-cell rule", detail: "Groups below 10 are never shown exactly" },
  { label: "Release ledger", detail: "No combination with earlier answers may reveal a small group" },
] as const;

const STEP_MS = 2500;

/** Staged progress while the decision runs (5–30 s). Steps advance on a timer; the last waits for the answer. */
export function ProgressTimeline({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const elapsed = Math.max(0, now - startedAt);
  const active = Math.min(Math.floor(elapsed / STEP_MS), PROGRESS_STEPS.length - 1);
  const current = PROGRESS_STEPS[active];

  return (
    <div className="animate-reveal rounded-[14px] border border-line bg-surface p-6 shadow-card sm:p-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Processing your request</h2>
        <span aria-hidden className="text-sm text-muted tabular-nums">
          {Math.floor(elapsed / 1000)} s · usually 5–30 s
        </span>
      </div>
      <p className="sr-only" aria-live="polite">
        {current ? `Step ${active + 1} of ${PROGRESS_STEPS.length}: ${current.label}` : ""}
      </p>
      <ol className="relative grid gap-5">
        {PROGRESS_STEPS.map((step, index) => {
          const state = index < active ? "done" : index === active ? "active" : "todo";
          return (
            <li
              key={step.label}
              aria-current={state === "active" ? "step" : undefined}
              className="relative flex items-start gap-4"
            >
              {index < PROGRESS_STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-8 left-[13px] h-[calc(100%-12px)] w-0.5 rounded-full transition-colors duration-300",
                    state === "done" ? "bg-stats" : "bg-line",
                  )}
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 grid size-7 shrink-0 place-items-center rounded-full border-2 bg-surface transition-colors duration-300",
                  state === "done" && "border-stats bg-stats text-on-status",
                  state === "active" && "border-accent",
                  state === "todo" && "border-line-strong",
                )}
              >
                {state === "done" ? <Check className="size-4" strokeWidth={3} /> : null}
                {state === "active" ? (
                  <span className="size-full animate-spin rounded-full border-2 border-transparent border-t-accent" />
                ) : null}
              </span>
              <div className="pt-0.5">
                <p
                  className={cn(
                    "font-semibold",
                    state === "active" ? "text-fg" : state === "done" ? "text-stats" : "text-muted",
                  )}
                >
                  {step.label}
                  <span className="sr-only">
                    {state === "done" ? " (done)" : state === "active" ? " (in progress)" : " (pending)"}
                  </span>
                </p>
                <p className="text-sm text-muted">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
