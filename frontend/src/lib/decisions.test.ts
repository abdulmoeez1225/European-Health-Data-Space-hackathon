import { describe, expect, it } from "vitest";

import type { Decision, ProhibitedGround } from "@/api/types";

import { DECISIONS, decisionMeta, prohibitionFor, purposeLabel, TONE_DOT } from "./decisions";

describe("decisionMeta", () => {
  it.each<[Decision, string, string]>([
    ["REJECT", "Rejected", "reject"],
    ["APPROVE_STATISTICAL", "Approved – statistics", "stats"],
    ["APPROVE_SPE", "Approved – secure environment", "spe"],
  ])("%s is labelled %s with tone %s", (decision, label, tone) => {
    const meta = decisionMeta(decision);
    expect(meta.label).toBe(label);
    expect(meta.tone).toBe(tone);
    expect(meta.headline).not.toBe("");
  });

  it.each<[Decision, string]>([
    ["REJECT", "Rejected"],
    ["APPROVE_STATISTICAL", "Statistics"],
    ["APPROVE_SPE", "Secure env."],
  ])("%s has the short label %s", (decision, short) => {
    expect(decisionMeta(decision).short).toBe(short);
  });

  it("separates the approval labels with an en dash", () => {
    expect(decisionMeta("APPROVE_STATISTICAL").label).toContain("–");
    expect(decisionMeta("APPROVE_SPE").label).toContain("–");
  });
});

describe("TONE_DOT", () => {
  it("gives every decision tone its own dot colour", () => {
    const dots = Object.values(DECISIONS).map((meta) => TONE_DOT[meta.tone]);
    expect(dots.every(Boolean)).toBe(true);
    expect(new Set(dots).size).toBe(dots.length);
  });
});

describe("prohibitionFor", () => {
  const unlawful = "Unlawful or unethical use";

  it("falls back to the generic text when no ground is given", () => {
    const prohibition = prohibitionFor("none");
    expect(prohibition.title).toBe(unlawful);
    expect(prohibition.text).not.toBe("");
    expect(prohibition.instead).not.toBe("");
  });

  it("uses the same generic text for other unlawful or unethical uses", () => {
    expect(prohibitionFor("other_unlawful_or_unethical")).toEqual(prohibitionFor("none"));
  });

  it.each<[ProhibitedGround, string]>([
    ["detrimental_decisions", "Decisions detrimental to individuals"],
    ["employment_or_insurance_or_credit", "Employment, insurance or credit decisions"],
    ["advertising_or_marketing", "Advertising and marketing"],
    ["harmful_products", "Developing harmful products"],
  ])("explains %s as %s", (ground, title) => {
    const prohibition = prohibitionFor(ground);
    expect(prohibition.title).toBe(title);
    expect(prohibition.instead).not.toBe(prohibitionFor("none").instead);
  });
});

describe("purposeLabel", () => {
  it("names the recognised purpose in plain words", () => {
    expect(purposeLabel("public_interest_public_health")).toBe("Public interest in public health");
    expect(purposeLabel("product_and_algorithm_development")).toBe("Developing products and algorithms");
    expect(purposeLabel("none")).toBe("None");
  });
});
