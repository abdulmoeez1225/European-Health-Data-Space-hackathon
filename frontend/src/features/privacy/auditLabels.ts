import type { AuditEvent, Decision } from "@/api/types";
import { messages } from "@/i18n/runtime";
import { decisionMeta } from "@/lib/decisions";
import { capitalise, humanise } from "@/lib/format";

/**
 * Human names for audit events. The activity log filters by groups of event types; the API
 * filters by one exact type, so a group is fetched as one query per type and merged.
 */

export type AuditGroup = { key: string; label: string; types: string[] };
export type AuditFilterOption = AuditGroup & { count: number };
export type EventTone = "neutral" | "success" | "info" | "destructive" | "warning";

export const ALL_EVENTS = "all";

const GROUP_TYPES: { key: string; types: string[] }[] = [
  { key: "decisions", types: ["decision"] },
  { key: "withdrawals", types: ["decision_withdrawn"] },
  { key: "reopened", types: ["decision_reopened"] },
  { key: "workspaces", types: ["spe_created"] },
  { key: "queries", types: ["spe_query"] },
  { key: "blocked-queries", types: ["spe_query_blocked"] },
  { key: "blocked-downloads", types: ["download_blocked"] },
  { key: "airlock", types: ["airlock_released", "airlock_blocked"] },
  { key: "blocked-releases", types: ["ledger_blocked"] },
  { key: "admin", types: ["ledger_reset", "spe_deleted"] },
];

/** Labels are read at call time so they follow the interface language. */
function knownGroups(): AuditGroup[] {
  const labels = messages().privacy.labels.groups;
  return GROUP_TYPES.map((group) => ({ ...group, label: labels[group.key] ?? humanise(group.key) }));
}

/** The group an event type belongs to; unknown types form their own group. */
export function groupFor(type: string): AuditGroup {
  return (
    knownGroups().find((group) => group.types.includes(type)) ?? {
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
  const groups = knownGroups();
  const known = groups.flatMap((group) => {
    const option = options.get(group.key);
    return option ? [option] : [];
  });
  const unknown = [...options.values()]
    .filter((option) => !groups.some((group) => group.key === option.key))
    .sort((a, b) => a.label.localeCompare(b.label));
  const total = [...options.values()].reduce((sum, option) => sum + option.count, 0);
  return [
    { key: ALL_EVENTS, label: messages().privacy.labels.all, types: [], count: total },
    ...known,
    ...unknown,
  ];
}

export function eventLabel(type: string): string {
  return messages().privacy.labels.events[type] ?? humanise(type);
}

export function eventTone(type: string): EventTone {
  if (type === "decision_withdrawn" || /reset|deleted/.test(type)) return "warning";
  if (/blocked/.test(type)) return "destructive";
  if (/released|created/.test(type)) return "success";
  if (type === "decision" || type === "decision_reopened") return "info";
  return "neutral";
}

export function actorLabel(actor: string): string {
  return messages().privacy.labels.actors[actor] ?? capitalise(humanise(actor));
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
  const t = messages();
  const words = t.privacy.labels.detail;
  const detail = event.detail ?? {};
  switch (event.event) {
    case "decision": {
      const parts = [
        isDecision(detail.decision) ? decisionMeta(detail.decision).label : text(detail.decision),
        Array.isArray(detail.articles) && detail.articles.length ? `Art. ${text(detail.articles)}` : "",
        text(detail.applicant),
        count(detail.review_flags) ? t.common.reviewFlags(count(detail.review_flags)) : "",
      ];
      return parts.filter(Boolean).join(" · ");
    }
    case "decision_withdrawn":
      return text(detail.reason) || words.withdrawn;
    case "decision_reopened":
      return text(detail.reason) || words.reopened;
    case "spe_created": {
      const tables =
        detail.tables !== null && typeof detail.tables === "object" ? Object.keys(detail.tables) : [];
      return tables.length ? words.tables(tables.join(", ")) : words.workspaceCreated;
    }
    case "spe_query":
      return `${words.rows(count(detail.rows))} · ${text(detail.sql)}`;
    case "spe_query_blocked":
    case "download_blocked":
      return capitalise(text(detail.reason));
    case "airlock_released":
      return words.rowsReleased(words.rows(count(detail.rows)), count(detail.suppressed_rows));
    case "airlock_blocked":
      return capitalise(text(detail.reasons));
    case "ledger_blocked":
      return words.blockedRelease(
        humanise(text(detail.metric)),
        text(detail.other_request_id),
        t.privacy.blocked.patients(count(detail.revealed_count)),
      );
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
