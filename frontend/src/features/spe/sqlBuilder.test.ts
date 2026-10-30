import { describe, expect, it } from "vitest";

import {
  browseSql,
  countSql,
  defaultSummary,
  filterColumnsFor,
  groupableColumns,
  quoteLiteral,
  SqlBuildError,
  summarySql,
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
    expect(() => summarySql({ schema: SCHEMA, table: "conditions", groupBy: column })).toThrow(SqlBuildError);
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

describe("summarySql", () => {
  it("counts distinct patients per group in a column named n", () => {
    expect(summarySql({ schema: SCHEMA, table: "medications", groupBy: "atc" })).toBe(
      "SELECT atc, count(DISTINCT patient_id) AS n FROM medications GROUP BY atc ORDER BY n DESC, atc",
    );
  });

  it("applies one condition", () => {
    expect(
      summarySql({
        schema: SCHEMA,
        table: "conditions",
        groupBy: "icd10",
        filter: { column: "description", op: "contains", value: "Diabetes" },
      }),
    ).toBe(
      "SELECT icd10, count(DISTINCT patient_id) AS n FROM conditions WHERE contains(lower(CAST(description AS VARCHAR)), 'diabetes') GROUP BY icd10 ORDER BY n DESC, icd10",
    );
  });

  it("refuses to group by an identifying column", () => {
    expect(() => summarySql({ schema: SCHEMA, table: "encounters", groupBy: "encounter_id" })).toThrow(
      SqlBuildError,
    );
    expect(() => summarySql({ schema: SCHEMA, table: "conditions", groupBy: "patient_id" })).toThrow(
      SqlBuildError,
    );
  });
});

describe("column helpers", () => {
  it("offers only non-identifying columns for grouping", () => {
    expect(groupableColumns(SCHEMA[3] as TableSchema)).toEqual([
      "data_holder",
      "type",
      "start_date",
      "end_date",
      "primary_icd10",
    ]);
    expect(groupableColumns(SCHEMA[0] as TableSchema)).toEqual([]);
  });

  it("filters codes by prefix and names by any part", () => {
    expect(filterColumnsFor(SCHEMA[1] as TableSchema)).toEqual([
      { column: "icd10", op: "starts_with" },
      { column: "description", op: "contains" },
    ]);
    expect(filterColumnsFor(SCHEMA[0] as TableSchema)).toEqual([]);
  });

  it("starts the summary on a coded record table", () => {
    expect(defaultSummary(SCHEMA)).toEqual({ table: "conditions", groupBy: "icd10" });
    expect(defaultSummary([{ name: "cohort", columns: ["patient_id"] }])).toBeNull();
  });
});
