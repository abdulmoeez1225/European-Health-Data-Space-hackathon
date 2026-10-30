import type { ProhibitedGround, PurposeAssessment, RequestResult } from "@/api/types";

import { ARTICLE_TITLES, prohibitionFor } from "./decisions";
import { formatValue } from "./format";
import { parseLegalLine } from "./legal";

/** Short purpose names for one-line legal-basis rows (Art. 53). */
const PURPOSE_SHORT: Record<PurposeAssessment["allowed_purpose"], string> = {
  public_interest_public_health: "public health",
  policy_making_and_regulation: "policy-making",
  official_statistics: "official statistics",
  education_and_teaching: "education",
  scientific_research: "scientific research",
  product_and_algorithm_development: "algorithm development",
  improving_care: "improving care",
  none: "none recognised",
};

/** Short names of the prohibited uses (Art. 54). */
const PROHIBITED_SHORT: Record<ProhibitedGround, string> = {
  none: "unlawful or unethical use",
  detrimental_decisions: "decisions against individuals",
  employment_or_insurance_or_credit: "insurance, jobs or credit",
  advertising_or_marketing: "advertising",
  harmful_products: "harmful products",
  other_unlawful_or_unethical: "unlawful or unethical use",
};

const MAX_LABEL_WORDS = 6;

/** First clause of a legal-basis line, at most six words: the fallback label for an article. */
function firstClause(text: string): string {
  const clause = text.split(/[.:;–—(]/)[0]?.trim() ?? "";
  const words = clause.split(/\s+/).filter(Boolean);
  const label = words.slice(0, MAX_LABEL_WORDS).join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export type LegalBasisRow = { article: string; label: string; detail?: string };

/** One row per cited article: the chip and a label of at most six words. */
export function legalBasisRows(result: RequestResult): LegalBasisRow[] {
  const details = new Map<string, string>();
  for (const line of result.legal_basis) {
    const { article, text } = parseLegalLine(line);
    if (article && !details.has(article)) details.set(article, text);
  }
  const { assessment } = result;
  return result.articles.map((article) => {
    const detail = details.get(article);
    const label = (() => {
      switch (article) {
        case "53":
          return `Allowed purpose: ${PURPOSE_SHORT[assessment.allowed_purpose]}`;
        case "54":
          return `Prohibited use: ${PROHIBITED_SHORT[assessment.prohibited_ground]}`;
        case "66":
          return assessment.records_justified ? "Records justified" : "Statistics suffice, no records";
        case "67":
          return "Access application assessed";
        case "68":
          return "Data permit required";
        case "69":
          return "Answered as anonymised statistics";
        case "71":
          return "Opted-out patients excluded";
        case "73":
          return "Secure workspace only, no download";
        default:
          return detail ? firstClause(detail) : (ARTICLE_TITLES[article] ?? "Regulation (EU) 2025/327");
      }
    })();
    return { article, label, detail };
  });
}

/** One plain sentence (at most ~25 words) under the headline; the full reasoning is a disclosure. */
export function plainSentence(result: RequestResult): string {
  switch (result.decision) {
    case "REJECT":
      return prohibitionFor(result.assessment.prohibited_ground).text;
    case "APPROVE_SPE":
      return result.spe
        ? `Pseudonymised records of ${formatValue(result.spe.cohort_size)} patients were copied for you. You analyse them inside the workspace; nothing can be downloaded.`
        : "You may analyse pseudonymised records inside a secure workspace; nothing can be downloaded.";
    case "APPROVE_STATISTICAL":
      return "The numbers are anonymised: any group with fewer than 10 patients is hidden to protect privacy.";
  }
}
