"use client";

import { LoaderCircle, Lock } from "lucide-react";
import { useEffect, useState } from "react";

import { mutationKeys, useLatestDecision, useRequests } from "@/api/queries";
import type { RequestResult } from "@/api/types";
import { DecisionBadge } from "@/components/DecisionBadge";
import { SmallCellBadge } from "@/components/SmallCellBadge";
import { ErrorState } from "@/components/States";
import { formatValue, isProtectedMarker } from "@/lib/format";
import { RED_TEAM_ORGANISATION, type RedTeamStep } from "@/lib/redteam";

import type { RedTeam } from "./useRedTeam";

const SLOTS: { step: RedTeamStep; title: string }[] = [
  { step: 1, title: "Adults with type 2 diabetes, Burgenland" },
  { step: 2, title: "Same, aged 40 or older" },
];

export function RedTeamResults({ redTeam }: { redTeam: RedTeam }) {
  return (
    <section aria-labelledby="differencing-title" className="@container">
      <div className="grid gap-px overflow-hidden rounded-lg border bg-border @xl:grid-cols-2 @4xl:grid-cols-3">
        <div className="bg-background p-4 @xl:col-span-2 @4xl:col-span-1">
          <h2 id="differencing-title" className="text-xs font-medium text-muted-foreground">
            Differencing attack
          </h2>
          <p className="mt-2 font-mono text-[15px] font-medium tabular-nums">33 − 32 = 1 patient</p>
          <p className="mt-2 text-[13px] leading-relaxed text-foreground/80">
            Two answers that are each safe on their own can reveal one patient when subtracted. The release
            ledger remembers what each applicant has received and withholds any value that would complete such
            a difference.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Run attack submits both requests as {RED_TEAM_ORGANISATION}.
          </p>
        </div>
        {SLOTS.map((slot) => (
          <RedTeamSlot key={slot.step} {...slot} redTeam={redTeam} />
        ))}
      </div>
    </section>
  );
}

function RedTeamSlot({ step, title, redTeam }: { step: RedTeamStep; title: string; redTeam: RedTeam }) {
  const latest = useLatestDecision(mutationKeys.redTeam(step));
  const requests = useRequests();
  const { resetAt, running, runStartedAt } = redTeam;
  const stale = latest !== undefined && resetAt !== null && latest.submittedAt < resetAt;
  const fromThisRun = latest !== undefined && runStartedAt !== null && latest.submittedAt >= runStartedAt;
  // Without a run in this tab, show the backend's earlier result for the same request.
  const earlier =
    resetAt === null ? requests.data?.find((result) => result.request_id === `RT-${step}`) : undefined;

  let body;
  if (step === 2 && running && !fromThisRun) {
    body = <p className="text-[13px] text-muted-foreground">Waiting for RT-1…</p>;
  } else if (latest?.status === "pending") {
    body = <PendingLine step={step} startedAt={latest.submittedAt} />;
  } else if (latest?.status === "error" && !stale) {
    body = <ErrorState title={`RT-${step} failed`} error={latest.error} />;
  } else if (latest?.status === "success" && latest.result && !stale) {
    body = <SlotResult result={latest.result} />;
  } else if (earlier) {
    body = <SlotResult result={earlier} note="From an earlier run" />;
  } else {
    body = (
      <p className="text-[13px] text-muted-foreground">
        {resetAt ? "Ledger reset · not run yet" : "Not run yet"}
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 bg-background p-4">
      <h3 className="text-xs font-medium text-muted-foreground">
        <span className="font-mono">RT-{step}</span> · {title}
      </h3>
      <div aria-live="polite" className="min-h-14">
        {body}
      </div>
    </div>
  );
}

function PendingLine({ step, startedAt }: { step: RedTeamStep; startedAt: number }) {
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
    <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
      Submitting RT-{step}…{" "}
      <span aria-hidden className="tabular-nums">
        {seconds} s
      </span>
    </p>
  );
}

function revealText(reason: string): string {
  const match = /would reveal (\d+ patients?)/i.exec(reason);
  return match?.[1] ? `would reveal ${match[1]}` : reason;
}

function SlotResult({ result, note }: { result: RequestResult; note?: string }) {
  const cell = result.statistics?.rows[0]?.cells[0];
  return (
    <div className="grid gap-2">
      {!cell ? (
        <p className="text-[13px] text-muted-foreground">No statistics released.</p>
      ) : cell.suppressed_by ? (
        <div title={cell.suppressed_by}>
          <p className="flex items-center gap-1.5 text-xl leading-7 font-medium text-destructive tabular-nums">
            <Lock role="img" aria-label="Withheld by the release ledger" className="size-4" />
            {formatValue(cell.shown, cell.kind)}
          </p>
          <p className="text-xs text-muted-foreground">Withheld — {revealText(cell.suppressed_by)}</p>
        </div>
      ) : isProtectedMarker(cell.shown) ? (
        <div className="flex h-7 items-center">
          <SmallCellBadge value={cell.shown} />
        </div>
      ) : (
        <div>
          <p className="text-xl leading-7 font-medium tabular-nums">{formatValue(cell.shown, cell.kind)}</p>
          <p className="text-xs text-muted-foreground">patients, released</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <DecisionBadge decision={result.decision} short />
        <span className="font-mono">{result.request_id}</span>
        {note ? <span>· {note}</span> : null}
      </div>
    </div>
  );
}
