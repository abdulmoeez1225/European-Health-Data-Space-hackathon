import { describe, expect, it } from "vitest";

import { burgenlandResult, r01Result } from "@/mock/data";
import { sampleRequest } from "@/test/render";

import { RED_TEAM_ORGANISATION, RED_TEAM_QUESTIONS, redTeamOutcome, redTeamRequest } from "./redteam";

const REASON = "differencing: combined with RT-1 (released 23:56) this would reveal 1 patient";

describe("redTeamOutcome (an ungrouped answer: one row without labels)", () => {
  it("reads the released number", () => {
    const outcome = redTeamOutcome(burgenlandResult(sampleRequest("R01"), 33, null));
    expect(outcome).toEqual({
      value: 33,
      kind: "count",
      metric: "type2_diabetes",
      withheld: false,
      revealed: null,
    });
  });

  it("marks a ledger-withheld answer and reads how many patients it would reveal", () => {
    const outcome = redTeamOutcome(burgenlandResult(sampleRequest("R01"), 32, REASON));
    expect(outcome?.value).toBe("<10");
    expect(outcome?.withheld).toBe(true);
    expect(outcome?.revealed).toBe(1);
  });

  it("returns nothing when no statistics were released", () => {
    expect(redTeamOutcome({ ...r01Result(sampleRequest("R01")), statistics: null })).toBeNull();
  });
});

describe("red-team requests", () => {
  it("asks the same question twice, the second narrowed to 40 or older", () => {
    expect(redTeamRequest(1).id).toBe("RT-1");
    expect(redTeamRequest(2).question).toMatch(/40 or older/);
    expect(RED_TEAM_QUESTIONS[1]).toContain(RED_TEAM_ORGANISATION);
    expect(RED_TEAM_QUESTIONS[2]).toMatch(/same applicant/);
  });
});
