"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api } from "@/api/client";

/** The value after it has stopped changing for `delay` ms, so typing does not run a query per key. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettled(value);
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delay]);
  return settled;
}

/**
 * A read-only query inside the permit's environment. The data never changes, and every run is
 * written to the audit log, so results are kept rather than refetched.
 */
export function useSpeSql(permitId: string, sql: string | null) {
  return useQuery({
    queryKey: ["spe", permitId, "sql", sql],
    queryFn: () => api.speQuery(permitId, sql ?? ""),
    enabled: sql !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
}
