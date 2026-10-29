import type { Decision, RequestResult } from "@/api/types";

import { readRequest } from "@/api/request";

export type RuleStep = {
  label: string;
  articles: string[];
  outcome: Decision;
  /** Whether the inputs the rule looks at hold for this request. */
  holds: boolean;
};

/**
 * The fixed decision order (docs/TRACK.md): the first rule that holds decides.
 * Inputs: the AI's purpose assessment and the form the applicant asked for.
 */
export function decisionLadder(result: RequestResult): { steps: RuleStep[]; firing: number } {
  const accessApplication = /access application/i.test(readRequest(result.request).requestedAs);
  const { prohibited, records_justified: justified } = result.assessment;
  const steps: RuleStep[] = [
    { label: "Prohibited purpose", articles: ["54"], outcome: "REJECT", holds: prohibited },
    {
      label: "Health data request",
      articles: ["53", "69"],
      outcome: "APPROVE_STATISTICAL",
      holds: !accessApplication,
    },
    {
      label: "Access application that explains why statistics are not enough",
      articles: ["53", "66", "68", "73"],
      outcome: "APPROVE_SPE",
      holds: accessApplication && justified,
    },
    {
      label: "Any other access application",
      articles: ["53", "66", "69"],
      outcome: "APPROVE_STATISTICAL",
      holds: true,
    },
  ];
  return { steps, firing: steps.findIndex((step) => step.holds) };
}
