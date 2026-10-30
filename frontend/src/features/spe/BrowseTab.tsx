"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useId, useState } from "react";

import type { SpeTable } from "@/api/types";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatValue, humanise } from "@/lib/format";

import { ResultTable } from "./ResultTable";
import { browseSql, countSql, filterColumnsFor, PAGE_SIZE, type Filter } from "./sqlBuilder";
import { useDebounced, useSpeSql } from "./useSpeSql";

function firstRecordTable(tables: SpeTable[]): string {
  return (tables.find((table) => table.name !== "cohort") ?? tables[0])?.name ?? "";
}

/** Look at the records without writing SQL: pick a table, filter, page. */
export function BrowseTab({ permitId, tables }: { permitId: string; tables: SpeTable[] }) {
  const t = useT().spe.browse;
  const [tableName, setTableName] = useState(() => firstRecordTable(tables));
  const table = tables.find((candidate) => candidate.name === tableName) ?? tables[0];

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label={t.tables} className="grid gap-2">
        <h3 className="px-3 text-xs font-medium text-muted-foreground">{t.tables}</h3>
        <ul className="grid gap-0.5">
          {tables.map((candidate) => {
            const selected = candidate.name === table?.name;
            return (
              <li key={candidate.name}>
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => {
                    setTableName(candidate.name);
                  }}
                  className={cn(
                    "flex h-9 w-full cursor-pointer items-center justify-between gap-3 rounded-md px-3 text-left text-ui transition-colors duration-100 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "bg-accent font-medium hover:bg-accent",
                  )}
                >
                  <span className="truncate">{humanise(candidate.name)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatValue(candidate.rows)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {table ? <TableBrowser key={table.name} permitId={permitId} table={table} tables={tables} /> : null}
    </div>
  );
}

function TableBrowser({
  permitId,
  table,
  tables,
}: {
  permitId: string;
  table: SpeTable;
  tables: SpeTable[];
}) {
  const spe = useT().spe;
  const t = spe.browse;
  const id = useId();
  const filterColumns = filterColumnsFor(table);
  const [values, setValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const settled = useDebounced(values);
  const filters: Filter[] = filterColumns.map(({ column, op }) => ({
    column,
    op,
    value: settled[column] ?? "",
  }));
  const schema = tables.map(({ name, columns }) => ({ name, columns }));

  let sql: { rows: string; count: string } | null = null;
  let buildError: Error | null = null;
  try {
    sql = {
      rows: browseSql({ schema, table: table.name, filters, offset: page * PAGE_SIZE }),
      count: countSql({ schema, table: table.name, filters }),
    };
  } catch (error) {
    buildError = error instanceof Error ? error : new Error(String(error));
  }

  const rows = useSpeSql(permitId, sql?.rows ?? null);
  const count = useSpeSql(permitId, sql?.count ?? null);
  const counted = count.data?.rows[0]?.[0];
  const total = typeof counted === "number" ? counted : null;
  const first = page * PAGE_SIZE + 1;
  const last = Math.min((page + 1) * PAGE_SIZE, total ?? (page + 1) * PAGE_SIZE);

  return (
    <section aria-label={t.records(humanise(table.name))} className="grid min-w-0 gap-5">
      {filterColumns.length ? (
        <div className="flex flex-wrap items-end gap-4">
          {filterColumns.map(({ column, op }) => (
            <div key={column} className="grid gap-2">
              <Label htmlFor={`${id}-${column}`}>
                {humanise(column)} {t.filterOps[op]}
              </Label>
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id={`${id}-${column}`}
                  value={values[column] ?? ""}
                  placeholder={op === "starts_with" ? t.placeholderCode : t.placeholderText}
                  className="h-9 w-56 pl-8"
                  onChange={(event) => {
                    setValues({ ...values, [column]: event.target.value });
                    setPage(0);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {buildError ? (
        <ErrorState title={t.cannotBuild} error={buildError} />
      ) : rows.isError ? (
        <ErrorState title={t.loadFailed} error={rows.error} onRetry={() => void rows.refetch()} />
      ) : rows.isPending ? (
        <div className="grid gap-px" role="status" aria-label={t.loading}>
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-9" />
          ))}
        </div>
      ) : (
        <div className={cn("transition-opacity duration-100", rows.isPlaceholderData && "opacity-60")}>
          <ResultTable
            columns={rows.data.columns}
            rows={rows.data.rows}
            caption={t.records(humanise(table.name))}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ui text-muted-foreground tabular-nums" aria-live="polite">
          {total === null
            ? " "
            : total === 0
              ? spe.noRows
              : t.range(formatValue(first), formatValue(last), formatValue(total))}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-9"
            disabled={page === 0}
            onClick={() => {
              setPage(page - 1);
            }}
          >
            <ChevronLeft aria-hidden />
            {t.previous}
          </Button>
          <Button
            variant="outline"
            className="h-9"
            disabled={total === null || last >= total}
            onClick={() => {
              setPage(page + 1);
            }}
          >
            {t.next}
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      <p className="max-w-[60ch] text-xs text-muted-foreground">{t.pseudonyms}</p>
    </section>
  );
}
