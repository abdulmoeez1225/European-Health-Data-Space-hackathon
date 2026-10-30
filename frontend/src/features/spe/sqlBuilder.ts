/**
 * SQL for the no-code Browse and Summarise tabs. Table and column names are taken only from the
 * permit's own schema (GET /api/spe/{id}); values are quoted literals. The server still runs every
 * statement read-only. Exports are structured airlock requests: the server builds that SQL itself.
 */

import type { AirlockRequest } from "@/api/client";

export type TableSchema = { name: string; columns: string[] };

/** A workspace table with the group keys the airlock accepts for it. */
export type SummaryTable = TableSchema & { airlock_group_by: string[] };

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
/** Group keys that stand for the year of a date column, named as the airlock names them. */
const YEAR_OF: Record<string, string> = {
  onset_year: "onset_date",
  start_year: "start_date",
  end_year: "end_date",
  year: "date",
};
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
  const value = filter.value.trim();
  return value ? match(columnOf(table, filter.column), filter.op, value) : null;
}

function match(expression: string, op: FilterOp, value: string): string {
  const text = `CAST(${expression} AS VARCHAR)`;
  switch (op) {
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

type Summary = { table: string; groupBy: string; filter?: Filter | null };

function groupKeyOf(table: SummaryTable, key: string): string {
  if (!table.airlock_group_by.includes(key)) {
    throw new SqlBuildError(`${table.name} cannot be summarised by ${key}`);
  }
  return key;
}

/** What the Export button sends: the airlock counts patients and suppresses small cells itself. */
export function summaryRequest(tables: SummaryTable[], { table, groupBy, filter }: Summary): AirlockRequest {
  const source = tables.find((candidate) => candidate.name === table);
  if (!source) throw new SqlBuildError(`Unknown table: ${table}`);
  const value = filter?.value.trim();
  return {
    table: source.name,
    group_by: [groupKeyOf(source, groupBy)],
    filter: filter && value ? { column: groupKeyOf(source, filter.column), op: filter.op, value } : null,
  };
}

function keyExpression(key: string): string {
  const date = YEAR_OF[key];
  return date ? `year(${date})` : key;
}

/** The same aggregate as the airlock builds, with exact counts, for the preview inside the workspace. */
export function summarySql({ table, group_by, filter }: AirlockRequest): string {
  const select = group_by.map((key) => (YEAR_OF[key] ? `${keyExpression(key)} AS ${key}` : key));
  const where = filter ? ` WHERE ${match(keyExpression(filter.column), filter.op, filter.value)}` : "";
  const keys = group_by.join(", ");
  return `SELECT ${select.join(", ")}, count(DISTINCT patient_id) AS n FROM ${table}${where} GROUP BY ${keys} ORDER BY n DESC, ${keys}`;
}

/** Browse filters: codes match by prefix ("E11"), names and descriptions by any part. */
export function filterColumnsFor(table: TableSchema): { column: string; op: FilterOp }[] {
  return table.columns.flatMap((column): { column: string; op: FilterOp }[] => {
    if (CODE_COLUMNS.has(column)) return [{ column, op: "starts_with" }];
    if (TEXT_COLUMNS.has(column)) return [{ column, op: "contains" }];
    return [];
  });
}

/** A table that summarises well by default: patient-level records grouped by their code. */
export function defaultSummary(tables: SummaryTable[]): { table: string; groupBy: string } | null {
  const candidates = tables.filter((table) => table.airlock_group_by.length);
  const table = candidates.find((t) => t.airlock_group_by.some((c) => CODE_COLUMNS.has(c))) ?? candidates[0];
  const groupBy = table?.airlock_group_by.find((c) => CODE_COLUMNS.has(c)) ?? table?.airlock_group_by[0];
  return table && groupBy ? { table: table.name, groupBy } : null;
}
