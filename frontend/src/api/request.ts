import type { JsonObject } from "./types";

/**
 * A data request as submitted by an applicant (requests/*.json). The API types it
 * as a free-form object, so the fields the UI shows are read defensively here.
 */
export type Applicant = {
  name: string;
  organisation: string;
  country: string;
};

export type DataRequest = {
  id: string;
  applicant: Applicant;
  requestedAs: string;
  requestedFormat: string;
  purpose: string;
  question: string;
  definitions: string[];
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(source: JsonObject, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

export function readRequest(raw: unknown): DataRequest {
  const source = isObject(raw) ? raw : {};
  const applicant = isObject(source.applicant) ? source.applicant : {};
  const definitions = Array.isArray(source.definitions)
    ? source.definitions.filter((d): d is string => typeof d === "string")
    : [];
  return {
    id: text(source, "id"),
    applicant: {
      name: text(applicant, "name"),
      organisation: text(applicant, "organisation"),
      country: text(applicant, "country"),
    },
    requestedAs: text(source, "requested_as"),
    requestedFormat: text(source, "requested_format"),
    purpose: text(source, "purpose"),
    question: text(source, "question"),
    definitions,
  };
}

export { isObject };
