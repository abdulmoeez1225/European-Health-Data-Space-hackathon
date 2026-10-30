"use client";

import { Check, LoaderCircle, Lock, Play, RotateCcw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { mutationKeys, useLatestDecision, useRequests } from "@/api/queries";
import type { RequestResult } from "@/api/types";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatValue } from "@/lib/format";
import { RED_TEAM_QUESTIONS, redTeamOutcome, type RedTeamOutcome, type RedTeamStep } from "@/lib/redteam";

import type { RedTeam } from "./useRedTeam";

type StepState =
  | { kind: "idle" }
  | { kind: "waiting" }
  | { kind: "running"; startedAt: number }
  | { kind: "error"; error: Error | null }
  | { kind: "done"; result: RequestResult; earlier: boolean };

function useStepState(step: RedTeamStep, redTeam: RedTeam): StepState {
  const latest = useLatestDecision(mutationKeys.redTeam(step));
  const requests = useRequests();
  const { resetAt, running, runStartedAt } = redTeam;
  const stale = latest !== undefined && resetAt !== null && latest.submittedAt < resetAt;
  const fromThisRun = latest !== undefined && runStartedAt !== null && latest.submittedAt >= runStartedAt;
  // Without a run in this tab, show the backend's earlier result for the same request.
  const earlier = resetAt === null ? requests.data?.find((r) => r.request_id === `RT-${step}`) : undefined;

  if (step === 2 && running && !fromThisRun) return { kind: "waiting" };
  if (latest?.status === "pending") return { kind: "running", startedAt: latest.submittedAt };
  if (latest?.status === "error" && !stale) return { kind: "error", error: latest.error };
  if (latest?.status === "success" && latest.result && !stale) {
    return { kind: "done", result: latest.result, earlier: false };
  }
  if (earlier) return { kind: "done", result: earlier, earlier: true };
  return { kind: "idle" };
}

/** The differencing attack told as two questions from the same applicant. */
export function RedTeamResults({ redTeam, onShowBlocked }: { redTeam: RedTeam; onShowBlocked: () => void }) {
  const first = useStepState(1, redTeam);
  const second = useStepState(2, redTeam);
  const firstOutcome = first.kind === "done" ? redTeamOutcome(first.result) : null;
  const secondOutcome = second.kind === "done" ? redTeamOutcome(second.result) : null;
  const busy = redTeam.running || redTeam.resetting;

  return (
    <section aria-labelledby="red-team-title" className="grid gap-7 rounded-xl border bg-card p-6 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid max-w-[60ch] gap-1.5">
          <h2 id="red-team-title" className="text-section font-semibold">
            Red-team check: can two harmless questions expose one patient?
          </h2>
          <p className="text-body text-muted-foreground">
            The small-cell rule checks each answer alone; the ledger remembers what this applicant already
            received.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" disabled={busy} onClick={redTeam.resetLedger}>
            {redTeam.resetting ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : (
              <RotateCcw aria-hidden />
            )}
            Reset demo
          </Button>
          <Button disabled={busy} onClick={() => void redTeam.run()}>
            {redTeam.running ? <LoaderCircle aria-hidden className="animate-spin" /> : <Play aria-hidden />}
            {redTeam.running ? "Asking…" : "Run both questions"}
          </Button>
        </div>
      </div>

      <ol className="grid divide-y divide-divider border-y border-divider">
        <Step step={1} state={first}>
          {firstOutcome ? <Outcome outcome={firstOutcome} /> : null}
        </Step>
        <Step step={2} state={second}>
          {secondOutcome ? <Outcome outcome={secondOutcome} previous={firstOutcome} /> : null}
        </Step>
      </ol>

      {secondOutcome?.withheld ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
          <span className="inline-flex items-center gap-2 font-medium">
            <Check aria-hidden className="size-4 text-success" />
            The release ledger blocked the second answer.
          </span>
          <button
            type="button"
            onClick={onShowBlocked}
            className="cursor-pointer rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            See in Blocked releases
          </button>
        </p>
      ) : null}
    </section>
  );
}

function Step({ step, state, children }: { step: RedTeamStep; state: StepState; children: ReactNode }) {
  return (
    <li className="grid gap-4 py-5 sm:grid-cols-[2rem_minmax(0,1fr)_minmax(12rem,auto)] sm:items-center">
      <span
        aria-hidden
        className={cn(
          "grid size-8 place-items-center rounded-full bg-muted text-ui font-semibold tabular-nums",
          state.kind === "done" && "bg-primary text-primary-foreground",
        )}
      >
        {state.kind === "running" ? <LoaderCircle className="size-4 animate-spin" /> : step}
      </span>
      <p className="text-body">{RED_TEAM_QUESTIONS[step]}</p>
      <div aria-live="polite" className="sm:text-right">
        {state.kind === "idle" ? <p className="text-ui text-muted-foreground">Not run yet</p> : null}
        {state.kind === "waiting" ? (
          <p className="text-ui text-muted-foreground">Waits for question 1</p>
        ) : null}
        {state.kind === "running" ? <Elapsed startedAt={state.startedAt} /> : null}
        {state.kind === "error" ? <ErrorState title={`Question ${step} failed`} error={state.error} /> : null}
        {state.kind === "done" ? (
          <>
            {children ?? <p className="text-ui text-muted-foreground">No number was released.</p>}
            {state.earlier ? (
              <p className="mt-1 text-caption text-subtle-foreground">From an earlier run</p>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}

function Outcome({ outcome, previous }: { outcome: RedTeamOutcome; previous?: RedTeamOutcome | null }) {
  if (outcome.withheld) {
    const total = previous && typeof previous.value === "number" ? formatValue(previous.value) : null;
    const revealed = outcome.revealed ?? 1;
    return (
      <div className="grid gap-1 sm:justify-items-end">
        <p className="flex items-center gap-2 text-title font-semibold tabular-nums">
          {formatValue(outcome.value, outcome.kind)}
          <Lock role="img" aria-label="Withheld by the release ledger" className="size-5 text-destructive" />
        </p>
        <p className="max-w-[34ch] text-ui text-muted-foreground">
          Withheld. Subtracting it from {total ?? "the first answer"} would reveal {revealed}{" "}
          {revealed === 1 ? "patient" : "patients"}.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-1 sm:justify-items-end">
      <p className="text-title font-semibold tabular-nums">{formatValue(outcome.value, outcome.kind)}</p>
      <p className="text-ui text-muted-foreground">Released (safe on its own)</p>
    </div>
  );
}

function Elapsed({ startedAt }: { startedAt: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () => {
      setSeconds(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    };
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [startedAt]);
  return (
    <p className="text-ui text-muted-foreground">
      Asking… <span className="tabular-nums">{seconds} s</span>
    </p>
  );
}
