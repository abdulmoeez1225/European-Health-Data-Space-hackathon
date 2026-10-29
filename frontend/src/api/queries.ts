import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { JsonObject, RequestResult } from "./types";

export const AUTO_REFRESH_MS = 5000;

export const keys = {
  health: ["health"] as const,
  law: ["law"] as const,
  samples: ["samples"] as const,
  requests: ["requests"] as const,
  request: (requestId: string) => ["requests", requestId] as const,
  spe: (permitId: string) => ["spe", permitId] as const,
  audit: ["audit"] as const,
  ledger: ["ledger"] as const,
};

export const mutationKeys = {
  submit: ["submit"] as const,
  redTeam: (step: number) => ["red-team", step] as const,
};

export const useHealth = () => useQuery({ queryKey: keys.health, queryFn: api.health, staleTime: 60_000 });

export const useLaw = () => useQuery({ queryKey: keys.law, queryFn: api.law, staleTime: Infinity });

export const useSamples = () =>
  useQuery({ queryKey: keys.samples, queryFn: api.samples, staleTime: Infinity });

export const useRequests = () => useQuery({ queryKey: keys.requests, queryFn: api.requests });

export const useRequestResult = (requestId: string | null) =>
  useQuery({
    queryKey: keys.request(requestId ?? ""),
    queryFn: () => api.request(requestId ?? ""),
    enabled: requestId !== null,
  });

export const useSpeInfo = (permitId: string | null) =>
  useQuery({
    queryKey: keys.spe(permitId ?? ""),
    queryFn: () => api.speInfo(permitId ?? ""),
    enabled: permitId !== null,
  });

export const useAudit = (live: boolean) =>
  useQuery({ queryKey: keys.audit, queryFn: api.audit, refetchInterval: live ? AUTO_REFRESH_MS : false });

export const useLedger = (live: boolean) =>
  useQuery({ queryKey: keys.ledger, queryFn: api.ledger, refetchInterval: live ? AUTO_REFRESH_MS : false });

/** Processing a request changes the request list, the ledger and the audit log. */
export function useInvalidateAfterDecision() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.requests }),
      client.invalidateQueries({ queryKey: keys.ledger }),
      client.invalidateQueries({ queryKey: keys.audit }),
    ]);
}

/** Submitting is keyed so the latest outcome survives navigating away and back. */
export function useDecisionMutation(mutationKey: readonly unknown[]) {
  const invalidate = useInvalidateAfterDecision();
  return useMutation({
    mutationKey,
    mutationFn: (request: JsonObject) => api.submit(request),
    // Not awaited: the decision is shown as soon as it arrives, lists refresh in the background.
    onSettled: () => {
      void invalidate();
    },
  });
}

export type DecisionAttempt = {
  status: "idle" | "pending" | "success" | "error";
  result: RequestResult | undefined;
  error: Error | null;
  submittedAt: number;
};

/** Latest state of a keyed decision mutation, shared by every component that shows it. */
export function useLatestDecision(mutationKey: readonly unknown[]): DecisionAttempt | undefined {
  const states = useMutationState({
    filters: { mutationKey, exact: true },
    select: (mutation): DecisionAttempt => ({
      status: mutation.state.status,
      result: mutation.state.data as RequestResult | undefined,
      error: mutation.state.error,
      submittedAt: mutation.state.submittedAt,
    }),
  });
  return states.at(-1);
}

export function useResetLedger() {
  const invalidate = useInvalidateAfterDecision();
  return useMutation({
    mutationFn: api.resetLedger,
    onSettled: () => {
      void invalidate();
    },
  });
}
