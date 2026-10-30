// In-memory fake of the Gatekeeper API for ?mock=1 / NEXT_PUBLIC_MOCK=1. Synthetic data only.
import type { Transport } from "@/api/client";
import { ApiError } from "@/api/errors";
import { isObject, readRequest } from "@/api/request";
import type {
  AirlockResult,
  AuditEvent,
  JsonObject,
  LedgerEvent,
  QueryResult,
  RequestResult,
} from "@/api/types";

import {
  ATC_COUNTS,
  burgenlandResult,
  MOCK_PERMIT,
  MOCK_SAMPLES,
  needsAttention,
  awaitingPermit,
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
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
  // R05's permit is already issued so the secure workspace can be explored right away.
  const permitted: RequestResult = {
    ...speResult(sample("R05")),
    needs_attention: false,
    staff_action: {
      kind: "permit_issued",
      reason: "Valid for 12 months. Only model weights and evaluation metrics leave through the airlock.",
      at: hoursAgo(0.5),
      released_data_withdrawn: false,
    },
  };
  const appealed: RequestResult = {
    ...rejectResult(sample("R02")),
    appeal: {
      reason:
        "We want population-level risk figures for actuarial research, not to price individual customers.",
      at: hoursAgo(0.25),
    },
  };
  [r01Result(sample("R01")), appealed, permitted].forEach((result, index, all) => {
    recordDecision({
      ...result,
      processed_at: hoursAgo(all.length - index),
      needs_attention: needsAttention(result),
    });
  });
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
  if (/access application/i.test(parsed.requestedAs) && justified) return awaitingPermit(speResult(request));
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
    return {
      columns: ["atc", "n"],
      rows: ATC_COUNTS.map(([atc, n]) => [atc, n]),
      truncated: false,
      truncated_cells: 0,
    };
  }
  const rows = Array.from({ length: 20 }, (_, i) => [
    `p-${(0x1a2b3c4d + i * 7919).toString(16).slice(-8)}`,
    i % 3 ? "E11.9" : "I10",
    i % 3 ? "Type 2 diabetes mellitus without complications" : "Essential (primary) hypertension",
    `20${15 + (i % 10)}-0${1 + (i % 9)}-1${i % 9}`,
  ]);
  return {
    columns: ["patient_id", "icd10", "description", "onset_date"],
    rows,
    truncated: false,
    truncated_cells: 0,
  };
}

function airlock(permit: string, body: unknown): AirlockResult {
  const request = isObject(body) ? body : {};
  const table = SPE_TABLES.find((candidate) => candidate.name === request.table);
  const groupBy = Array.isArray(request.group_by) ? request.group_by.map(String) : [];
  const allowed = table?.airlock_group_by ?? [];
  const reasons = !table
    ? [`table '${String(request.table)}' is not in this workspace`]
    : groupBy
        .filter((key) => !allowed.includes(key))
        .map((key) => `'${key}' cannot be grouped by; allowed: ${allowed.join(", ")}`);
  if (reasons.length || !groupBy.length) {
    audit("airlock_blocked", "researcher", permit, { request, reasons });
    return { status: "blocked", reasons, columns: [], rows: [] };
  }
  const atc = table?.name === "medications" && groupBy.join() === "atc";
  const rows = atc ? ATC_COUNTS.map(([code, n]) => [code, n < 10 ? "<10" : n]) : [];
  const suppressed = atc ? ATC_COUNTS.filter(([, n]) => n < 10).length : 0;
  audit("airlock_released", "researcher", permit, {
    request,
    rows: rows.length,
    suppressed_rows: suppressed,
  });
  return { status: "released", reasons: [], columns: [...groupBy, "n"], rows };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sqlOf(body: unknown): string {
  return isObject(body) && typeof body.sql === "string" ? body.sql : "";
}

function auditPage(search: URLSearchParams) {
  const limit = Number(search.get("limit") ?? 200);
  const event = search.get("event");
  const subject = search.get("subject");
  const counts: Record<string, number> = {};
  for (const entry of state.audit) counts[entry.event] = (counts[entry.event] ?? 0) + 1;
  const matching = [...state.audit]
    .reverse()
    .filter((entry) => (!event || entry.event === event) && (!subject || entry.subject === subject));
  return { total: matching.length, counts, events: matching.slice(0, limit) };
}

type CaseAction = "withdraw" | "reopen" | "issue-permit" | "appeal";

const AUDIT_EVENTS: Record<CaseAction, [event: string, actor: string]> = {
  withdraw: ["decision_withdrawn", "staff"],
  reopen: ["decision_reopened", "staff"],
  "issue-permit": ["permit_issued", "staff"],
  appeal: ["decision_appealed", "applicant"],
};

/** Why the action is not allowed on this decision, as the backend's 409 says it; null if it is. */
function conflict(found: RequestResult, action: CaseAction): string | null {
  const refusal = found.decision === "REJECT";
  switch (action) {
    case "withdraw":
      if (refusal) return "A refusal cannot be withdrawn; reopen it.";
      return found.status === "issued" || found.status === "awaiting_permit"
        ? null
        : "This decision was already actioned.";
    case "reopen":
      if (!refusal) return "Only refusals can be reopened.";
      return found.status === "issued" ? null : "This decision was already actioned.";
    case "issue-permit":
      return found.status === "awaiting_permit" ? null : "No data permit is waiting for this decision.";
    case "appeal":
      if (!refusal || found.status !== "issued") return "Only an issued refusal can be appealed.";
      return found.appeal ? "A review was already requested for this decision." : null;
  }
}

function applyAction(found: RequestResult, action: CaseAction, reason: string): RequestResult {
  const at = new Date().toISOString();
  switch (action) {
    case "appeal":
      return { ...found, appeal: { reason, at } };
    case "issue-permit":
      return {
        ...found,
        status: "issued",
        staff_action: { kind: "permit_issued", reason, at, released_data_withdrawn: false },
      };
    case "withdraw":
      return {
        ...found,
        statistics: null,
        spe: null,
        status: "withdrawn",
        staff_action: {
          kind: "withdrawn",
          reason,
          at,
          released_data_withdrawn: Boolean(found.statistics ?? found.spe),
        },
      };
    case "reopen":
      return {
        ...found,
        status: "reopened",
        staff_action: { kind: "reopened", reason, at, released_data_withdrawn: false },
      };
  }
}

/** Staff withdraw, reopen or issue a permit once; the applicant asks once for a review of a refusal. */
function caseAction(requestId: string, action: CaseAction, body: unknown): RequestResult {
  const found = state.results.find((r) => r.request_id === requestId);
  if (!found) throw new ApiError(404, `No processed request ${requestId}.`);
  const refused = conflict(found, action);
  if (refused) throw new ApiError(409, refused);
  const reason = isObject(body) && typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) throw new ApiError(422, "A reason is required.");
  const changed = applyAction(found, action, reason);
  const updated: RequestResult = { ...changed, needs_attention: needsAttention(changed) };
  state.results = state.results.map((r) => (r.request_id === requestId ? updated : r));
  const [event, actor] = AUDIT_EVENTS[action];
  audit(event, actor, requestId, { reason });
  return updated;
}

export const mockTransport: Transport = async (method, fullPath, body) => {
  const [path = "", query = ""] = fullPath.split("?");
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
  const actionPath = /^\/api\/requests\/([^/]+)\/(withdraw|reopen|issue-permit|appeal)$/.exec(path);
  if (actionPath && method === "POST") {
    return caseAction(decodeURIComponent(actionPath[1] ?? ""), actionPath[2] as CaseAction, body);
  }
  if (path === "/api/audit") return auditPage(new URLSearchParams(query));
  if (path === "/api/ledger") return state.ledger;
  if (spe) {
    const permit = decodeURIComponent(spe[1] ?? "");
    if (permit !== MOCK_PERMIT) throw new ApiError(404, permit);
    const owner = state.results.find((r) => r.spe?.permit_id === permit);
    if (owner?.status !== "issued") {
      throw new ApiError(403, "The data permit has not been issued yet; the secure workspace is locked.");
    }
    const action = spe[2];
    if (!action) return { permit_id: permit, tables: SPE_TABLES };
    if (action === "query") return runQuery(permit, sqlOf(body));
    if (action === "airlock") return airlock(permit, body);
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
