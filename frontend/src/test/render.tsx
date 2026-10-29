import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { keys } from "@/api/queries";
import type { JsonObject } from "@/api/types";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { MOCK_SAMPLES } from "@/mock/data";
import { MOCK_LAW } from "@/mock/law";

export type ProvidersRender = RenderResult & { client: QueryClient };

/**
 * Renders with the app's data and tooltip providers. The law query is pre-seeded
 * so article chips resolve titles from the cache instead of calling the API.
 */
export function renderWithProviders(ui: ReactElement): ProvidersRender {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(keys.law, MOCK_LAW);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
      </QueryClientProvider>
    );
  }

  return Object.assign(render(ui, { wrapper: Wrapper }), { client });
}

/** One of the synthetic applicant requests behind the mock results, e.g. "R08". */
export function sampleRequest(id: string): JsonObject {
  const sample = MOCK_SAMPLES.find((candidate) => candidate.id === id);
  if (!sample) throw new Error(`No mock sample ${id}`);
  return sample;
}
