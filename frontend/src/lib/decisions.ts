import type { Decision, ProhibitedGround, PurposeAssessment } from "@/api/types";

export type DecisionTone = "reject" | "stats" | "spe";

export type DecisionMeta = { label: string; short: string; tone: DecisionTone; headline: string };

export const DECISIONS: Record<Decision, DecisionMeta> = {
  REJECT: {
    label: "Rejected",
    short: "Rejected",
    tone: "reject",
    headline: "Your request cannot be granted.",
  },
  APPROVE_STATISTICAL: {
    label: "Approved – statistics",
    short: "Statistics",
    tone: "stats",
    headline: "You receive anonymised statistics.",
  },
  APPROVE_SPE: {
    label: "Approved – secure environment",
    short: "Secure env.",
    tone: "spe",
    headline: "You may analyse pseudonymised records in a secure environment.",
  },
};

export function decisionMeta(decision: Decision): DecisionMeta {
  return DECISIONS[decision];
}

/** Status colour of a decision, used for its dot. */
export const TONE_DOT: Record<DecisionTone, string> = {
  reject: "bg-destructive",
  stats: "bg-success",
  spe: "bg-info",
};

/** Fallback titles until /api/law has loaded. */
export const ARTICLE_TITLES: Record<string, string> = {
  "53": "Purposes of secondary use",
  "54": "Prohibited secondary use",
  "66": "Data minimisation and purpose limitation",
  "67": "Health data access applications",
  "68": "Data permits",
  "69": "Health data requests",
  "71": "Right to opt out",
  "73": "Secure processing environment",
};

export const EUR_LEX_URL = "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng";

export type Prohibition = { title: string; text: string; instead: string };

const OTHER: Prohibition = {
  title: "Unlawful or unethical use",
  text: "The stated use conflicts with Union or national law or with ethical requirements.",
  instead: "Clarify the purpose and its legal basis. A narrower, lawful question may be approved.",
};

const PROHIBITIONS: Record<Exclude<ProhibitedGround, "none">, Prohibition> = {
  detrimental_decisions: {
    title: "Decisions detrimental to individuals",
    text: "Health data must not be used to take decisions that harm the persons it describes.",
    instead:
      "Describe a population-level purpose, such as planning or research, where no decision is made about any individual.",
  },
  employment_or_insurance_or_credit: {
    title: "Employment, insurance or credit decisions",
    text: "Health data must not be used to decide on jobs, insurance terms or credit, or to exclude people from them.",
    instead:
      "Resubmit with a purpose such as public health research or policy-making, and ask for anonymised statistics that are not linked to your customers or staff.",
  },
  advertising_or_marketing: {
    title: "Advertising and marketing",
    text: "Health data must not be used for advertising, marketing or profiling for commercial promotion.",
    instead:
      "Use a permitted purpose, for example a published epidemiological study. Market sizing for products cannot be supported.",
  },
  harmful_products: {
    title: "Developing harmful products",
    text: "Health data must not be used to develop products or services that harm individuals or society, such as tobacco, alcohol or weapons.",
    instead: "Focus on prevention or care improvement, or apply for a purpose that serves public health.",
  },
  other_unlawful_or_unethical: OTHER,
};

export function prohibitionFor(ground: ProhibitedGround): Prohibition {
  return ground === "none" ? OTHER : PROHIBITIONS[ground];
}

const PURPOSES: Record<PurposeAssessment["allowed_purpose"], string> = {
  public_interest_public_health: "Public interest in public health",
  policy_making_and_regulation: "Policy-making and regulation",
  official_statistics: "Official statistics",
  education_and_teaching: "Education and teaching",
  scientific_research: "Scientific research",
  product_and_algorithm_development: "Developing products and algorithms",
  improving_care: "Improving care",
  none: "None",
};

/** The Art. 53 purpose the AI recognised, in plain words. */
export function purposeLabel(purpose: PurposeAssessment["allowed_purpose"]): string {
  return PURPOSES[purpose];
}
