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

export type Signature = { kind: "sign" | "override"; at: string };

type SignatureStore = {
  signatures: Record<string, Signature>;
  sign: (requestId: string, kind: Signature["kind"]) => void;
  undo: (requestId: string) => void;
};

const SignatureContext = createContext<SignatureStore | null>(null);

/** Staff sign-off is local UI state only; the backend has no endpoint for it. */
export function useSignatures(): SignatureStore {
  const store = useContext(SignatureContext);
  if (!store) throw new Error("useSignatures must be used inside <Providers>");
  return store;
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
  const [signatures, setSignatures] = useState<Record<string, Signature>>({});
  const [values, setValues] = useState<Record<string, unknown>>({});
  const setViewValue = useCallback((key: string, value: unknown) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);
  const viewState = useMemo(() => ({ values, set: setViewValue }), [values, setViewValue]);

  const sign = useCallback((requestId: string, kind: Signature["kind"]) => {
    setSignatures((current) => ({ ...current, [requestId]: { kind, at: new Date().toISOString() } }));
  }, []);
  const undo = useCallback((requestId: string) => {
    setSignatures((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => id !== requestId)),
    );
  }, []);
  const store = useMemo(() => ({ signatures, sign, undo }), [signatures, sign, undo]);

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <SignatureContext.Provider value={store}>
          <ViewStateContext.Provider value={viewState}>{children}</ViewStateContext.Provider>
        </SignatureContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
