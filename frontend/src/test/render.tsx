import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { keys } from "@/api/queries";
import type { JsonObject, RequestResult, StaffAction } from "@/api/types";
import { Providers } from "@/app/providers";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MOCK_SAMPLES } from "@/mock/data";
import { MOCK_LAW } from "@/mock/law";

export type ProvidersRender = RenderResult & { client: QueryClient };

type RenderOptions = {
  /** Also wrap in the app's <Providers>, for components that keep their state in useViewState. */
  viewState?: boolean;
};

/**
 * Renders with the app's data and tooltip providers. The law query is pre-seeded
 * so article chips resolve titles from the cache instead of calling the API.
 * The test's own QueryClient sits inside <Providers>, so it is the one components use.
 */
export function renderWithProviders(
  ui: ReactElement,
  { viewState = false }: RenderOptions = {},
): ProvidersRender {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(keys.law("en"), MOCK_LAW);
  client.setQueryData(keys.law("de"), MOCK_LAW);

  function Wrapper({ children }: { children: ReactNode }) {
    const tree = (
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
      </QueryClientProvider>
    );
    return viewState ? <Providers>{tree}</Providers> : tree;
  }

  return Object.assign(render(ui, { wrapper: Wrapper }), { client });
}

/** One of the synthetic applicant requests behind the mock results, e.g. "R08". */
export function sampleRequest(id: string): JsonObject {
  const sample = MOCK_SAMPLES.find((candidate) => candidate.id === id);
  if (!sample) throw new Error(`No mock sample ${id}`);
  return sample;
}

/**
 * The result after staff withdrew a grant, as the API returns it: status "withdrawn", a staff action,
 * released statistics and permit pulled, and no longer needing attention.
 */
export function withdrawn(result: RequestResult, action: Partial<StaffAction> = {}): RequestResult {
  return {
    ...result,
    status: "withdrawn",
    needs_attention: false,
    statistics: null,
    spe: null,
    staff_action: {
      kind: "withdrawn",
      reason: "Purpose needs an ethics vote.",
      at: "2026-10-29T18:45:00+01:00",
      released_data_withdrawn: Boolean(result.statistics ?? result.spe),
      ...action,
    },
  };
}

/** The result after staff reopened a refusal: status "reopened", the refusal stays, nothing was released. */
export function reopened(result: RequestResult, action: Partial<StaffAction> = {}): RequestResult {
  return {
    ...result,
    status: "reopened",
    needs_attention: false,
    staff_action: {
      kind: "reopened",
      reason: "The purpose is covered by Art. 53.",
      at: "2026-10-29T18:45:00+01:00",
      released_data_withdrawn: false,
      ...action,
    },
  };
}

/** A records grant as decided: the workspace is prepared but locked until staff issue the permit. */
export function awaitingPermit(result: RequestResult): RequestResult {
  return { ...result, status: "awaiting_permit", needs_attention: true, staff_action: null };
}

/** The grant after staff issued its data permit, with the conditions the applicant reads. */
export function permitIssued(result: RequestResult, conditions = "Valid for 12 months."): RequestResult {
  return {
    ...result,
    status: "issued",
    needs_attention: false,
    staff_action: {
      kind: "permit_issued",
      reason: conditions,
      at: "2026-10-29T18:45:00+01:00",
      released_data_withdrawn: false,
    },
  };
}

/** An issued refusal the applicant asked to have reviewed; it needs attention until staff reopen it. */
export function appealed(
  result: RequestResult,
  reason = "Our purpose is public health research.",
): RequestResult {
  return { ...result, needs_attention: true, appeal: { reason, at: "2026-10-30T09:15:00+01:00" } };
}
