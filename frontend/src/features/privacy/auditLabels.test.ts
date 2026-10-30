import { describe, expect, it } from "vitest";

import type { AuditEvent } from "@/api/types";

import {
  actorLabel,
  ALL_EVENTS,
  detailLine,
  eventLabel,
  eventTone,
  filterOptions,
  groupFor,
  mergePages,
} from "./auditLabels";

describe("groupFor", () => {
  it.each([
    ["decision", "Decisions"],
    ["decision_withdrawn", "Withdrawals"],
    ["spe_created", "Workspaces opened"],
    ["spe_query", "Workspace queries"],
    ["spe_query_blocked", "Blocked queries"],
    ["download_blocked", "Blocked downloads"],
    ["airlock_released", "Airlock exports"],
    ["airlock_blocked", "Airlock exports"],
    ["ledger_blocked", "Blocked releases"],
    ["ledger_reset", "Admin"],
    ["spe_deleted", "Admin"],
  ])("puts %s under %s", (type, label) => {
    expect(groupFor(type).label).toBe(label);
  });

  it("gives an unknown type its own readable group", () => {
    expect(groupFor("permit_renewed")).toEqual({
      key: "type:permit_renewed",
      label: "Permit renewed",
      types: ["permit_renewed"],
    });
  });
});

describe("filterOptions", () => {
  const counts = {
    decision: 307,
    decision_withdrawn: 4,
    spe_created: 31,
    download_blocked: 12,
    airlock_released: 6,
    airlock_blocked: 5,
    ledger_reset: 1,
    permit_renewed: 2,
    spe_query: 0,
  };

  it("starts with All, totalling every event", () => {
    expect(filterOptions(counts)[0]).toEqual({ key: ALL_EVENTS, label: "All", types: [], count: 368 });
  });

  it("sums the counts of the event types in a group", () => {
    const airlock = filterOptions(counts).find((option) => option.key === "airlock");
    expect(airlock?.count).toBe(11);
    expect(airlock?.types).toEqual(["airlock_released", "airlock_blocked"]);
  });

  it("keeps the fixed group order, drops empty groups and puts unknown types last", () => {
    expect(filterOptions(counts).map((option) => option.label)).toEqual([
      "All",
      "Decisions",
      "Withdrawals",
      "Workspaces opened",
      "Blocked downloads",
      "Airlock exports",
      "Admin",
      "Permit renewed",
    ]);
  });

  it("offers only All for an empty log", () => {
    expect(filterOptions({})).toEqual([{ key: ALL_EVENTS, label: "All", types: [], count: 0 }]);
  });
});

describe("eventLabel, eventTone and actorLabel", () => {
  it("names events in plain words", () => {
    expect(eventLabel("download_blocked")).toBe("Blocked download");
    expect(eventLabel("spe_created")).toBe("Workspace opened");
    expect(eventLabel("decision_withdrawn")).toBe("Decision withdrawn");
    expect(eventLabel("something_new")).toBe("Something new");
  });

  it("colours blocks red, releases green, withdrawals and admin amber", () => {
    expect(eventTone("download_blocked")).toBe("destructive");
    expect(eventTone("airlock_released")).toBe("success");
    expect(eventTone("decision_withdrawn")).toBe("warning");
    expect(eventTone("ledger_reset")).toBe("warning");
    expect(eventTone("decision")).toBe("info");
    expect(eventTone("spe_query")).toBe("neutral");
  });

  it("names the actors", () => {
    expect(actorLabel("researcher")).toBe("Researcher");
    expect(actorLabel("gatekeeper")).toBe("Gatekeeper (automatic)");
    expect(actorLabel("staff")).toBe("Staff");
    expect(actorLabel("system")).toBe("System");
    expect(actorLabel("data_officer")).toBe("Data officer");
  });
});

describe("detailLine", () => {
  it("summarises a decision in one line", () => {
    expect(
      detailLine({
        event: "decision",
        detail: {
          decision: "REJECT",
          articles: ["54"],
          applicant: "Alpenland Versicherung AG",
          review_flags: 1,
        },
      }),
    ).toMatch(/^.+ · Art\. 54 · Alpenland Versicherung AG · 1 review flag$/);
  });

  it("explains a blocked release with the request it was combined with", () => {
    expect(
      detailLine({
        event: "ledger_blocked",
        detail: { metric: "type2_diabetes", labels: {}, other_request_id: "RT-1", revealed_count: 1 },
      }),
    ).toBe("Type 2 diabetes: with RT-1 it would reveal 1 patient");
  });

  it("counts released and suppressed airlock rows", () => {
    expect(
      detailLine({ event: "airlock_released", detail: { sql: "SELECT …", rows: 16, suppressed_rows: 1 } }),
    ).toBe("16 rows released, 1 suppressed");
  });

  it("gives the reason of a block and of a withdrawal", () => {
    expect(detailLine({ event: "download_blocked", detail: { reason: "Art. 73: data stays inside" } })).toBe(
      "Art. 73: data stays inside",
    );
    expect(
      detailLine({
        event: "decision_withdrawn",
        detail: { decision: "APPROVE_SPE", reason: "Purpose unclear", released_data_withdrawn: true },
      }),
    ).toBe("Purpose unclear");
  });

  it("says only that a decision was withdrawn when no reason was recorded", () => {
    expect(detailLine({ event: "decision_withdrawn", detail: {} })).toBe("Withdrawn");
    expect(detailLine({ event: "decision_withdrawn", detail: { reason: "" } })).toBe("Withdrawn");
    expect(detailLine({ event: "decision_withdrawn" })).toBe("Withdrawn");
  });

  it("lists other details generically", () => {
    expect(detailLine({ event: "permit_renewed", detail: { until: "2027-01-01", tables: {} } })).toBe(
      "Until: 2027-01-01",
    );
  });
});

describe("mergePages", () => {
  const event = (id: string, time: string): AuditEvent => ({
    id,
    time,
    event: "airlock_released",
    actor: "researcher",
    subject: "permit-R05",
  });

  it("merges the pages of a group newest first and adds up their totals", () => {
    const merged = mergePages(
      [
        { total: 6, events: [event("a", "2026-10-30T10:00:00Z"), event("b", "2026-10-30T08:00:00Z")] },
        { total: 5, events: [event("c", "2026-10-30T09:00:00Z")] },
      ],
      2,
    );
    expect(merged.total).toBe(11);
    expect(merged.events.map((e) => e.id)).toEqual(["a", "c"]);
  });
});
