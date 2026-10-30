/**
 * SQL for the no-code Browse and Summarise tabs. Table and column names are taken only from the
 * permit's own schema (GET /api/spe/{id}); values are quoted literals. The server still runs every
 * statement read-only, and the airlock still checks every export.
 */

export type TableSchema = { name: string; columns: string[] };

export type FilterOp = "starts_with" | "contains" | "equals";

export type Filter = { column: string; op: FilterOp; value: string };

export class SqlBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlBuildError";
  }
}

export const PAGE_SIZE = 50;
const MAX_LIMIT = 200;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** The airlock refuses results with these columns, so they are never offered for grouping. */
const IDENTIFYING = /patient_id|encounter_id|birth_date/i;
const CODE_COLUMNS = new Set(["icd10", "atc", "loinc", "primary_icd10"]);
const TEXT_COLUMNS = new Set(["name", "description"]);

export function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function tableOf(schema: TableSchema[], name: string): TableSchema {
  const table = schema.find((candidate) => candidate.name === name);
  if (!table || !IDENTIFIER.test(table.name)) throw new SqlBuildError(`Unknown table: ${name}`);
  return table;
}

function columnOf(table: TableSchema, name: string): string {
  if (!IDENTIFIER.test(name) || !table.columns.includes(name)) {
    throw new SqlBuildError(`Unknown column in ${table.name}: ${name}`);
  }
  return name;
}

function count(value: number, label: string, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new SqlBuildError(`${label} must be a whole number from 0 to ${max}`);
  }
  return value;
}

function condition(table: TableSchema, filter: Filter): string | null {
  const column = columnOf(table, filter.column);
  const value = filter.value.trim();
  if (!value) return null;
  const text = `CAST(${column} AS VARCHAR)`;
  switch (filter.op) {
    case "starts_with":
      return `starts_with(lower(${text}), ${quoteLiteral(value.toLowerCase())})`;
    case "contains":
      return `contains(lower(${text}), ${quoteLiteral(value.toLowerCase())})`;
    case "equals":
      return `${text} = ${quoteLiteral(value)}`;
  }
}

function where(table: TableSchema, filters: Filter[]): string {
  const conditions = filters.map((filter) => condition(table, filter)).filter((c): c is string => c !== null);
  return conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
}

type BrowseArgs = {
  schema: TableSchema[];
  table: string;
  filters: Filter[];
  limit?: number;
  offset?: number;
};

export function browseSql({ schema, table, filters, limit = PAGE_SIZE, offset = 0 }: BrowseArgs): string {
  const source = tableOf(schema, table);
  return `SELECT * FROM ${source.name}${where(source, filters)} ORDER BY ALL LIMIT ${count(limit, "LIMIT", MAX_LIMIT)} OFFSET ${count(offset, "OFFSET")}`;
}

export function countSql({ schema, table, filters }: Omit<BrowseArgs, "limit" | "offset">): string {
  const source = tableOf(schema, table);
  return `SELECT count(*) AS n FROM ${source.name}${where(source, filters)}`;
}

type SummaryArgs = { schema: TableSchema[]; table: string; groupBy: string; filter?: Filter | null };

/** Patients per group; the `n` column is what the airlock checks against the small-cell rule. */
export function summarySql({ schema, table, groupBy, filter }: SummaryArgs): string {
  const source = tableOf(schema, table);
  if (!source.columns.includes("patient_id")) {
    throw new SqlBuildError(`${source.name} has no patient_id to count patients`);
  }
  const group = columnOf(source, groupBy);
  if (IDENTIFYING.test(group)) throw new SqlBuildError(`${group} identifies patients and cannot be a group`);
  return `SELECT ${group}, count(DISTINCT patient_id) AS n FROM ${source.name}${where(source, filter ? [filter] : [])} GROUP BY ${group} ORDER BY n DESC, ${group}`;
}

/** Columns that can be grouped by or filtered on: everything except identifiers. */
export function groupableColumns(table: TableSchema): string[] {
  return table.columns.filter((column) => IDENTIFIER.test(column) && !IDENTIFYING.test(column));
}

/** Browse filters: codes match by prefix ("E11"), names and descriptions by any part. */
export function filterColumnsFor(table: TableSchema): { column: string; op: FilterOp }[] {
  return table.columns.flatMap((column): { column: string; op: FilterOp }[] => {
    if (CODE_COLUMNS.has(column)) return [{ column, op: "starts_with" }];
    if (TEXT_COLUMNS.has(column)) return [{ column, op: "contains" }];
    return [];
  });
}

/** A table that summarises well by default: patient-level records with a code column. */
export function defaultSummary(schema: TableSchema[]): { table: string; groupBy: string } | null {
  const candidates = schema.filter(
    (table) => table.columns.includes("patient_id") && groupableColumns(table).length,
  );
  const table =
    candidates.find((t) => t.name !== "cohort" && t.columns.some((c) => CODE_COLUMNS.has(c))) ??
    candidates[0];
  if (!table) return null;
  const columns = groupableColumns(table);
  const groupBy = columns.find((c) => CODE_COLUMNS.has(c)) ?? columns[0];
  return groupBy ? { table: table.name, groupBy } : null;
}
