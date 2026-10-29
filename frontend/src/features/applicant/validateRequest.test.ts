import { describe, expect, it } from "vitest";

import { validateRequest } from "./validateRequest";

const applicant = { name: "Dr. Sophie Lechner", organisation: "Danube Institute", country: "AT" };

describe("validateRequest", () => {
  it.each(["", "   ", "\n\t"])("treats blank text %j as empty", (text) => {
    expect(validateRequest(text)).toEqual({ kind: "empty" });
  });

  it("reports malformed JSON with the parser message", () => {
    const result = validateRequest('{"applicant": {');
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.message).not.toBe("");
  });

  it.each(["[]", '[{"purpose": "x"}]', "42", '"a string"', "null", "true"])(
    "rejects %s because it is not a JSON object",
    (text) => {
      expect(validateRequest(text)).toEqual({
        kind: "invalid",
        message: "The request must be a JSON object.",
      });
    },
  );

  it("asks for an applicant object when it is missing", () => {
    const text = JSON.stringify({ purpose: "Plan a prevention programme." });
    expect(validateRequest(text)).toEqual({
      kind: "incomplete",
      message: "The request needs an applicant object.",
      request: { purpose: "Plan a prevention programme." },
    });
  });

  it.each([
    ["a string", "Danube Institute"],
    ["an array", [applicant]],
    ["null", null],
  ])("does not accept %s as the applicant", (_label, value) => {
    const result = validateRequest(JSON.stringify({ applicant: value, purpose: "Research." }));
    expect(result.kind).toBe("incomplete");
    if (result.kind !== "incomplete") return;
    expect(result.message).toBe("The request needs an applicant object.");
  });

  it("asks for a purpose when it is missing", () => {
    const result = validateRequest(JSON.stringify({ applicant }));
    expect(result.kind).toBe("incomplete");
    if (result.kind !== "incomplete") return;
    expect(result.message).toBe("The request needs a purpose.");
    expect(result.request).toEqual({ applicant });
  });

  it.each([
    ["blank", "   "],
    ["empty", ""],
    ["a number", 7],
    ["null", null],
  ])("asks for a purpose when it is %s", (_label, purpose) => {
    const result = validateRequest(JSON.stringify({ applicant, purpose }));
    expect(result.kind).toBe("incomplete");
    if (result.kind !== "incomplete") return;
    expect(result.message).toBe("The request needs a purpose.");
  });

  it("names both problems when applicant and purpose are missing", () => {
    const result = validateRequest("{}");
    expect(result).toEqual({
      kind: "incomplete",
      message: "The request needs an applicant object and a purpose.",
      request: {},
    });
  });

  it("accepts a request with an applicant object and a purpose", () => {
    const request = {
      id: "R01",
      applicant,
      requested_as: "health data request",
      purpose: "We study regional differences in type 2 diabetes.",
      question: "How many adults have type 2 diabetes in each region?",
    };
    expect(validateRequest(JSON.stringify(request))).toEqual({ kind: "valid", request });
  });

  it("accepts pretty-printed JSON with surrounding whitespace", () => {
    const text = `\n  ${JSON.stringify({ applicant, purpose: "Research." }, null, 2)}\n`;
    expect(validateRequest(text).kind).toBe("valid");
  });
});
