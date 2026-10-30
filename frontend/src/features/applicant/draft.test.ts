import { describe, expect, it } from "vitest";

import type { JsonObject } from "@/api/types";
import { MOCK_SAMPLES } from "@/mock/data";
import { sampleRequest } from "@/test/render";

import {
  draftErrors,
  draftFrom,
  EMPTY_DRAFT,
  parseRequestJson,
  REQUEST_KINDS,
  REQUIRED_LABELS,
  toRequest,
  type RequestDraft,
} from "./draft";

const complete: RequestDraft = {
  id: "REQ-1",
  name: "Dr. Test Person",
  organisation: "Example Research Institute",
  country: "AT",
  kind: "statistics",
  purpose: "Plan a prevention programme.",
  question: "How many adults have type 2 diabetes per region?",
  definitions: ["Adult = aged 18 or older."],
};

describe("draftFrom", () => {
  it("maps a statistics request onto the form", () => {
    const draft = draftFrom(sampleRequest("R01"));

    expect(draft.kind).toBe("statistics");
    expect(draft.id).toBe("R01");
    expect(draft.name).toBe("Dr. Sophie Lechner");
    expect(draft.organisation).toBe("Danube Institute for Diabetes Research (university research group)");
    expect(draft.country).toBe("AT");
    expect(draft.purpose).toMatch(/^We study regional differences in type 2 diabetes/);
    expect(draft.question).toBe(
      "How many adults have type 2 diabetes in each region and what is the prevalence?",
    );
    expect(draft.definitions).toHaveLength(4);
    expect(draft.definitions[0]).toBe("Adult = aged 18 or older on 31 December 2025.");
  });

  it("maps an access application onto the records kind", () => {
    const draft = draftFrom(sampleRequest("R05"));

    expect(draft.kind).toBe("records");
    expect(draft.id).toBe("R05");
    expect(draft.organisation).toBe(
      "GlucoSense, university spin-off developing clinical prediction software",
    );
    expect(draft.definitions).toHaveLength(4);
  });

  it("ignores keys the form does not hold", () => {
    const draft = draftFrom({ ...sampleRequest("R01"), submitted: "2026-10-29T18:30:00+01:00", extra: 1 });

    expect(Object.keys(draft).sort()).toEqual(Object.keys(EMPTY_DRAFT).sort());
    expect(draft).toEqual(draftFrom(sampleRequest("R01")));
  });

  it("falls back to an empty statistics draft for anything that is not an object", () => {
    expect(draftFrom(null)).toEqual(EMPTY_DRAFT);
    expect(draftFrom([sampleRequest("R01")])).toEqual(EMPTY_DRAFT);
    expect(draftFrom("R01")).toEqual(EMPTY_DRAFT);
  });
});

describe("parseRequestJson", () => {
  it("asks for input when the text is empty or blank", () => {
    expect(parseRequestJson("")).toEqual({ ok: false, message: "Paste a request as JSON." });
    expect(parseRequestJson("  \n ")).toEqual({ ok: false, message: "Paste a request as JSON." });
  });

  it("reports invalid JSON", () => {
    const result = parseRequestJson('{ "purpose": ');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/^Invalid JSON: .+\.$/);
  });

  it.each([["[1, 2]"], ['"text"'], ["42"], ["null"]])("rejects %s as not a JSON object", (text) => {
    const result = parseRequestJson(text);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/must be a JSON object/);
  });

  it("rejects an object without any request fields", () => {
    const result = parseRequestJson('{ "hello": "world" }');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/No request fields found/);
  });

  it("rejects definitions that are not a list", () => {
    const result = parseRequestJson('{ "purpose": "x", "definitions": "Adult = 18 or older." }');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toBe("definitions must be a list of sentences.");
  });

  it("returns the draft for a request in the track format", () => {
    const result = parseRequestJson(JSON.stringify(sampleRequest("R05")));

    expect(result).toEqual({ ok: true, draft: draftFrom(sampleRequest("R05")) });
  });

  it("accepts a request that holds only some of the fields", () => {
    const result = parseRequestJson('{ "purpose": "Plan a programme." }');

    expect(result).toEqual({ ok: true, draft: { ...EMPTY_DRAFT, purpose: "Plan a programme." } });
  });
});

describe("draftErrors", () => {
  it("asks for every required field of an empty draft", () => {
    expect(Object.keys(draftErrors(EMPTY_DRAFT)).sort()).toEqual(["definitions", "organisation", "purpose"]);
  });

  it("has a label for every field it can complain about", () => {
    for (const field of Object.keys(draftErrors(EMPTY_DRAFT))) {
      expect(REQUIRED_LABELS).toHaveProperty(field);
    }
  });

  it("counts whitespace-only entries as missing", () => {
    const errors = draftErrors({ ...complete, organisation: "   ", purpose: "\n\t", definitions: [" ", ""] });

    expect(Object.keys(errors).sort()).toEqual(["definitions", "organisation", "purpose"]);
  });

  it("reports only the field that is missing", () => {
    expect(Object.keys(draftErrors({ ...complete, purpose: "" }))).toEqual(["purpose"]);
    expect(Object.keys(draftErrors({ ...complete, organisation: "" }))).toEqual(["organisation"]);
    expect(Object.keys(draftErrors({ ...complete, definitions: [] }))).toEqual(["definitions"]);
  });

  it("is satisfied by one non-blank definition among empty rows", () => {
    expect(draftErrors({ ...complete, definitions: ["", "Adult = 18 or older.", " "] })).toEqual({});
  });

  it.each(["R01", "R05"])("finds nothing missing in sample %s", (id) => {
    expect(draftErrors(draftFrom(sampleRequest(id)))).toEqual({});
  });
});

describe("toRequest", () => {
  it("builds the request in the track format with trimmed fields", () => {
    const request = toRequest({
      id: "  REQ-7  ",
      name: " Dr. Test Person ",
      organisation: " Example Institute ",
      country: " AT ",
      kind: "records",
      purpose: " Train a model. ",
      question: " Provide records. ",
      definitions: ["  Adult = 18 or older.  ", "", "   ", "Cohort = adults."],
    });

    expect(request).toEqual({
      id: "REQ-7",
      applicant: { name: "Dr. Test Person", organisation: "Example Institute", country: "AT" },
      requested_as: "health data access application",
      requested_format: "pseudonymised records",
      purpose: "Train a model.",
      question: "Provide records.",
      definitions: ["Adult = 18 or older.", "Cohort = adults."],
    });
  });

  it("takes requested_as and requested_format from the kind", () => {
    const request = toRequest({ ...complete, kind: "statistics" });

    expect(request.requested_as).toBe(REQUEST_KINDS.statistics.requestedAs);
    expect(request.requested_format).toBe(REQUEST_KINDS.statistics.requestedFormat);
    expect(request.requested_as).toBe("health data request");
    expect(request.requested_format).toBe("anonymised statistics");
  });

  it("leaves the id out when it is empty or blank", () => {
    expect(toRequest({ ...complete, id: "" })).not.toHaveProperty("id");
    expect(toRequest({ ...complete, id: "   " })).not.toHaveProperty("id");
  });

  it("does not carry keys the form does not hold", () => {
    const imported = draftFrom({ ...sampleRequest("R01"), submitted: "2026-10-29T18:30:00+01:00", extra: 1 });

    expect(Object.keys(toRequest(imported)).sort()).toEqual([
      "applicant",
      "definitions",
      "id",
      "purpose",
      "question",
      "requested_as",
      "requested_format",
    ]);
  });

  it("reproduces every sample request apart from its submission time", () => {
    for (const sample of MOCK_SAMPLES) {
      const expected = Object.fromEntries(
        Object.entries(sample).filter(([key]) => key !== "submitted"),
      ) as JsonObject;

      expect(toRequest(draftFrom(sample))).toEqual(expected);
    }
  });
});
