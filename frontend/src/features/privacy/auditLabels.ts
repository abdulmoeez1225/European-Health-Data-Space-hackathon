import type { AuditEvent, Decision } from "@/api/types";
import { decisionMeta } from "@/lib/decisions";
import { capitalise, humanise, plural } from "@/lib/format";

/**
 * Human names for audit events. The activity log filters by groups of event types; the API
 * filters by one exact type, so a group is fetched as one query per type and merged.
 */

export type AuditGroup = { key: string; label: string; types: string[] };
export type AuditFilterOption = AuditGroup & { count: number };
export type EventTone = "neutral" | "success" | "info" | "destructive" | "warning";

export const ALL_EVENTS = "all";

const GROUPS: AuditGroup[] = [
  { key: "decisions", label: "Decisions", types: ["decision"] },
  { key: "withdrawals", label: "Withdrawals", types: ["decision_withdrawn"] },
  { key: "workspaces", label: "Workspaces opened", types: ["spe_created"] },
  { key: "queries", label: "Workspace queries", types: ["spe_query"] },
  { key: "blocked-queries", label: "Blocked queries", types: ["spe_query_blocked"] },
  { key: "blocked-downloads", label: "Blocked downloads", types: ["download_blocked"] },
  { key: "airlock", label: "Airlock exports", types: ["airlock_released", "airlock_blocked"] },
  { key: "blocked-releases", label: "Blocked releases", types: ["ledger_blocked"] },
  { key: "admin", label: "Admin", types: ["ledger_reset", "spe_deleted"] },
];

const EVENT_LABELS: Record<string, string> = {
  decision: "Decision",
  decision_withdrawn: "Decision withdrawn",
  spe_created: "Workspace opened",
  spe_deleted: "Workspace deleted",
  spe_query: "Workspace query",
  spe_query_blocked: "Blocked query",
  download_blocked: "Blocked download",
  airlock_released: "Airlock export",
  airlock_blocked: "Blocked airlock export",
  ledger_blocked: "Blocked release",
  ledger_reset: "Ledger reset",
};

const ACTORS: Record<string, string> = {
  researcher: "Researcher",
  gatekeeper: "Gatekeeper (automatic)",
  staff: "Staff",
  system: "System",
};

/** The group an event type belongs to; unknown types form their own group. */
export function groupFor(type: string): AuditGroup {
  return (
    GROUPS.find((group) => group.types.includes(type)) ?? {
      key: `type:${type}`,
      label: humanise(type),
      types: [type],
    }
  );
}

/** "All" first, then the known groups in a fixed order, then unknown types; empty groups are left out. */
export function filterOptions(counts: Record<string, number>): AuditFilterOption[] {
  const options = new Map<string, AuditFilterOption>();
  for (const [type, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const group = groupFor(type);
    const existing = options.get(group.key);
    options.set(group.key, { ...group, count: (existing?.count ?? 0) + count });
  }
  const known = GROUPS.flatMap((group) => {
    const option = options.get(group.key);
    return option ? [option] : [];
  });
  const unknown = [...options.values()]
    .filter((option) => !GROUPS.some((group) => group.key === option.key))
    .sort((a, b) => a.label.localeCompare(b.label));
  const total = [...options.values()].reduce((sum, option) => sum + option.count, 0);
  return [{ key: ALL_EVENTS, label: "All", types: [], count: total }, ...known, ...unknown];
}

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? humanise(type);
}

export function eventTone(type: string): EventTone {
  if (type === "decision_withdrawn" || /reset|deleted/.test(type)) return "warning";
  if (/blocked/.test(type)) return "destructive";
  if (/released|created/.test(type)) return "success";
  if (type === "decision") return "info";
  return "neutral";
}

export function actorLabel(actor: string): string {
  return ACTORS[actor] ?? capitalise(humanise(actor));
}

const isDecision = (value: unknown): value is Decision =>
  value === "REJECT" || value === "APPROVE_STATISTICAL" || value === "APPROVE_SPE";

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(text).join(", ");
  if (value !== null && typeof value === "object") {
    return Object.entries(value)
      .map(([key, inner]) => `${humanise(key)} ${text(inner)}`)
      .join(", ");
  }
  return "";
}

function count(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function genericLine(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .filter(([, value]) => !(value !== null && typeof value === "object" && Object.keys(value).length === 0))
    .map(([key, value]) => `${humanise(key)}: ${text(value)}`)
    .join(" · ");
}

/** One concise line per event; the full detail stays available as the row's title. */
export function detailLine(event: Pick<AuditEvent, "event" | "detail">): string {
  const detail = event.detail ?? {};
  switch (event.event) {
    case "decision": {
      const parts = [
        isDecision(detail.decision) ? decisionMeta(detail.decision).label : text(detail.decision),
        Array.isArray(detail.articles) && detail.articles.length ? `Art. ${text(detail.articles)}` : "",
        text(detail.applicant),
        count(detail.review_flags) ? plural(count(detail.review_flags), "review flag") : "",
      ];
      return parts.filter(Boolean).join(" · ");
    }
    case "decision_withdrawn":
      return text(detail.reason) || "Withdrawn";
    case "spe_created": {
      const tables =
        detail.tables !== null && typeof detail.tables === "object" ? Object.keys(detail.tables) : [];
      return tables.length ? `Tables: ${tables.join(", ")}` : "Workspace created";
    }
    case "spe_query":
      return `${plural(count(detail.rows), "row")} · ${text(detail.sql)}`;
    case "spe_query_blocked":
    case "download_blocked":
      return capitalise(text(detail.reason));
    case "airlock_released":
      return `${plural(count(detail.rows), "row")} released, ${count(detail.suppressed_rows)} suppressed`;
    case "airlock_blocked":
      return capitalise(text(detail.reasons));
    case "ledger_blocked":
      return `${humanise(text(detail.metric))}: with ${text(detail.other_request_id)} it would reveal ${plural(count(detail.revealed_count), "patient")}`;
    default:
      return genericLine(detail);
  }
}

/** The full detail, for the row's tooltip. */
export function detailFull(event: Pick<AuditEvent, "detail">): string {
  return genericLine(event.detail ?? {});
}

/** Pages fetched per event type of a group, merged newest first and cut to the limit. */
export function mergePages(
  pages: { total: number; events: AuditEvent[] }[],
  limit: number,
): { total: number; events: AuditEvent[] } {
  const events = pages
    .flatMap((page) => page.events)
    .sort((a, b) => (b.time ?? "").localeCompare(a.time ?? ""))
    .slice(0, limit);
  return { total: pages.reduce((sum, page) => sum + page.total, 0), events };
}
