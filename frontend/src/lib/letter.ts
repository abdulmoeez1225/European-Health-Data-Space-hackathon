import type { RequestResult } from "@/api/types";

import { messages } from "@/i18n/runtime";

import { articleTitle, refusalFor } from "./decisions";
import { formatValue } from "./format";
import { parseLegalLine } from "./legal";

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
  const m = messages();
  return result.articles.map((article) => {
    const detail = details.get(article);
    const label = (() => {
      switch (article) {
        case "53":
          if (assessment.allowed_purpose !== "none") {
            return m.basis.allowedPurpose(m.purposeShort[assessment.allowed_purpose]);
          }
          // A grant always rests on an allowed purpose, even when the AI did not name one.
          return result.decision === "REJECT"
            ? m.basis.noAllowedPurpose
            : (articleTitle("53") ?? m.regulation);
        case "54":
          return m.basis.prohibitedUse(m.prohibitedShort[assessment.prohibited_ground]);
        case "66":
          return assessment.records_justified ? m.basis.recordsJustified : m.basis.statisticsSuffice;
        case "67":
          return m.basis.applicationAssessed;
        case "68":
          return m.basis.permitRequired;
        case "69":
          return m.basis.anonymisedStatistics;
        case "71":
          return m.basis.optOutExcluded;
        case "73":
          return m.basis.secureOnly;
        default:
          return articleTitle(article) ?? (detail ? firstClause(detail) : m.regulation);
      }
    })();
    return { article, label, detail };
  });
}

/** One plain sentence (at most ~25 words) under the headline; the full reasoning is a disclosure. */
export function plainSentence(result: RequestResult): string {
  const m = messages();
  switch (result.decision) {
    case "REJECT":
      return refusalFor(result.assessment).text;
    case "APPROVE_SPE":
      return result.spe ? m.sentence.speWithCohort(formatValue(result.spe.cohort_size)) : m.sentence.spe;
    case "APPROVE_STATISTICAL":
      return m.sentence.statistics;
  }
}
