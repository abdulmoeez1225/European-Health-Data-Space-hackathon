"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { mutationKeys, useDecisionMutation, useLatestDecision, useResetLedger } from "@/api/queries";
import { useViewState } from "@/app/providers";
import { redTeamRequest, type RedTeamStep } from "@/lib/redteam";

export const RED_TEAM_STEPS: RedTeamStep[] = [1, 2];

/** Runs the differencing attack (RT-1 then RT-2) and resets the release ledger. */
export function useRedTeam() {
  const first = useDecisionMutation(mutationKeys.redTeam(1));
  const second = useDecisionMutation(mutationKeys.redTeam(2));
  const reset = useResetLedger();
  const [resetAt, setResetAt] = useViewState<number | null>("redTeam.resetAt", null);
  const [runStartedAt, setRunStartedAt] = useViewState<number | null>("redTeam.runAt", null);
  const [sequencing, setSequencing] = useState(false);
  const mutationCache = useQueryClient().getMutationCache();
  // The attack outlives this page: read its state from the shared mutation cache, not this observer.
  const firstPending = useLatestDecision(mutationKeys.redTeam(1))?.status === "pending";
  const secondPending = useLatestDecision(mutationKeys.redTeam(2))?.status === "pending";
  const running = sequencing || firstPending || secondPending;

  const run = async () => {
    if (running) return;
    setSequencing(true);
    setRunStartedAt(Date.now());
    try {
      // Each step is one LLM call; a failed step stops the attack and its slot shows the error.
      for (const step of RED_TEAM_STEPS) {
        const mutation = step === 1 ? first : second;
        try {
          await mutation.mutateAsync(redTeamRequest(step));
        } catch {
          return;
        }
      }
    } finally {
      setSequencing(false);
    }
  };

  const resetLedger = () => {
    reset.mutate(undefined, {
      onSuccess: () => {
        // Earlier results must not reappear after navigating back.
        for (const step of RED_TEAM_STEPS) {
          mutationCache
            .findAll({ mutationKey: mutationKeys.redTeam(step), exact: true })
            .forEach((mutation) => {
              mutationCache.remove(mutation);
            });
        }
        first.reset();
        second.reset();
        setRunStartedAt(null);
        setResetAt(Date.now());
      },
    });
  };

  return {
    run,
    running,
    runStartedAt,
    resetLedger,
    resetting: reset.isPending,
    resetError: reset.isError ? reset.error : null,
    resetAt,
  };
}

export type RedTeam = ReturnType<typeof useRedTeam>;
