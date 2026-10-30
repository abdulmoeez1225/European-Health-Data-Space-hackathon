"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { ApiError } from "@/api/errors";
import { TooltipProvider } from "@/components/ui/tooltip";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: true,
        // 4xx answers are decisions (not found, blocked); retrying them only delays the message.
        retry: (count, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

type ViewState = { values: Record<string, unknown>; set: (key: string, value: unknown) => void };

const ViewStateContext = createContext<ViewState | null>(null);

/**
 * useState that survives navigating between pages (the layout stays mounted),
 * e.g. the request draft, the selected case or the red-team reset time.
 */
export function useViewState<T>(key: string, initial: T): [T, (value: T) => void] {
  const store = useContext(ViewStateContext);
  if (!store) throw new Error("useViewState must be used inside <Providers>");
  const { values, set } = store;
  const value = key in values ? (values[key] as T) : initial;
  const setValue = useCallback(
    (next: T) => {
      set(key, next);
    },
    [key, set],
  );
  return [value, setValue];
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const setViewValue = useCallback((key: string, value: unknown) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);
  const viewState = useMemo(() => ({ values, set: setViewValue }), [values, setViewValue]);

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ViewStateContext.Provider value={viewState}>{children}</ViewStateContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
