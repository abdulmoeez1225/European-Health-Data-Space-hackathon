import { isObject, readRequest } from "@/api/request";
import type { JsonObject } from "@/api/types";
import { messages } from "@/i18n";

/**
 * The request as the form holds it. The form is the single source of truth: samples and pasted
 * JSON only fill it, and the submitted request is built from it.
 */
export type RequestKind = "statistics" | "records";

export type RequestDraft = {
  /** Kept from an imported request so the decision carries the applicant's reference. */
  id: string;
  name: string;
  organisation: string;
  country: string;
  kind: RequestKind;
  purpose: string;
  question: string;
  definitions: string[];
};

/** `requestedAs` and `requestedFormat` are submitted as-is (canonical English); only `label` follows the language. */
export const REQUEST_KINDS: Record<
  RequestKind,
  { readonly label: string; requestedAs: string; requestedFormat: string }
> = {
  statistics: {
    get label() {
      return messages().applicant.draft.kinds.statistics;
    },
    requestedAs: "health data request",
    requestedFormat: "anonymised statistics",
  },
  records: {
    get label() {
      return messages().applicant.draft.kinds.records;
    },
    requestedAs: "health data access application",
    requestedFormat: "pseudonymised records",
  },
};

export const EMPTY_DRAFT: RequestDraft = {
  id: "",
  name: "",
  organisation: "",
  country: "",
  kind: "statistics",
  purpose: "",
  question: "",
  definitions: [],
};

/** Maps a request in the track format onto the form; unknown keys are ignored. */
export function draftFrom(raw: unknown): RequestDraft {
  const request = readRequest(raw);
  return {
    id: request.id,
    name: request.applicant.name,
    organisation: request.applicant.organisation,
    country: request.applicant.country,
    kind: /access application/i.test(request.requestedAs) ? "records" : "statistics",
    purpose: request.purpose,
    question: request.question,
    definitions: request.definitions,
  };
}

export type ImportResult = { ok: true; draft: RequestDraft } | { ok: false; message: string };

const REQUEST_KEYS = ["applicant", "purpose", "question", "definitions", "requested_as"];

export function parseRequestJson(text: string): ImportResult {
  const t = messages().applicant.draft.json;
  if (!text.trim()) return { ok: false, message: t.empty };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      message: t.invalid(error instanceof Error ? error.message : t.unreadable),
    };
  }
  if (!isObject(value)) return { ok: false, message: t.notObject };
  if (!REQUEST_KEYS.some((key) => key in value)) {
    return { ok: false, message: t.noFields };
  }
  if ("definitions" in value && !Array.isArray(value.definitions)) {
    return { ok: false, message: t.definitionsNotList };
  }
  return { ok: true, draft: draftFrom(value) };
}

export type RequiredField = "organisation" | "purpose" | "definitions";
export type FieldErrors = Partial<Record<RequiredField, string>>;

export const REQUIRED_LABELS: Readonly<Record<RequiredField, string>> = {
  get organisation() {
    return messages().applicant.draft.requiredLabels.organisation;
  },
  get purpose() {
    return messages().applicant.draft.requiredLabels.purpose;
  },
  get definitions() {
    return messages().applicant.draft.requiredLabels.definitions;
  },
};

export function draftErrors(draft: RequestDraft): FieldErrors {
  const t = messages().applicant.draft.errors;
  const errors: FieldErrors = {};
  if (!draft.organisation.trim()) errors.organisation = t.organisation;
  if (!draft.purpose.trim()) errors.purpose = t.purpose;
  if (!draft.definitions.some((definition) => definition.trim())) {
    errors.definitions = t.definitions;
  }
  return errors;
}

/** The request that is submitted, in the track format. Empty definition rows are dropped. */
export function toRequest(draft: RequestDraft): JsonObject {
  const { requestedAs, requestedFormat } = REQUEST_KINDS[draft.kind];
  return {
    ...(draft.id.trim() ? { id: draft.id.trim() } : {}),
    applicant: {
      name: draft.name.trim(),
      organisation: draft.organisation.trim(),
      country: draft.country.trim(),
    },
    requested_as: requestedAs,
    requested_format: requestedFormat,
    purpose: draft.purpose.trim(),
    question: draft.question.trim(),
    definitions: draft.definitions.map((definition) => definition.trim()).filter(Boolean),
  };
}
