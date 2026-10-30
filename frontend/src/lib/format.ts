import type { CellValue, ResultValue } from "@/api/types";
import { intlLocale, messages } from "@/i18n/runtime";

/** Markers the small-cell rule puts in place of a number. */
export const LESS_THAN_TEN = "<10";
export const SUPPRESSED = "suppressed";

const ONE_DECIMAL_KINDS = new Set(["percent", "mean"]);

/** Released values: counts as integers, percentages and means with exactly one decimal. */
export function formatValue(value: CellValue | ResultValue | undefined, kind?: string): string {
  if (value === null || value === undefined) return "NULL";
  // The small-cell marker is data ("suppressed"); it is shown in the reader's language.
  if (value === SUPPRESSED) return messages().smallCells.suppressedMarker;
  if (typeof value !== "number") return String(value);
  const oneDecimal = kind !== undefined && ONE_DECIMAL_KINDS.has(kind);
  return value.toLocaleString(
    intlLocale("number"),
    oneDecimal ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : { maximumFractionDigits: 2 },
  );
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

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Cut to at most `max` characters, ending in an ellipsis when something was removed. */
export function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

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
  return capitalise(words.join(" "));
}

export function formatTime(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(intlLocale("date"), { dateStyle: "medium", timeStyle: "short" });
}

export function formatSeconds(seconds: number | undefined): string {
  const value = (seconds ?? 0).toLocaleString(intlLocale("number"), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${value} s`;
}

export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${count.toLocaleString(intlLocale("number"))} ${count === 1 ? noun : pluralNoun}`;
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

/** Compact list time: "14:05" for today, "29 Oct" otherwise. */
export function formatShortTime(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString(intlLocale("date"), { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(intlLocale("date"), { day: "numeric", month: "short" });
}
