// In-memory fake of the Gatekeeper API for ?mock=1 / NEXT_PUBLIC_MOCK=1. Synthetic data only.
import type { Transport } from "@/api/client";
import { ApiError } from "@/api/errors";
import { isObject, readRequest } from "@/api/request";
import type { AuditEvent, JsonObject, LedgerEvent, QueryResult, RequestResult } from "@/api/types";

import {
  ATC_COUNTS,
  burgenlandResult,
  MOCK_PERMIT,
  MOCK_SAMPLES,
  r01Result,
  r08Result,
  rejectResult,
  SPE_TABLES,
  speResult,
} from "./data";

type State = { results: RequestResult[]; ledger: LedgerEvent[]; audit: AuditEvent[] };

const state: State = { results: [], ledger: [], audit: [] };

function audit(
  event: string,
  actor: string,
  subject: string,
  detail: Record<string, unknown> = {},
): AuditEvent {
  const entry: AuditEvent = {
    id: Math.random().toString(16).slice(2, 14).padEnd(12, "0"),
    time: new Date().toISOString(),
    event,
    actor,
    subject,
    detail,
  };
  state.audit.push(entry);
  return entry;
}

function recordDecision(result: RequestResult): void {
  state.results = [result, ...state.results.filter((r) => r.request_id !== result.request_id)];
  audit("decision", "gatekeeper", result.request_id, {
    decision: result.decision,
    articles: result.articles,
    applicant: readRequest(result.request).applicant.organisation,
    review_flags: result.review_flags?.length ?? 0,
  });
}

function sample(id: string): JsonObject {
  const found = MOCK_SAMPLES.find((s) => s.id === id);
  if (!found) throw new Error(`mock sample ${id} missing`);
  return found;
}

function seed(): void {
  [r01Result(sample("R01")), rejectResult(sample("R02")), speResult(sample("R05"))].forEach(
    (result, index) => {
      result.processed_at = new Date(Date.now() - (3 - index) * 3_600_000).toISOString();
      recordDecision(result);
    },
  );
}
seed();

const isRedTeam = (request: JsonObject) =>
  readRequest(request).applicant.organisation.startsWith("Curious Analytics");
const isDifferencing = (request: JsonObject) => /\b40\b/.test(readRequest(request).question);

function decide(request: JsonObject): RequestResult {
  const parsed = readRequest(request);
  if (isRedTeam(request)) {
    const earlier = state.results.find((r) => isRedTeam(r.request) && !isDifferencing(r.request));
    if (isDifferencing(request) && earlier) {
      const time = new Date(earlier.processed_at).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const reason = `differencing: combined with ${earlier.request_id} (released ${time}) this would reveal 1 patient`;
      const result = burgenlandResult(request, 32, reason);
      state.ledger = state.ledger.filter((e) => e.request_id !== result.request_id);
      state.ledger.push({
        time: new Date().toISOString(),
        applicant_key: parsed.applicant.organisation.toLowerCase(),
        request_id: result.request_id,
        metric: "type2_diabetes",
        labels: {},
        other_request_id: earlier.request_id,
        revealed_count: 1,
      });
      audit("ledger_blocked", "system", result.request_id, {
        metric: "type2_diabetes",
        labels: {},
        other_request_id: earlier.request_id,
        revealed_count: 1,
      });
      return result;
    }
    return burgenlandResult(request, isDifferencing(request) ? 32 : 33, null);
  }
  const justified = /aggregates are not enough|individual-level/i.test(
    `${parsed.purpose} ${parsed.question}`,
  );
  if (/access application/i.test(parsed.requestedAs) && justified) return speResult(request);
  if (
    /insur|market|advert|nicotine|employee|credit|weapon/i.test(
      `${parsed.purpose} ${parsed.applicant.organisation}`,
    )
  ) {
    return rejectResult(request);
  }
  return parsed.id === "R08" ? r08Result(request) : r01Result(request);
}

const BLOCKED_SQL = /\b(copy|attach|export|install|load|pragma|create|insert|update|delete|drop)\b|read_csv/i;

function runQuery(permit: string, sql: string): QueryResult {
  if (BLOCKED_SQL.test(sql)) {
    const verb = /^\s*(\w+)/.exec(sql)?.[1]?.toUpperCase() ?? "this statement";
    const reason = `only SELECT is allowed inside the secure environment, not ${verb}`;
    audit("spe_query_blocked", "researcher", permit, { sql, reason });
    throw new ApiError(400, `Blocked: ${reason}`);
  }
  audit("spe_query", "researcher", permit, { sql, rows: 20 });
  if (/medications/i.test(sql) && /count/i.test(sql)) {
    return { columns: ["atc", "n"], rows: ATC_COUNTS.map(([atc, n]) => [atc, n]), truncated: false };
  }
  const rows = Array.from({ length: 20 }, (_, i) => [
    `p-${(0x1a2b3c4d + i * 7919).toString(16).slice(-8)}`,
    i % 3 ? "E11.9" : "I10",
    i % 3 ? "Type 2 diabetes mellitus without complications" : "Essential (primary) hypertension",
    `20${15 + (i % 10)}-0${1 + (i % 9)}-1${i % 9}`,
  ]);
  return { columns: ["patient_id", "icd10", "description", "onset_date"], rows, truncated: false };
}

function airlock(permit: string, sql: string) {
  try {
    runQuery(permit, sql);
  } catch (error) {
    const reasons = [error instanceof Error ? error.message.replace(/^Blocked:\s*/, "") : String(error)];
    audit("airlock_blocked", "researcher", permit, { sql, reasons });
    return { status: "blocked" as const, reasons, columns: [], rows: [] };
  }
  if (/patient_id\s*(,|from)/i.test(sql.replace(/count\(\s*distinct\s+patient_id\s*\)/gi, ""))) {
    const reasons = ["column 'patient_id' identifies patients"];
    audit("airlock_blocked", "researcher", permit, { sql, reasons });
    return { status: "blocked" as const, reasons, columns: [], rows: [] };
  }
  const rows = ATC_COUNTS.map(([atc, n]) => [atc, n < 10 ? "<10" : n]);
  const suppressed = ATC_COUNTS.filter(([, n]) => n < 10).length;
  audit("airlock_released", "researcher", permit, { sql, rows: rows.length, suppressed_rows: suppressed });
  return { status: "released" as const, reasons: [], columns: ["atc", "n"], rows };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sqlOf(body: unknown): string {
  return isObject(body) && typeof body.sql === "string" ? body.sql : "";
}

export const mockTransport: Transport = async (method, path, body) => {
  await delay(method === "POST" && path === "/api/requests" ? 6000 : 120);
  const spe = /^\/api\/spe\/([^/]+)(?:\/(query|download|airlock))?$/.exec(path);

  if (path === "/api/health") {
    return {
      status: "ok",
      llm_backend: "mock (offline)",
      patients: { total: 20000, eligible: 19161, opted_out: 839 },
    };
  }
  if (path === "/api/law") return (await import("./law")).MOCK_LAW;
  if (path === "/api/samples") return MOCK_SAMPLES;
  if (path === "/api/requests" && method === "POST") {
    if (!isObject(body) || !isObject(body.applicant) || !body.purpose) {
      throw new ApiError(422, "A request needs an applicant object and a purpose.");
    }
    const result = decide(body);
    recordDecision(result);
    return result;
  }
  if (path === "/api/requests") return state.results;
  const single = /^\/api\/requests\/([^/]+)$/.exec(path);
  if (single) {
    const found = state.results.find((r) => r.request_id === decodeURIComponent(single[1] ?? ""));
    if (!found) throw new ApiError(404, `No processed request ${single[1] ?? ""}.`);
    return found;
  }
  if (path === "/api/audit") return [...state.audit].reverse();
  if (path === "/api/ledger") return state.ledger;
  if (path === "/api/ledger/reset" && method === "POST") {
    state.ledger = [];
    audit("ledger_reset", "staff", "ledger");
    return { status: "ok" };
  }
  if (spe) {
    const permit = decodeURIComponent(spe[1] ?? "");
    if (permit !== MOCK_PERMIT) throw new ApiError(404, permit);
    const action = spe[2];
    if (!action) return { permit_id: permit, tables: SPE_TABLES };
    if (action === "query") return runQuery(permit, sqlOf(body));
    if (action === "airlock") return airlock(permit, sqlOf(body));
    const event = audit("download_blocked", "researcher", permit, {
      reason: "Art. 73: data stays inside the secure processing environment",
    });
    throw new ApiError(
      403,
      "Download blocked: data cannot leave the secure processing environment (Art. 73). Only anonymised results may be exported through the airlock.",
      event.id ?? null,
    );
  }
  throw new ApiError(404, `No mock for ${method} ${path}`);
};
