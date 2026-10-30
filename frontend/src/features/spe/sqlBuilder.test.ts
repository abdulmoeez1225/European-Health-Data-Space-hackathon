import { describe, expect, it } from "vitest";

import {
  browseSql,
  countSql,
  defaultSummary,
  filterColumnsFor,
  quoteLiteral,
  SqlBuildError,
  summaryRequest,
  summarySql,
  type SummaryTable,
  type TableSchema,
} from "./sqlBuilder";

const SCHEMA: TableSchema[] = [
  { name: "cohort", columns: ["patient_id"] },
  { name: "conditions", columns: ["patient_id", "icd10", "description", "onset_date"] },
  { name: "medications", columns: ["patient_id", "atc", "name", "start_date", "end_date"] },
  {
    name: "encounters",
    columns: ["encounter_id", "patient_id", "data_holder", "type", "start_date", "end_date", "primary_icd10"],
  },
];

/** As GET /api/spe/{id} lists them: the airlock's group keys per table. */
const SUMMARY_TABLES: SummaryTable[] = [
  { name: "cohort", columns: ["patient_id"], airlock_group_by: [] },
  {
    name: "conditions",
    columns: ["patient_id", "icd10", "description", "onset_date"],
    airlock_group_by: ["icd10", "description", "onset_year"],
  },
  {
    name: "medications",
    columns: ["patient_id", "atc", "name", "start_date", "end_date"],
    airlock_group_by: ["atc", "name", "start_year", "end_year"],
  },
];

describe("quoteLiteral", () => {
  it("doubles single quotes", () => {
    expect(quoteLiteral("O'Brien")).toBe("'O''Brien'");
    expect(quoteLiteral("'; DROP TABLE x; --")).toBe("'''; DROP TABLE x; --'");
  });
});

describe("browseSql", () => {
  it("pages through a table in a stable order", () => {
    expect(browseSql({ schema: SCHEMA, table: "conditions", filters: [] })).toBe(
      "SELECT * FROM conditions ORDER BY ALL LIMIT 50 OFFSET 0",
    );
    expect(browseSql({ schema: SCHEMA, table: "conditions", filters: [], offset: 100 })).toBe(
      "SELECT * FROM conditions ORDER BY ALL LIMIT 50 OFFSET 100",
    );
  });

  it("filters codes by prefix and names by any part, case-insensitively and escaped", () => {
    expect(
      browseSql({
        schema: SCHEMA,
        table: "medications",
        filters: [
          { column: "atc", op: "starts_with", value: "a10" },
          { column: "name", op: "contains", value: "O'Metformin" },
        ],
      }),
    ).toBe(
      "SELECT * FROM medications WHERE starts_with(lower(CAST(atc AS VARCHAR)), 'a10') AND contains(lower(CAST(name AS VARCHAR)), 'o''metformin') ORDER BY ALL LIMIT 50 OFFSET 0",
    );
  });

  it("ignores empty filters", () => {
    expect(
      browseSql({
        schema: SCHEMA,
        table: "conditions",
        filters: [{ column: "icd10", op: "starts_with", value: "  " }],
      }),
    ).toBe("SELECT * FROM conditions ORDER BY ALL LIMIT 50 OFFSET 0");
  });

  it.each([
    [-1, 0],
    [50, -50],
    [1.5, 0],
    [201, 0],
  ])("rejects LIMIT %s / OFFSET %s", (limit, offset) => {
    expect(() => browseSql({ schema: SCHEMA, table: "conditions", filters: [], limit, offset })).toThrow(
      SqlBuildError,
    );
  });
});

describe("identifier whitelist", () => {
  it("rejects a table that is not in the permit", () => {
    expect(() => browseSql({ schema: SCHEMA, table: "patients", filters: [] })).toThrow(SqlBuildError);
    expect(() => countSql({ schema: SCHEMA, table: "conditions; DROP TABLE cohort", filters: [] })).toThrow(
      SqlBuildError,
    );
  });

  it.each(["unknown", "icd10; DROP TABLE x", "icd10) --", "icd10 OR 1=1"])("rejects column %j", (column) => {
    expect(() =>
      browseSql({ schema: SCHEMA, table: "conditions", filters: [{ column, op: "equals", value: "E11" }] }),
    ).toThrow(SqlBuildError);
    expect(() => summaryRequest(SUMMARY_TABLES, { table: "conditions", groupBy: column })).toThrow(
      SqlBuildError,
    );
  });
});

describe("countSql", () => {
  it("counts the filtered rows", () => {
    expect(countSql({ schema: SCHEMA, table: "conditions", filters: [] })).toBe(
      "SELECT count(*) AS n FROM conditions",
    );
    expect(
      countSql({
        schema: SCHEMA,
        table: "conditions",
        filters: [{ column: "icd10", op: "equals", value: "E11.9" }],
      }),
    ).toBe("SELECT count(*) AS n FROM conditions WHERE CAST(icd10 AS VARCHAR) = 'E11.9'");
  });
});

describe("summary", () => {
  it("sends the airlock a structured request, never SQL", () => {
    expect(summaryRequest(SUMMARY_TABLES, { table: "medications", groupBy: "atc" })).toEqual({
      table: "medications",
      group_by: ["atc"],
      filter: null,
    });
  });

  it("previews distinct patients per group in a column named n", () => {
    const request = summaryRequest(SUMMARY_TABLES, { table: "medications", groupBy: "atc" });
    expect(summarySql(request)).toBe(
      "SELECT atc, count(DISTINCT patient_id) AS n FROM medications GROUP BY atc ORDER BY n DESC, atc",
    );
  });

  it("applies one condition and groups dates by year", () => {
    const request = summaryRequest(SUMMARY_TABLES, {
      table: "conditions",
      groupBy: "onset_year",
      filter: { column: "description", op: "contains", value: " Diabetes " },
    });
    expect(request.filter).toEqual({ column: "description", op: "contains", value: "Diabetes" });
    expect(summarySql(request)).toBe(
      "SELECT year(onset_date) AS onset_year, count(DISTINCT patient_id) AS n FROM conditions WHERE contains(lower(CAST(description AS VARCHAR)), 'diabetes') GROUP BY onset_year ORDER BY n DESC, onset_year",
    );
  });

  it("drops an empty condition", () => {
    const request = summaryRequest(SUMMARY_TABLES, {
      table: "conditions",
      groupBy: "icd10",
      filter: { column: "icd10", op: "starts_with", value: "  " },
    });
    expect(request.filter).toBeNull();
  });

  it.each(["patient_id", "onset_date", "md5(patient_id)"])("refuses to group by %j", (groupBy) => {
    expect(() => summaryRequest(SUMMARY_TABLES, { table: "conditions", groupBy })).toThrow(SqlBuildError);
  });

  it("refuses to filter on a column the airlock does not accept", () => {
    expect(() =>
      summaryRequest(SUMMARY_TABLES, {
        table: "conditions",
        groupBy: "icd10",
        filter: { column: "patient_id", op: "equals", value: "p-0000000a" },
      }),
    ).toThrow(SqlBuildError);
  });
});

describe("column helpers", () => {
  it("filters codes by prefix and names by any part", () => {
    expect(filterColumnsFor(SCHEMA[1] as TableSchema)).toEqual([
      { column: "icd10", op: "starts_with" },
      { column: "description", op: "contains" },
    ]);
    expect(filterColumnsFor(SCHEMA[0] as TableSchema)).toEqual([]);
  });

  it("starts the summary on a coded record table", () => {
    expect(defaultSummary(SUMMARY_TABLES)).toEqual({ table: "conditions", groupBy: "icd10" });
    expect(defaultSummary(SUMMARY_TABLES.slice(0, 1))).toBeNull();
  });
});
