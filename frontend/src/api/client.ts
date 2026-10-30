import { ApiError } from "./errors";
import { isObject } from "./request";
import type {
  AirlockResult,
  AuditEvent,
  DownloadBlocked,
  JsonObject,
  LawResponse,
  LedgerEvent,
  LedgerResetResult,
  QueryResult,
  RequestResult,
  SpeInfo,
} from "./types";

export type Method = "GET" | "POST";

/** Transport used by every endpoint: the real backend or the in-memory mock. */
export type Transport = (method: Method, path: string, body?: unknown) => Promise<unknown>;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const MOCK_FLAG = "gatekeeper.mock";

function detailText(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{loc, msg, type}]
    return detail
      .map((d) => (isObject(d) && typeof d.msg === "string" ? d.msg : JSON.stringify(d)))
      .join("; ");
  }
  return detail == null ? fallback : JSON.stringify(detail);
}

export const httpTransport: Transport = async (method, path, body) => {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Cannot reach the Gatekeeper server. Is the backend running?");
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const payload = isObject(data) ? data : {};
    const auditId = typeof payload.audit_id === "string" ? payload.audit_id : null;
    throw new ApiError(response.status, detailText(payload.detail, `HTTP ${response.status}`), auditId);
  }
  return data;
};

function readMockFlag(): boolean {
  try {
    return window.sessionStorage.getItem(MOCK_FLAG) === "1";
  } catch {
    return false;
  }
}

/** `?mock=1` (kept for the browser tab) or NEXT_PUBLIC_MOCK=1 serves the in-memory fake API. */
export function isMockMode(): boolean {
  if (process.env.NEXT_PUBLIC_MOCK === "1") return true;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has("mock")) {
    const on = params.get("mock") !== "0";
    try {
      window.sessionStorage.setItem(MOCK_FLAG, on ? "1" : "0");
    } catch {
      // Storage may be unavailable (private mode); the query parameter still applies.
    }
    return on;
  }
  return readMockFlag();
}

let mockTransport: Promise<Transport> | null = null;

async function transport(): Promise<Transport> {
  if (!isMockMode()) return httpTransport;
  mockTransport ??= import("@/mock/mockApi").then((m) => m.mockTransport);
  return mockTransport;
}

async function call<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const send = await transport();
  // Responses follow the OpenAPI contract generated into schema.d.ts.
  return (await send(method, path, body)) as T;
}

const spePath = (permitId: string) => `/api/spe/${encodeURIComponent(permitId)}`;

export const api = {
  law: () => call<LawResponse>("GET", "/api/law"),
  samples: () => call<JsonObject[]>("GET", "/api/samples"),
  requests: () => call<RequestResult[]>("GET", "/api/requests"),
  request: (requestId: string) =>
    call<RequestResult>("GET", `/api/requests/${encodeURIComponent(requestId)}`),
  submit: (request: JsonObject) => call<RequestResult>("POST", "/api/requests", request),
  speInfo: (permitId: string) => call<SpeInfo>("GET", spePath(permitId)),
  speQuery: (permitId: string, sql: string) =>
    call<QueryResult>("POST", `${spePath(permitId)}/query`, { sql }),
  speAirlock: (permitId: string, sql: string) =>
    call<AirlockResult>("POST", `${spePath(permitId)}/airlock`, { sql }),
  /** The server always answers 403 (Art. 73); this resolves only if the block failed. */
  speDownload: (permitId: string) => call<DownloadBlocked>("GET", `${spePath(permitId)}/download`),
  audit: () => call<AuditEvent[]>("GET", "/api/audit"),
  ledger: () => call<LedgerEvent[]>("GET", "/api/ledger"),
  resetLedger: () => call<LedgerResetResult>("POST", "/api/ledger/reset"),
};
