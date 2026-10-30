import { describe, expect, it } from "vitest";

import type { ProhibitedGround, PurposeAssessment, RequestResult } from "@/api/types";
import { burgenlandResult, r08Result, rejectResult, speResult } from "@/mock/data";
import { sampleRequest } from "@/test/render";

import { prohibitionFor } from "./decisions";
import { legalBasisRows, plainSentence } from "./letter";

const statistics = () => burgenlandResult(sampleRequest("R01"), 32, null);
const records = () => speResult(sampleRequest("R05"));
const refusal = () => rejectResult(sampleRequest("R02"));

function withArticles(result: RequestResult, articles: string[], legalBasis: string[] = []): RequestResult {
  return { ...result, articles, legal_basis: legalBasis };
}

function labelOf(result: RequestResult, article: string): string | undefined {
  return legalBasisRows(result).find((row) => row.article === article)?.label;
}

describe("legalBasisRows", () => {
  it("returns one row per cited article, in the order the decision cites them", () => {
    const rows = legalBasisRows(records());
    expect(rows.map((row) => row.article)).toEqual(["53", "66", "68", "73"]);
    expect(rows.map((row) => row.label)).toEqual([
      "Allowed purpose: algorithm development",
      "Records justified",
      "Data permit required",
      "Secure workspace only, no download",
    ]);
  });

  it("returns no rows when no article is cited", () => {
    expect(legalBasisRows(withArticles(statistics(), []))).toEqual([]);
  });

  describe("Art. 53", () => {
    it.each<[PurposeAssessment["allowed_purpose"], string]>([
      ["public_interest_public_health", "public health"],
      ["policy_making_and_regulation", "policy-making"],
      ["official_statistics", "official statistics"],
      ["education_and_teaching", "education"],
      ["scientific_research", "scientific research"],
      ["product_and_algorithm_development", "algorithm development"],
      ["improving_care", "improving care"],
      ["none", "none recognised"],
    ])("names the recognised purpose %s as %s", (purpose, name) => {
      const result = statistics();
      const assessed: RequestResult = {
        ...result,
        assessment: { ...result.assessment, allowed_purpose: purpose },
      };
      expect(labelOf(assessed, "53")).toBe(`Allowed purpose: ${name}`);
    });
  });

  describe("Art. 54", () => {
    it.each<[ProhibitedGround, string]>([
      ["detrimental_decisions", "decisions against individuals"],
      ["employment_or_insurance_or_credit", "insurance, jobs or credit"],
      ["advertising_or_marketing", "advertising"],
      ["harmful_products", "harmful products"],
      ["other_unlawful_or_unethical", "unlawful or unethical use"],
      ["none", "unlawful or unethical use"],
    ])("names the prohibited ground %s as %s", (ground, name) => {
      const result = refusal();
      const assessed: RequestResult = {
        ...result,
        assessment: { ...result.assessment, prohibited_ground: ground },
      };
      expect(labelOf(assessed, "54")).toBe(`Prohibited use: ${name}`);
    });
  });

  describe("Art. 66", () => {
    it("says the records are justified when the assessment justifies them", () => {
      expect(labelOf(records(), "66")).toBe("Records justified");
    });

    it("says statistics suffice when the records are not justified", () => {
      const result = records();
      const unjustified: RequestResult = {
        ...result,
        assessment: { ...result.assessment, records_justified: false },
      };
      expect(labelOf(unjustified, "66")).toBe("Statistics suffice, no records");
    });
  });

  it.each<[string, string]>([
    ["67", "Access application assessed"],
    ["68", "Data permit required"],
    ["69", "Answered as anonymised statistics"],
    ["71", "Opted-out patients excluded"],
    ["73", "Secure workspace only, no download"],
  ])("labels Art. %s as %s", (article, label) => {
    expect(labelOf(withArticles(statistics(), [article]), article)).toBe(label);
  });

  it("keeps every fixed label within six words", () => {
    const all = withArticles(records(), ["53", "54", "66", "67", "68", "69", "71", "73"]);
    for (const row of legalBasisRows(all)) {
      expect(row.label.split(/\s+/).length).toBeLessThanOrEqual(6);
    }
  });

  describe("unknown articles", () => {
    it("shortens the first clause of the legal-basis line to six words", () => {
      const result = withArticles(
        statistics(),
        ["99"],
        [
          "Art. 99 – processing of anonymised data by secondary users must respect confidentiality: see Art. 3.",
        ],
      );

      expect(labelOf(result, "99")).toBe("Processing of anonymised data by secondary");
    });

    it("stops at the first clause boundary when it has fewer than six words", () => {
      const result = withArticles(
        statistics(),
        ["99"],
        ["Art. 99 – Sharing is limited (see recital 12). More."],
      );

      expect(labelOf(result, "99")).toBe("Sharing is limited");
    });

    it("uses the regulation name when there is no legal-basis line", () => {
      expect(labelOf(withArticles(statistics(), ["99"]), "99")).toBe("Regulation (EU) 2025/327");
    });

    it("ignores legal-basis lines that cite another article", () => {
      const result = withArticles(
        statistics(),
        ["99"],
        ["Art. 53 – Scientific research is an allowed purpose."],
      );

      expect(labelOf(result, "99")).toBe("Regulation (EU) 2025/327");
    });
  });

  describe("detail", () => {
    it("carries the sentence of the matching legal-basis line", () => {
      const rows = legalBasisRows(statistics());

      expect(rows.find((row) => row.article === "53")?.detail).toBe(
        "Scientific research is an allowed purpose.",
      );
      expect(rows.find((row) => row.article === "69")?.detail).toBe("Answered as anonymised statistics.");
    });

    it("is missing for an article without a legal-basis line", () => {
      const result = withArticles(statistics(), ["53", "71"], ["Art. 53 – Scientific research is allowed."]);

      expect(legalBasisRows(result).map((row) => row.detail)).toEqual([
        "Scientific research is allowed.",
        undefined,
      ]);
    });

    it("keeps the first line when an article is explained twice", () => {
      const result = withArticles(
        statistics(),
        ["53"],
        ["Art. 53 – First reason.", "Art. 53 – Second reason."],
      );

      expect(legalBasisRows(result)[0]?.detail).toBe("First reason.");
    });

    it("skips lines that name no article", () => {
      const result = withArticles(statistics(), ["53"], ["The applicant is a university."]);

      expect(legalBasisRows(result)[0]?.detail).toBeUndefined();
    });
  });
});

describe("plainSentence", () => {
  it("explains the small-cell rule for statistics", () => {
    expect(plainSentence(statistics())).toBe(
      "The numbers are anonymised: any group with fewer than 10 patients is hidden to protect privacy.",
    );
    expect(plainSentence(r08Result(sampleRequest("R08")))).toContain("fewer than 10 patients");
  });

  it("names the exact patient count for secure access", () => {
    const sentence = plainSentence(records());

    expect(sentence).toContain("1,152 patients");
    expect(sentence).toBe(
      "Pseudonymised records of 1,152 patients were copied for you. You analyse them inside the workspace; nothing can be downloaded.",
    );
  });

  it("does not name a count when the permit is missing", () => {
    const sentence = plainSentence({ ...records(), spe: null });

    expect(sentence).toBe(
      "You may analyse pseudonymised records inside a secure workspace; nothing can be downloaded.",
    );
    expect(sentence).not.toMatch(/\d/);
  });

  it("states why a request was refused, from the prohibited ground", () => {
    expect(plainSentence(refusal())).toBe(prohibitionFor("employment_or_insurance_or_credit").text);
  });

  it("falls back to the generic prohibition when the AI names no ground", () => {
    const result = refusal();
    const ungrounded: RequestResult = {
      ...result,
      assessment: { ...result.assessment, prohibited_ground: "none" },
    };

    expect(plainSentence(ungrounded)).toBe(prohibitionFor("none").text);
  });

  it("stays short and never says approved, for every decision", () => {
    for (const result of [statistics(), records(), refusal()]) {
      const sentence = plainSentence(result);
      expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(30);
      expect(sentence).not.toMatch(/approved/i);
    }
  });
});
