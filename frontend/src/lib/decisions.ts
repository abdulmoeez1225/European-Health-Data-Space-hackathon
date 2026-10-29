import type { Decision, ProhibitedGround } from "@/api/types";

export type DecisionTone = "reject" | "stats" | "spe";

export type DecisionMeta = { label: string; tone: DecisionTone; headline: string };

export const DECISIONS: Record<Decision, DecisionMeta> = {
  REJECT: {
    label: "Rejected",
    tone: "reject",
    headline: "Your request cannot be granted.",
  },
  APPROVE_STATISTICAL: {
    label: "Approved – statistics",
    tone: "stats",
    headline: "You receive anonymised statistics.",
  },
  APPROVE_SPE: {
    label: "Approved – secure environment",
    tone: "spe",
    headline: "You may analyse pseudonymised records in a secure environment.",
  },
};

export function decisionMeta(decision: Decision): DecisionMeta {
  return DECISIONS[decision];
}

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
