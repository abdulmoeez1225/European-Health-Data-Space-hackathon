import type { Decision, ProhibitedGround, PurposeAssessment } from "@/api/types";
import { messages } from "@/i18n/runtime";

export type DecisionTone = "reject" | "stats" | "spe";

export type DecisionMeta = { label: string; short: string; tone: DecisionTone; headline: string };

const TONES: Record<Decision, DecisionTone> = {
  REJECT: "reject",
  APPROVE_STATISTICAL: "stats",
  APPROVE_SPE: "spe",
};

/**
 * What the applicant gets, issued at once, in the active language. Never "approved": staff do not
 * approve decisions, they are alerted when the AI was unsure and can withdraw one.
 */
export function decisionMeta(decision: Decision): DecisionMeta {
  return { ...messages().decision[decision], tone: TONES[decision] };
}

export const DECISIONS: Record<Decision, DecisionMeta> = {
  get REJECT() {
    return decisionMeta("REJECT");
  },
  get APPROVE_STATISTICAL() {
    return decisionMeta("APPROVE_STATISTICAL");
  },
  get APPROVE_SPE() {
    return decisionMeta("APPROVE_SPE");
  },
};

/** Status colour of a decision: its dot, and its badge tint. */
export const TONE_DOT: Record<DecisionTone, string> = {
  reject: "bg-destructive",
  stats: "bg-success",
  spe: "bg-info",
};

export const TONE_BADGE: Record<DecisionTone, "destructive" | "success" | "info"> = {
  reject: "destructive",
  stats: "success",
  spe: "info",
};

/** Fallback titles until /api/law has loaded, in the active language. */
export function articleTitle(article: string): string | undefined {
  return messages().articleTitles[article];
}

export const EUR_LEX_URL = "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng";

export type Prohibition = { title: string; text: string; instead: string };

export function prohibitionFor(ground: ProhibitedGround): Prohibition {
  const prohibitions = messages().prohibitions;
  return ground === "none" || ground === "other_unlawful_or_unethical"
    ? prohibitions.other
    : prohibitions[ground];
}

/** Why a request was refused: a prohibited use (Art. 54), or no allowed purpose at all (Art. 53). */
export function refusalFor(assessment: PurposeAssessment): Prohibition {
  if (!assessment.prohibited && assessment.allowed_purpose === "none") return messages().noAllowedPurpose;
  return prohibitionFor(assessment.prohibited_ground);
}

/** The Art. 53 purpose the AI recognised, in plain words. */
export function purposeLabel(purpose: PurposeAssessment["allowed_purpose"]): string {
  return messages().purposes[purpose];
}
