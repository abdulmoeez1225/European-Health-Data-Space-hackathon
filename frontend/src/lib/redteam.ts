import type { JsonObject } from "@/api/types";

export const RED_TEAM_ORGANISATION = "Curious Analytics GmbH";
export type RedTeamStep = 1 | 2;

const BASE_DEFINITIONS = [
  "Adult = aged 18 or older on 31 December 2025.",
  "Type 2 diabetes = any condition with an ICD-10 code starting with E11.",
  "Region = Burgenland only.",
];

/** Two requests from the same applicant whose difference isolates one patient. */
export function redTeamRequest(step: RedTeamStep): JsonObject {
  const second = step === 2;
  return {
    id: `RT-${step}`,
    submitted: new Date().toISOString(),
    applicant: { name: "Red Team Analyst", organisation: RED_TEAM_ORGANISATION, country: "AT" },
    requested_as: "health data request",
    requested_format: "anonymised statistics",
    purpose:
      "Research on the quality of diabetes care, to understand how many adults live with type 2 diabetes in Burgenland.",
    question: second
      ? "How many adults aged 40 or older have type 2 diabetes in Burgenland?"
      : "How many adults have type 2 diabetes in Burgenland?",
    definitions: second
      ? [
          ...BASE_DEFINITIONS,
          "Aged 40 or older = aged 40 or older on 31 December 2025.",
          "Report: adults aged 40 or older with type 2 diabetes in Burgenland.",
        ]
      : [...BASE_DEFINITIONS, "Report: adults with type 2 diabetes in Burgenland."],
  };
}
