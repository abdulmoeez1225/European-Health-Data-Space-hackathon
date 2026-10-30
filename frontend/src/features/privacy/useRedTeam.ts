"use client";

import { useState } from "react";

import { mutationKeys, useDecisionMutation, useLatestDecision } from "@/api/queries";
import { useViewState } from "@/app/providers";
import { redTeamRequest, type RedTeamStep } from "@/lib/redteam";

export const RED_TEAM_STEPS: RedTeamStep[] = [1, 2];

/**
 * Runs the differencing attack (RT-1 then RT-2). Rerunning needs no ledger reset: releasing the same
 * patients again reveals nothing new, so every run gets the same answers.
 */
export function useRedTeam() {
  const first = useDecisionMutation(mutationKeys.redTeam(1));
  const second = useDecisionMutation(mutationKeys.redTeam(2));
  const [runStartedAt, setRunStartedAt] = useViewState<number | null>("redTeam.runAt", null);
  const [sequencing, setSequencing] = useState(false);
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

  return {
    run,
    running,
    runStartedAt,
  };
}

export type RedTeam = ReturnType<typeof useRedTeam>;
