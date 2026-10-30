import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { keys } from "@/api/queries";
import type { JsonObject, RequestResult, Withdrawal } from "@/api/types";
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
  client.setQueryData(keys.law, MOCK_LAW);

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
 * The result after staff withdrew it, as the API returns it: status "withdrawn", a withdrawal record,
 * released statistics and permit pulled, and no longer needing attention.
 */
export function withdrawn(result: RequestResult, withdrawal: Partial<Withdrawal> = {}): RequestResult {
  return {
    ...result,
    status: "withdrawn",
    needs_attention: false,
    statistics: null,
    spe: null,
    withdrawal: {
      reason: "Purpose needs an ethics vote.",
      withdrawn_at: "2026-10-29T18:45:00+01:00",
      released_data_withdrawn: Boolean(result.statistics ?? result.spe),
      ...withdrawal,
    },
  };
}
