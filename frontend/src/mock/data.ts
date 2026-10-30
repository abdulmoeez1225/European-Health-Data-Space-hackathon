// Synthetic mock data for ?mock=1. Numbers follow requests/expected.json.
import type { JsonObject, PrivacyCheck, QueryPlan, ReleasedRow, RequestResult, SpeTable } from "@/api/types";

export const REGIONS = [
  "Burgenland",
  "Kärnten",
  "Niederösterreich",
  "Oberösterreich",
  "Salzburg",
  "Steiermark",
  "Tirol",
  "Vorarlberg",
  "Wien",
] as const;
type Region = (typeof REGIONS)[number];

export { MOCK_SAMPLES } from "./samples";

const R01_DATA: Record<Region, [number, number, number]> = {
  Burgenland: [532, 33, 6.2],
  Kärnten: [885, 71, 8.0],
  Niederösterreich: [2740, 227, 8.3],
  Oberösterreich: [2473, 173, 7.0],
  Salzburg: [908, 75, 8.3],
  Steiermark: [2052, 164, 8.0],
  Tirol: [1240, 110, 8.9],
  Vorarlberg: [639, 36, 5.6],
  Wien: [3247, 263, 8.1],
};

const R08_DATA: Record<Region, [number | string, number | string]> = {
  Burgenland: ["<10", "suppressed"],
  Kärnten: ["<10", "suppressed"],
  Niederösterreich: [15, 27.2],
  Oberösterreich: [11, 27.5],
  Salzburg: ["<10", "suppressed"],
  Steiermark: [13, 26.3],
  Tirol: ["<10", "suppressed"],
  Vorarlberg: ["<10", "suppressed"],
  Wien: [14, 26.6],
};

export const STANDARD_CHECKS: PrivacyCheck[] = [
  {
    name: "Opted-out patients excluded (Art. 71)",
    passed: true,
    detail: "839 opted-out patients; 0 found in any released value.",
  },
  {
    name: "Small-cell rule",
    passed: true,
    detail: "Counts under 10 shown as <10; percentages and means over fewer than 10 patients suppressed.",
  },
  {
    name: "No patient-level data",
    passed: true,
    detail: "Only aggregate values and group labels are released.",
  },
  { name: "Every requested group shown", passed: true, detail: "9 of 9 groups, including empty ones." },
  {
    name: "Release ledger (differencing)",
    passed: true,
    detail: "No combination with earlier releases to this applicant reveals a group below 10.",
  },
];

const RESEARCH_ASSESSMENT = {
  prohibited: false,
  prohibited_ground: "none",
  allowed_purpose: "scientific_research",
  records_justified: false,
} as const;

function base(
  request: JsonObject,
  extra: Omit<
    RequestResult,
    "request" | "llm_backend" | "cached" | "processed_at" | "request_id" | "status" | "needs_attention"
  > & {
    request_id?: string;
  },
): RequestResult {
  const id =
    typeof request.id === "string" ? request.id : Math.random().toString(36).slice(2, 8).toUpperCase();
  return {
    request_id: id,
    request,
    llm_backend: "mock (offline)",
    cached: false,
    processed_at: new Date().toISOString(),
    review_flags: [],
    code_mappings: [],
    plan: null,
    statistics: null,
    spe: null,
    consensus: { assessment_votes: 3, assessment_agreeing: 3, plan_votes: 3, plan_agreeing: 3 },
    status: "issued",
    withdrawal: null,
    timings: { llm_s: 4.2, compute_s: 0.3, total_s: 4.6 },
    ...extra,
    needs_attention: (extra.review_flags?.length ?? 0) > 0,
  };
}

function regionRows<T extends readonly (number | string)[]>(
  data: Record<Region, T>,
  metrics: [string, string][],
): ReleasedRow[] {
  return REGIONS.map((region) => ({
    labels: { region },
    cells: metrics.map(([metric, kind], i) => ({
      metric,
      kind,
      shown: data[region][i] ?? "suppressed",
      suppressed_by: null,
    })),
  }));
}

type Criterion = NonNullable<QueryPlan["cohort"]>[number];

const E11: Criterion = { kind: "condition", negate: false, icd10_prefixes: ["E11"] };
const ADULT: Criterion = { kind: "age", negate: false, min_age: 18, max_age: null };

const R01_PLAN: QueryPlan = {
  unit: "patients",
  cohort: [ADULT],
  group_by: [{ dimension: "region" }],
  metrics: [
    { kind: "count", name: "adults", where: [], distinct_patients: true },
    { kind: "count", name: "type2_diabetes", where: [E11], distinct_patients: true },
    { kind: "percent", name: "prevalence_pct", numerator_where: [E11], denominator_where: [] },
  ],
  spe_records: [],
  notes: ["Adult interpreted as age >= 18 on 31 December 2025 (2025 minus birth year)."],
};

export function r01Result(request: JsonObject): RequestResult {
  return base(request, {
    decision: "APPROVE_STATISTICAL",
    articles: ["53", "69"],
    reason:
      "Scientific research and public-health planning are allowed purposes (Art. 53). Anonymised statistics answer your question, so no patient-level data is needed (Art. 69).",
    legal_basis: [
      "Art. 53 – Scientific research and public health are allowed purposes.",
      "Art. 69 – answered as anonymised statistics.",
    ],
    assessment: {
      ...RESEARCH_ASSESSMENT,
      justification: "“We study regional differences in type 2 diabetes to plan a prevention programme”",
      explanation_for_applicant:
        "Your purpose is scientific research with a public-health goal. Aggregated counts are enough to answer it.",
    },
    plan: R01_PLAN,
    code_mappings: [
      {
        system: "ICD-10",
        prefix: "E11",
        matched: [
          "E11.9 Type 2 diabetes mellitus without complications",
          "E11.65 Type 2 diabetes mellitus with hyperglycaemia",
        ],
      },
    ],
    statistics: {
      dimensions: ["region"],
      rows: regionRows(R01_DATA, [
        ["adults", "count"],
        ["type2_diabetes", "count"],
        ["prevalence_pct", "percent"],
      ]),
      answer: {},
      sql: "SELECT p.region,\n       count(DISTINCT p.patient_id) AS adults,\n       count(DISTINCT p.patient_id) FILTER (WHERE EXISTS (\n         SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id AND c.icd10 LIKE 'E11%')) AS type2_diabetes\nFROM patients p\nWHERE p.age >= 18\nGROUP BY p.region",
      privacy_checks: STANDARD_CHECKS,
    },
  });
}

export function r08Result(request: JsonObject): RequestResult {
  return base(request, {
    decision: "APPROVE_STATISTICAL",
    articles: ["53", "69"],
    reason:
      "Research is an allowed purpose (Art. 53). Anonymised statistics answer your question (Art. 69). Groups with fewer than 10 patients are hidden to protect privacy.",
    legal_basis: [
      "Art. 53 – Scientific research is an allowed purpose.",
      "Art. 69 – answered as anonymised statistics.",
    ],
    assessment: {
      ...RESEARCH_ASSESSMENT,
      justification: "“Research on body weight as a risk factor in breast cancer”",
      explanation_for_applicant:
        "Your purpose is scientific research. Aggregated values are enough, but small groups cannot be shown.",
    },
    plan: {
      unit: "patients",
      cohort: [
        { kind: "sex", negate: false, sex: "female" },
        { kind: "condition", negate: false, icd10_prefixes: ["C50"] },
      ],
      group_by: [{ dimension: "region" }],
      metrics: [
        {
          kind: "count",
          name: "women_with_bmi",
          where: [{ kind: "observation", negate: false, loinc: "39156-5" }],
          distinct_patients: true,
        },
        { kind: "mean", name: "mean_bmi", of: "observation", loinc: "39156-5", which: "latest", where: [] },
      ],
      spe_records: [],
      notes: [],
    },
    code_mappings: [
      { system: "ICD-10", prefix: "C50", matched: ["C50.9 Malignant neoplasm of breast, unspecified"] },
      { system: "LOINC", prefix: "39156-5", matched: ["39156-5 Body mass index (BMI)"] },
    ],
    statistics: {
      dimensions: ["region"],
      rows: regionRows(R08_DATA, [
        ["women_with_bmi", "count"],
        ["mean_bmi", "mean"],
      ]),
      answer: {},
      sql: "SELECT region, count(DISTINCT patient_id) AS women_with_bmi, avg(latest_bmi) AS mean_bmi\nFROM cohort_latest_bmi\nGROUP BY region",
      privacy_checks: STANDARD_CHECKS,
    },
  });
}

export function rejectResult(request: JsonObject): RequestResult {
  return base(request, {
    decision: "REJECT",
    articles: ["54"],
    reason:
      "Using health data to set insurance premiums is prohibited (Art. 54). The request cannot be granted, whatever format is asked for.",
    legal_basis: [
      "Art. 54 – Health data must not be used for decisions on insurance premiums or other decisions detrimental to individuals.",
    ],
    assessment: {
      prohibited: true,
      prohibited_ground: "employment_or_insurance_or_credit",
      allowed_purpose: "none",
      records_justified: false,
      justification:
        "“align private health insurance premiums for customers with diabetes with their actual risk”",
      explanation_for_applicant:
        "The stated purpose is to price insurance products. The regulation prohibits this use of health data.",
    },
    review_flags: [{ reason: "Commercial insurer; purpose text names premium setting explicitly." }],
    consensus: { assessment_votes: 3, assessment_agreeing: 3, plan_votes: 0, plan_agreeing: 0 },
    timings: { llm_s: 3.1, compute_s: 0, total_s: 3.2 },
  });
}

export const MOCK_PERMIT = "permit-R05";

export function speResult(request: JsonObject): RequestResult {
  return base(request, {
    decision: "APPROVE_SPE",
    articles: ["53", "66", "68", "73"],
    reason:
      "Developing and testing algorithms is an allowed purpose (Art. 53). You explained why statistics are not enough, so pseudonymised records are justified (Art. 66). Access is granted under a data permit inside a secure processing environment, from which nothing can be downloaded (Art. 68, 73).",
    legal_basis: [
      "Art. 53 – Developing and testing algorithms and health products is an allowed purpose.",
      "Art. 66 – records are justified: “Training needs individual-level histories; aggregates are not enough.”",
      "Art. 68 – a data permit sets purpose, duration and conditions.",
      "Art. 73 – access only inside the secure processing environment; downloads are blocked.",
    ],
    assessment: {
      prohibited: false,
      prohibited_ground: "none",
      allowed_purpose: "product_and_algorithm_development",
      records_justified: true,
      justification: "“Training needs individual-level histories; aggregates are not enough.”",
      explanation_for_applicant:
        "Your purpose is allowed and you explained why aggregates are not enough. You get pseudonymised records in a secure environment.",
    },
    review_flags: [
      {
        reason:
          "Applicant is a commercial spin-off; verify that only model weights and metrics leave through the airlock.",
      },
    ],
    plan: {
      unit: "patients",
      cohort: [ADULT, E11, { kind: "observation", negate: false, loinc: "4548-4" }],
      group_by: [],
      metrics: [{ kind: "count", name: "cohort_size", where: [], distinct_patients: true }],
      spe_records: [
        { table: "conditions", codes: null },
        { table: "medications", codes: null },
        { table: "observations", codes: ["4548-4"] },
      ],
      notes: ["Observations restricted to HbA1c (4548-4) as requested."],
    },
    code_mappings: [
      { system: "ICD-10", prefix: "E11", matched: ["E11.9 Type 2 diabetes mellitus without complications"] },
      { system: "LOINC", prefix: "4548-4", matched: ["4548-4 Hemoglobin A1c/Hemoglobin.total in Blood"] },
    ],
    spe: {
      permit_id: MOCK_PERMIT,
      cohort_size: 1152,
      tables: { cohort: 1152, conditions: 2477, medications: 3065, observations: 2807 },
      download_blocked: true,
    },
    consensus: { assessment_votes: 3, assessment_agreeing: 3, plan_votes: 3, plan_agreeing: 2 },
    timings: { llm_s: 6.8, compute_s: 1.1, total_s: 8.0 },
  });
}

export function burgenlandResult(
  request: JsonObject,
  count: number,
  blockedBy: string | null,
): RequestResult {
  return base(request, {
    decision: "APPROVE_STATISTICAL",
    articles: ["53", "69"],
    reason:
      "Scientific research is an allowed purpose (Art. 53). Anonymised statistics answer your question (Art. 69). Groups with fewer than 10 patients are hidden to protect privacy.",
    legal_basis: [
      "Art. 53 – Scientific research is an allowed purpose.",
      "Art. 69 – answered as anonymised statistics.",
    ],
    assessment: {
      ...RESEARCH_ASSESSMENT,
      justification: "“Research on the quality of diabetes care”",
      explanation_for_applicant: "Your purpose is scientific research. Aggregated counts are enough.",
    },
    code_mappings: [
      { system: "ICD-10", prefix: "E11", matched: ["E11.9 Type 2 diabetes mellitus without complications"] },
    ],
    statistics: {
      dimensions: [],
      rows: [
        {
          labels: {},
          cells: [
            {
              metric: "type2_diabetes",
              kind: "count",
              shown: blockedBy ? "<10" : count,
              suppressed_by: blockedBy,
            },
          ],
        },
      ],
      answer: { type2_diabetes: blockedBy ? "<10" : count },
      sql: "SELECT p.patient_id AS unit_id\nFROM patients p\nWHERE p.age >= 18 AND p.region IN ('Burgenland')\n  AND EXISTS (SELECT 1 FROM conditions c WHERE c.patient_id = p.patient_id AND c.icd10 LIKE 'E11%')",
      privacy_checks: [
        ...STANDARD_CHECKS.slice(0, 3),
        { name: "Every requested group shown", passed: true, detail: "1 of 1 groups, including empty ones." },
        {
          name: "Release ledger (differencing)",
          passed: true,
          detail: blockedBy
            ? "1 values withheld because, combined with earlier releases to this applicant, they would reveal fewer than 10 patients."
            : "No combination with earlier releases to this applicant reveals a group below 10.",
        },
      ],
    },
    timings: { llm_s: 8.4, compute_s: 0.01, total_s: 8.4 },
  });
}

export const SPE_TABLES: SpeTable[] = [
  { name: "cohort", rows: 1152, columns: ["patient_id"] },
  { name: "conditions", rows: 2477, columns: ["patient_id", "icd10", "description", "onset_date"] },
  { name: "medications", rows: 3065, columns: ["patient_id", "atc", "name", "start_date", "end_date"] },
  { name: "observations", rows: 2807, columns: ["patient_id", "loinc", "name", "value", "unit", "date"] },
];

export const ATC_COUNTS: [string, number][] = [
  ["A10BA02", 812],
  ["C09AA05", 301],
  ["A10BJ06", 254],
  ["C10AA01", 233],
  ["A10BK01", 120],
  ["B01AF01", 41],
  ["N06AB10", 8],
  ["L01XE", 3],
];
