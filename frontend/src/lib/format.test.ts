import { describe, expect, it } from "vitest";

import {
  capitalise,
  formatSeconds,
  formatShortTime,
  formatTime,
  formatValue,
  humanise,
  isProtectedMarker,
  plural,
  shorten,
  toResultValue,
} from "./format";

describe("formatValue", () => {
  it("groups thousands in counts", () => {
    expect(formatValue(2740, "count")).toBe("2,740");
    expect(formatValue(1152)).toBe("1,152");
  });

  it("keeps counts without a trailing decimal", () => {
    expect(formatValue(33, "count")).toBe("33");
  });

  it.each([
    [8, "percent", "8.0"],
    [8, "mean", "8.0"],
    [6.2, "percent", "6.2"],
    [26.6, "mean", "26.6"],
    [100, "percent", "100.0"],
    [1234.5, "mean", "1,234.5"],
  ])("shows %s as %s with exactly one decimal: %s", (value, kind, expected) => {
    expect(formatValue(value, kind)).toBe(expected);
  });

  it("rounds to one decimal for percentages and means", () => {
    expect(formatValue(27.25, "mean")).toBe("27.3");
    expect(formatValue(8.04, "percent")).toBe("8.0");
  });

  it("passes the small-cell markers through unchanged", () => {
    expect(formatValue("<10", "count")).toBe("<10");
    expect(formatValue("suppressed", "percent")).toBe("suppressed");
    expect(formatValue("suppressed", "mean")).toBe("suppressed");
  });

  it("shows missing values as NULL", () => {
    expect(formatValue(null)).toBe("NULL");
    expect(formatValue(undefined, "count")).toBe("NULL");
  });

  it("stringifies other result values", () => {
    expect(formatValue("Wien")).toBe("Wien");
    expect(formatValue(true)).toBe("true");
  });
});

describe("isProtectedMarker", () => {
  it("recognises only the two small-cell markers as protected", () => {
    expect(isProtectedMarker("<10")).toBe(true);
    expect(isProtectedMarker("suppressed")).toBe(true);
    expect(isProtectedMarker(9)).toBe(false);
    expect(isProtectedMarker("10")).toBe(false);
    expect(isProtectedMarker(null)).toBe(false);
    expect(isProtectedMarker("Wien")).toBe(false);
  });
});

describe("humanise", () => {
  it.each([
    ["prevalence_pct", "Prevalence (%)"],
    ["mean_bmi", "Mean BMI"],
    ["hba1c_latest", "HbA1c latest"],
    ["type2_diabetes", "Type 2 diabetes"],
    ["employment_or_insurance_or_credit", "Employment or insurance or credit"],
    ["region", "Region"],
    ["women_with_bmi", "Women with BMI"],
  ])("turns %s into %s", (name, label) => {
    expect(humanise(name)).toBe(label);
  });

  it("returns an empty label for an empty name", () => {
    expect(humanise("")).toBe("");
  });

  it("ignores repeated underscores", () => {
    expect(humanise("mean__bmi")).toBe("Mean BMI");
  });
});

describe("capitalise", () => {
  it("upper-cases only the first character", () => {
    expect(capitalise("small cell under ten")).toBe("Small cell under ten");
    expect(capitalise("eGFR below 60")).toBe("EGFR below 60");
  });

  it("leaves an empty string empty", () => {
    expect(capitalise("")).toBe("");
  });
});

describe("shorten", () => {
  it("keeps text that fits within the limit", () => {
    expect(shorten("Medical University", 18)).toBe("Medical University");
    expect(shorten("Exactly ten", 11)).toBe("Exactly ten");
  });

  it("cuts to the limit including the ellipsis", () => {
    expect(shorten("University Hospital of Innsbruck", 18)).toBe("University Hospit…");
  });

  it("drops trailing whitespace before the ellipsis", () => {
    expect(shorten("Research Institute Vienna", 10)).toBe("Research…");
  });
});

describe("formatTime", () => {
  it("returns an empty string without a timestamp", () => {
    expect(formatTime(undefined)).toBe("");
    expect(formatTime("")).toBe("");
  });

  it("falls back to the raw text for an unparseable timestamp", () => {
    expect(formatTime("not a date")).toBe("not a date");
  });

  it("formats a valid timestamp as a readable date", () => {
    expect(formatTime("2026-10-29T18:30:00+01:00")).toContain("Oct 2026");
  });
});

describe("formatShortTime", () => {
  const now = new Date(2026, 9, 30, 18, 0);
  const local = (day: number, hour: number, minute: number) =>
    new Date(2026, 9, day, hour, minute).toISOString();

  it("returns an empty string without a timestamp", () => {
    expect(formatShortTime(undefined, now)).toBe("");
    expect(formatShortTime("", now)).toBe("");
  });

  it("shows only the time for today", () => {
    expect(formatShortTime(local(30, 14, 5), now)).toBe("14:05");
  });

  it("shows day and month for another day", () => {
    expect(formatShortTime(local(29, 18, 30), now)).toBe("29 Oct");
    expect(formatShortTime(local(5, 9, 0), now)).toBe("5 Oct");
  });

  it("goes by calendar day, not by the last 24 hours", () => {
    const justAfterMidnight = new Date(2026, 9, 30, 0, 10);
    expect(formatShortTime(local(29, 23, 30), justAfterMidnight)).toBe("29 Oct");
  });

  it("falls back to the raw text for an unparseable timestamp", () => {
    expect(formatShortTime("not a date", now)).toBe("not a date");
  });
});

describe("formatSeconds, plural and toResultValue", () => {
  it("shows seconds with one decimal and treats a missing value as zero", () => {
    expect(formatSeconds(4.64)).toBe("4.6 s");
    expect(formatSeconds(undefined)).toBe("0.0 s");
  });

  it("pluralises by count", () => {
    expect(plural(1, "patient")).toBe("1 patient");
    expect(plural(1152, "patient")).toBe("1,152 patients");
    expect(plural(0, "group")).toBe("0 groups");
    expect(plural(2, "analysis", "analyses")).toBe("2 analyses");
  });

  it("keeps scalar result cells and serialises anything else", () => {
    expect(toResultValue(null)).toBeNull();
    expect(toResultValue(7)).toBe(7);
    expect(toResultValue("Tirol")).toBe("Tirol");
    expect(toResultValue(false)).toBe(false);
    expect(toResultValue({ a: 1 })).toBe('{"a":1}');
    expect(toResultValue([1, 2])).toBe("[1,2]");
  });
});
