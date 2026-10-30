import { ApiError } from "./errors";
import { isObject } from "./request";
import type {
  AirlockResult,
  AuditPage,
  JsonObject,
  LawResponse,
  LedgerEvent,
  QueryResult,
  RequestResult,
  SpeInfo,
} from "./types";
import type { components } from "./schema";

export type AirlockRequest = components["schemas"]["AirlockRequest"];

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

const requestPath = (requestId: string) => `/api/requests/${encodeURIComponent(requestId)}`;
const spePath = (permitId: string) => `/api/spe/${encodeURIComponent(permitId)}`;

export type AuditQuery = { limit: number; event?: string; subject?: string };

function auditParams({ limit, event, subject }: AuditQuery): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (event) params.set("event", event);
  if (subject) params.set("subject", subject);
  return params.toString();
}

export const api = {
  law: (lang: string) => call<LawResponse>("GET", `/api/law?lang=${encodeURIComponent(lang)}`),
  samples: () => call<JsonObject[]>("GET", "/api/samples"),
  requests: () => call<RequestResult[]>("GET", "/api/requests"),
  request: (requestId: string) => call<RequestResult>("GET", requestPath(requestId)),
  submit: (request: JsonObject) => call<RequestResult>("POST", "/api/requests", request),
  /** Grants only, issued or awaiting a permit; the server answers 409 for refusals and actioned decisions. */
  withdraw: (requestId: string, reason: string) =>
    call<RequestResult>("POST", `${requestPath(requestId)}/withdraw`, { reason }),
  /** Refusals only: set aside for manual reconsideration. */
  reopen: (requestId: string, reason: string) =>
    call<RequestResult>("POST", `${requestPath(requestId)}/reopen`, { reason }),
  /** Unlocks the secure workspace of a records grant awaiting its permit; the reason holds the conditions. */
  issuePermit: (requestId: string, reason: string) =>
    call<RequestResult>("POST", `${requestPath(requestId)}/issue-permit`, { reason }),
  /** The applicant asks the access body to review an issued refusal, once. */
  appeal: (requestId: string, reason: string) =>
    call<RequestResult>("POST", `${requestPath(requestId)}/appeal`, { reason }),
  speInfo: (permitId: string) => call<SpeInfo>("GET", spePath(permitId)),
  speQuery: (permitId: string, sql: string) =>
    call<QueryResult>("POST", `${spePath(permitId)}/query`, { sql }),
  /** The airlock takes no SQL: it counts patients per allowlisted group itself and suppresses small cells. */
  speAirlock: (permitId: string, request: AirlockRequest) =>
    call<AirlockResult>("POST", `${spePath(permitId)}/airlock`, request),
  audit: (query: AuditQuery) => call<AuditPage>("GET", `/api/audit?${auditParams(query)}`),
  ledger: () => call<LedgerEvent[]>("GET", "/api/ledger"),
};
