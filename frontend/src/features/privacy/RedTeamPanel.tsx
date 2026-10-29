"use client";

import { Crosshair, Play, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { errorMessage } from "@/api/errors";
import {
  mutationKeys,
  useDecisionMutation,
  useLatestDecision,
  useRequests,
  useResetLedger,
} from "@/api/queries";
import { DecisionLetter } from "@/components/letter/DecisionLetter";
import { useViewState } from "@/app/providers";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { RED_TEAM_ORGANISATION, redTeamRequest, type RedTeamStep } from "@/lib/redteam";

const SLOTS: { step: RedTeamStep; title: string; question: string }[] = [
  { step: 1, title: "Request 1 · baseline", question: "Adults with type 2 diabetes in Burgenland" },
  { step: 2, title: "Request 2 · differencing", question: "The same, aged 40 or older" },
];

export function RedTeamPanel() {
  const first = useDecisionMutation(mutationKeys.redTeam(1));
  const second = useDecisionMutation(mutationKeys.redTeam(2));
  const reset = useResetLedger();
  const [resetAt, setResetAt] = useViewState<number | null>("redTeam.resetAt", null);
  const mutationCache = useQueryClient().getMutationCache();
  const running = first.isPending || second.isPending;

  const runSteps = async (steps: RedTeamStep[]) => {
    for (const step of steps) {
      const mutation = step === 1 ? first : second;
      try {
        await mutation.mutateAsync(redTeamRequest(step));
      } catch {
        return; // the slot shows the error
      }
    }
  };

  return (
    <Section
      headingLevel={2}
      title="Red team"
      icon={<Crosshair />}
      description={`Submit the two attack requests as the same applicant (${RED_TEAM_ORGANISATION}) and watch the ledger intervene.`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={running} onClick={() => void runSteps([1])}>
          1 · Baseline request
        </Button>
        <Button disabled={running} onClick={() => void runSteps([2])}>
          2 · Differencing request (40+)
        </Button>
        <Button
          variant="primary"
          icon={<Play aria-hidden className="size-4" />}
          disabled={running}
          onClick={() => void runSteps([1, 2])}
        >
          Run both in sequence
        </Button>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw aria-hidden className="size-3.5" />}
          loading={reset.isPending}
          disabled={running}
          onClick={() => {
            reset.mutate(undefined, {
              onSuccess: () => {
                // Drop earlier results from the cache so they do not reappear after navigating back.
                for (const step of [1, 2]) {
                  mutationCache
                    .findAll({ mutationKey: mutationKeys.redTeam(step), exact: true })
                    .forEach((m) => {
                      mutationCache.remove(m);
                    });
                }
                first.reset();
                second.reset();
                setResetAt(Date.now());
              },
            });
          }}
        >
          Reset ledger
        </Button>
      </div>
      {reset.isError ? (
        <Banner tone="error" title="Could not reset the ledger" className="mt-4" live>
          {errorMessage(reset.error)}
        </Banner>
      ) : null}
      <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">
        {SLOTS.map((slot) => (
          <RedTeamSlot key={slot.step} {...slot} resetAt={resetAt} />
        ))}
      </div>
    </Section>
  );
}

function RedTeamSlot({
  step,
  title,
  question,
  resetAt,
}: {
  step: RedTeamStep;
  title: string;
  question: string;
  resetAt: number | null;
}) {
  const latest = useLatestDecision(mutationKeys.redTeam(step));
  const stale = latest && resetAt !== null && latest.submittedAt < resetAt;
  // Without a run in this browser, show the backend's earlier result for the same request.
  const requests = useRequests();
  const earlier = resetAt === null ? requests.data?.find((r) => r.request_id === `RT-${step}`) : undefined;

  return (
    <div className="min-w-0">
      <p className="mb-2 text-sm font-semibold">
        {title} <span className="font-normal text-muted">— {question}</span>
      </p>
      {(!latest || latest.status === "idle") && earlier ? (
        <>
          <DecisionLetter result={earlier} compact />
          <p className="mt-2 text-xs text-muted">
            From an earlier run. Run the requests again to replay the attack.
          </p>
        </>
      ) : !latest || stale || latest.status === "idle" ? (
        <EmptyState title={resetAt ? "Ledger reset" : "Not submitted yet"} className="py-8">
          The result for request {step} appears here.
        </EmptyState>
      ) : latest.status === "pending" ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-5 py-8 text-muted"
        >
          <span className="size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Submitting request {step}… (5–30 s)
        </div>
      ) : latest.status === "error" ? (
        <ErrorState title={`Request ${step} failed`} error={latest.error} />
      ) : latest.result ? (
        <DecisionLetter result={latest.result} compact />
      ) : null}
    </div>
  );
}
