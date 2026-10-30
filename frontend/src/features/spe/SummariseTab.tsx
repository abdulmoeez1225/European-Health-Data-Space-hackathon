"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowUpFromLine, Ban, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import { useId, useState } from "react";

import { api } from "@/api/client";
import type { SpeTable } from "@/api/types";
import { CodeBlock } from "@/components/CodeBlock";
import { ErrorState } from "@/components/States";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { capitalise, formatValue, humanise, isProtectedMarker, plural } from "@/lib/format";

import { ResultTable } from "./ResultTable";
import { defaultSummary, groupableColumns, summarySql, type FilterOp } from "./sqlBuilder";
import { useDebounced, useSpeSql } from "./useSpeSql";

const OPS: { value: FilterOp; label: string }[] = [
  { value: "starts_with", label: "starts with" },
  { value: "contains", label: "contains" },
  { value: "equals", label: "is" },
];

const summaryLabel = (column: string) => (column === "n" ? "Patients" : humanise(column));

/** A no-code aggregate: patients per group, previewed inside, exported through the airlock. */
export function SummariseTab({ permitId, tables }: { permitId: string; tables: SpeTable[] }) {
  const id = useId();
  const schema = tables.map(({ name, columns }) => ({ name, columns }));
  const countable = tables.filter(
    (table) => table.columns.includes("patient_id") && groupableColumns(table).length,
  );
  const initial = defaultSummary(schema);

  const [tableName, setTableName] = useState(initial?.table ?? "");
  const [groupBy, setGroupBy] = useState(initial?.groupBy ?? "");
  const [condition, setCondition] = useState<{ column: string; op: FilterOp; value: string } | null>(null);
  const settledValue = useDebounced(condition?.value ?? "");

  const table = countable.find((candidate) => candidate.name === tableName);
  const columns = table ? groupableColumns(table) : [];
  const exportRun = useMutation({ mutationFn: (sql: string) => api.speAirlock(permitId, sql) });

  let sql: string | null = null;
  let buildError: Error | null = null;
  try {
    sql = table
      ? summarySql({
          schema,
          table: table.name,
          groupBy,
          filter: condition ? { ...condition, value: settledValue } : null,
        })
      : null;
  } catch (error) {
    buildError = error instanceof Error ? error : new Error(String(error));
  }
  const preview = useSpeSql(permitId, sql);
  // An export belongs to the summary it was made from; changing the controls clears it.
  const exported = exportRun.variables === sql ? exportRun : null;

  const chooseTable = (name: string) => {
    const next = countable.find((candidate) => candidate.name === name);
    const nextColumns = next ? groupableColumns(next) : [];
    setTableName(name);
    setGroupBy(nextColumns[0] ?? "");
    setCondition(null);
  };

  if (!countable.length) {
    return (
      <p className="text-ui text-muted-foreground">No table in this permit can be summarised by patient.</p>
    );
  }

  return (
    <div className="grid gap-8">
      <section aria-label="Summary" className="grid gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3 text-ui">
          <span>Count patients in</span>
          <Select value={tableName} onValueChange={chooseTable}>
            <SelectTrigger aria-label="Table" className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {countable.map((candidate) => (
                <SelectItem key={candidate.name} value={candidate.name}>
                  {humanise(candidate.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>by</span>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger aria-label="Group by" className="h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {columns.map((column) => (
                <SelectItem key={column} value={column}>
                  {humanise(column)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {condition ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3 text-ui">
            <span>where</span>
            <Select
              value={condition.column}
              onValueChange={(column) => {
                setCondition({ ...condition, column });
              }}
            >
              <SelectTrigger aria-label="Condition column" className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {columns.map((column) => (
                  <SelectItem key={column} value={column}>
                    {humanise(column)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={condition.op}
              onValueChange={(op) => {
                setCondition({ ...condition, op: op as FilterOp });
              }}
            >
              <SelectTrigger aria-label="Condition" className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id={`${id}-value`}
              aria-label="Value"
              value={condition.value}
              placeholder="e.g. A10"
              className="h-9 w-44"
              onChange={(event) => {
                setCondition({ ...condition, value: event.target.value });
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove condition"
              onClick={() => {
                setCondition(null);
              }}
            >
              <X />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="h-9 w-fit"
            onClick={() => {
              setCondition({
                column: columns.find((c) => c !== groupBy) ?? groupBy,
                op: "starts_with",
                value: "",
              });
            }}
          >
            <Plus aria-hidden />
            Add condition
          </Button>
        )}
      </section>

      {/* The export result sits next to the controls that produced it, above the long preview. */}
      <p role="status" className="sr-only">
        {exported?.isSuccess
          ? exported.data.status === "released"
            ? "Released through the airlock."
            : "The airlock refused the export."
          : ""}
      </p>
      {exported?.isError ? <ErrorState title="The export failed" error={exported.error} /> : null}
      {exported?.isSuccess ? <AirlockResultView result={exported.data} /> : null}
      <section aria-labelledby={`${id}-preview`} className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 id={`${id}-preview`} className="text-card-title font-semibold">
              Preview
            </h3>
            <p className="text-ui text-muted-foreground">Exact counts, visible only inside this workspace.</p>
          </div>
          <Button
            className="h-9"
            disabled={sql === null || exportRun.isPending}
            onClick={() => {
              if (sql) exportRun.mutate(sql);
            }}
          >
            {exportRun.isPending ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : (
              <ArrowUpFromLine aria-hidden />
            )}
            Export via airlock
          </Button>
        </div>
        {buildError ? (
          <ErrorState title="This summary cannot be built" error={buildError} />
        ) : preview.isError ? (
          <ErrorState title="The summary could not be computed" error={preview.error} />
        ) : preview.isPending ? (
          <div className="grid gap-px" role="status" aria-label="Computing summary">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-9" />
            ))}
          </div>
        ) : (
          <div className={cn("transition-opacity duration-100", preview.isPlaceholderData && "opacity-60")}>
            <ResultTable
              className="max-w-2xl"
              columns={preview.data.columns}
              rows={preview.data.rows}
              caption="Summary preview"
              columnLabel={summaryLabel}
            />
          </div>
        )}
        {sql ? <CodeBlock title="Show SQL" language="SQL" code={sql} /> : null}
      </section>
    </div>
  );
}

function AirlockResultView({ result }: { result: Awaited<ReturnType<typeof api.speAirlock>> }) {
  const rows = result.rows ?? [];
  const reasons = result.reasons ?? [];
  if (result.status === "blocked") {
    return (
      <Alert variant="destructive" role="alert">
        <Ban />
        <AlertTitle>The airlock refused the export</AlertTitle>
        <AlertDescription>
          <ul className="grid list-disc gap-0.5 pl-4">
            {reasons.map((reason) => (
              <li key={reason}>{capitalise(reason)}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>
    );
  }
  const suppressed = rows.filter((row) => row.some(isProtectedMarker)).length;
  return (
    <section aria-label="Airlock export" className="grid gap-4">
      <p className="flex flex-wrap items-center gap-1.5 text-ui">
        <CheckCircle2 aria-hidden className="size-4 text-success" />
        <span className="font-medium">Released through the airlock</span>
        <span className="text-muted-foreground">
          · {plural(rows.length - suppressed, "row")} · {formatValue(suppressed)} suppressed
        </span>
      </p>
      <ResultTable
        className="max-w-2xl"
        columns={result.columns ?? []}
        rows={rows}
        caption="Airlock export"
        columnLabel={summaryLabel}
      />
    </section>
  );
}
