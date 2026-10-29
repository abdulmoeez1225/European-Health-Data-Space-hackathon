import type { CellValue, ResultValue } from "@/api/types";

/** Markers the small-cell rule puts in place of a number. */
export const LESS_THAN_TEN = "<10";
export const SUPPRESSED = "suppressed";

const ONE_DECIMAL_KINDS = new Set(["percent", "mean"]);

/** Released values: counts as integers, percentages and means with exactly one decimal. */
export function formatValue(value: CellValue | ResultValue | undefined, kind?: string): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value !== "number") return String(value);
  const oneDecimal = kind !== undefined && ONE_DECIMAL_KINDS.has(kind);
  return value.toLocaleString(
    "en-GB",
    oneDecimal ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : { maximumFractionDigits: 2 },
  );
}

export type ValueTone = "small" | "suppressed" | "plain";

export function valueTone(value: unknown): ValueTone {
  if (value === LESS_THAN_TEN) return "small";
  if (value === SUPPRESSED) return "suppressed";
  return "plain";
}

const ACRONYMS: Record<string, string> = {
  bmi: "BMI",
  hba1c: "HbA1c",
  af: "AF",
  oac: "OAC",
  ace: "ACE",
  arb: "ARB",
  egfr: "eGFR",
  icd: "ICD",
  icd10: "ICD-10",
  atc: "ATC",
  loinc: "LOINC",
  id: "ID",
  copd: "COPD",
  ckd: "CKD",
  spe: "SPE",
  los: "LOS",
};

/** snake_case metric or enum names to a readable label: "prevalence_pct" -> "Prevalence (%)". */
export function humanise(name: string): string {
  const words = name
    .split("_")
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "pct") return "(%)";
      return ACRONYMS[lower] ?? lower.replace(/([a-z])(\d)/g, "$1 $2");
    });
  const label = words.join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatTime(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function formatSeconds(seconds: number | undefined): string {
  return `${(seconds ?? 0).toFixed(1)} s`;
}

export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? noun : pluralNoun}`;
}

/** Narrow a DuckDB result cell (typed `unknown` in the API) to something displayable. */
export function toResultValue(value: unknown): ResultValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return JSON.stringify(value);
}

export function isProtectedMarker(value: unknown): value is typeof LESS_THAN_TEN | typeof SUPPRESSED {
  return value === LESS_THAN_TEN || value === SUPPRESSED;
}
