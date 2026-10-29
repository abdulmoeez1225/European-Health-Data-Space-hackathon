import { isObject } from "@/api/request";
import type { JsonObject } from "@/api/types";

export type Validation =
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | { kind: "incomplete"; message: string; request: JsonObject }
  | { kind: "valid"; request: JsonObject };

/** Mirrors the server's minimum (an applicant object and a purpose) so the applicant sees problems before submitting. */
export function validateRequest(text: string): Validation {
  if (!text.trim()) return { kind: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { kind: "invalid", message: error instanceof Error ? error.message : "Invalid JSON" };
  }
  if (!isObject(parsed)) return { kind: "invalid", message: "The request must be a JSON object." };
  const missing = [
    isObject(parsed.applicant) ? null : "an applicant object",
    typeof parsed.purpose === "string" && parsed.purpose.trim() ? null : "a purpose",
  ].filter((m): m is string => m !== null);
  if (missing.length) {
    return { kind: "incomplete", message: `The request needs ${missing.join(" and ")}.`, request: parsed };
  }
  return { kind: "valid", request: parsed };
}
