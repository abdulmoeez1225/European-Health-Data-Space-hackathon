import { describe, expect, it } from "vitest";

import type { RequestResult } from "@/api/types";
import { burgenlandResult, r01Result, r08Result, rejectResult, speResult } from "@/mock/data";
import { sampleRequest } from "@/test/render";

import { decisionLadder } from "./rules";

function ladderFor(result: RequestResult) {
  const { steps, firing } = decisionLadder(result);
  return { steps, firing, fired: steps[firing] };
}

describe("decisionLadder", () => {
  it("lists the four rules in their fixed order", () => {
    const { steps } = decisionLadder(r01Result(sampleRequest("R01")));
    expect(steps.map((step) => step.outcome)).toEqual([
      "REJECT",
      "APPROVE_STATISTICAL",
      "APPROVE_SPE",
      "APPROVE_STATISTICAL",
    ]);
    expect(steps.map((step) => step.articles)).toEqual([
      ["54"],
      ["53", "69"],
      ["53", "66", "68", "73"],
      ["53", "66", "69"],
    ]);
  });

  it("fires the prohibited-purpose rule first for the rejected request", () => {
    const { steps, firing, fired } = ladderFor(rejectResult(sampleRequest("R02")));
    expect(firing).toBe(0);
    expect(fired?.label).toBe("Prohibited purpose");
    expect(steps[0]?.holds).toBe(true);
  });

  it("fires the health-data-request rule for statistics answers", () => {
    for (const result of [r01Result(sampleRequest("R01")), r08Result(sampleRequest("R08"))]) {
      const { steps, firing, fired } = ladderFor(result);
      expect(firing).toBe(1);
      expect(fired?.label).toBe("Health data request");
      expect(steps[0]?.holds).toBe(false);
    }
  });

  it("fires the justified-access-application rule for the secure environment", () => {
    const { steps, firing, fired } = ladderFor(speResult(sampleRequest("R05")));
    expect(firing).toBe(2);
    expect(fired?.outcome).toBe("APPROVE_SPE");
    expect(steps.map((step) => step.holds)).toEqual([false, false, true, true]);
  });

  it("agrees with the recorded decision for every mock result", () => {
    const results = [
      rejectResult(sampleRequest("R02")),
      r01Result(sampleRequest("R01")),
      r08Result(sampleRequest("R08")),
      speResult(sampleRequest("R05")),
      burgenlandResult(sampleRequest("R01"), 32, null),
    ];
    for (const result of results) {
      expect(ladderFor(result).fired?.outcome).toBe(result.decision);
    }
  });

  it("falls through to statistics for an access application that does not justify records", () => {
    const result = speResult(sampleRequest("R05"));
    const unjustified: RequestResult = {
      ...result,
      assessment: { ...result.assessment, records_justified: false },
    };
    const { firing, fired } = ladderFor(unjustified);
    expect(firing).toBe(3);
    expect(fired?.label).toBe("Any other access application");
    expect(fired?.outcome).toBe("APPROVE_STATISTICAL");
  });

  it("lets a prohibited purpose win even for a justified access application", () => {
    const result = speResult(sampleRequest("R05"));
    const prohibited: RequestResult = {
      ...result,
      assessment: { ...result.assessment, prohibited: true, prohibited_ground: "advertising_or_marketing" },
    };
    expect(decisionLadder(prohibited).firing).toBe(0);
  });

  it("treats a request without a stated form as a health data request", () => {
    const result = r01Result({ id: "X1", purpose: "Research." });
    expect(decisionLadder(result).firing).toBe(1);
  });
});
