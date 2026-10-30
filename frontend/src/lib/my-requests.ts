import { useSyncExternalStore } from "react";

/**
 * Request ids submitted from this browser. There is no sign-in, so "my requests" and the
 * applicant's data permits are scoped to what this browser submitted.
 */
const KEY = "gatekeeper.myRequests";
const LIMIT = 50;
const NONE: string[] = [];
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedIds: string[] = NONE;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): string[] {
  if (!raw) return NONE;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : NONE;
  } catch {
    return NONE;
  }
}

function snapshot(): string[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedIds = parse(raw);
  }
  return cachedIds;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab submitting a request updates this one too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Most recent first; a resubmitted id moves to the top. */
export function rememberRequest(requestId: string): void {
  const ids = [requestId, ...snapshot().filter((id) => id !== requestId)].slice(0, LIMIT);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Without storage the request is still decided; it just is not listed later.
  }
  listeners.forEach((listener) => {
    listener();
  });
}

export function useMyRequestIds(): string[] {
  return useSyncExternalStore(subscribe, snapshot, () => NONE);
}
