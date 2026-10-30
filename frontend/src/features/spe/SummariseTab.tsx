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
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { capitalise, formatValue, humanise, isProtectedMarker } from "@/lib/format";

import { ResultTable } from "./ResultTable";
import { defaultSummary, groupableColumns, summarySql, type FilterOp } from "./sqlBuilder";
import { useDebounced, useSpeSql } from "./useSpeSql";

const OPS: FilterOp[] = ["starts_with", "contains", "equals"];

/** A no-code aggregate: patients per group, previewed inside, exported through the airlock. */
export function SummariseTab({ permitId, tables }: { permitId: string; tables: SpeTable[] }) {
  const t = useT().spe.summarise;
  const id = useId();
  const summaryLabel = (column: string) => (column === "n" ? t.patientsColumn : humanise(column));
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
    return <p className="text-ui text-muted-foreground">{t.noTable}</p>;
  }

  return (
    <div className="grid gap-8">
      <section aria-label={t.summary} className="grid gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3 text-ui">
          <span>{t.countPatientsIn}</span>
          <Select value={tableName} onValueChange={chooseTable}>
            <SelectTrigger aria-label={t.tableLabel} className="h-9 w-44">
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
          <span>{t.by}</span>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger aria-label={t.groupBy} className="h-9 w-48">
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
            <span>{t.where}</span>
            <Select
              value={condition.column}
              onValueChange={(column) => {
                setCondition({ ...condition, column });
              }}
            >
              <SelectTrigger aria-label={t.conditionColumn} className="h-9 w-48">
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
              <SelectTrigger aria-label={t.condition} className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPS.map((op) => (
                  <SelectItem key={op} value={op}>
                    {t.ops[op]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id={`${id}-value`}
              aria-label={t.value}
              value={condition.value}
              placeholder={t.valuePlaceholder}
              className="h-9 w-44"
              onChange={(event) => {
                setCondition({ ...condition, value: event.target.value });
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.removeCondition}
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
            {t.addCondition}
          </Button>
        )}
      </section>

      {/* The export result sits next to the controls that produced it, above the long preview. */}
      <p role="status" className="sr-only">
        {exported?.isSuccess
          ? exported.data.status === "released"
            ? t.releasedStatus
            : t.refusedStatus
          : ""}
      </p>
      {exported?.isError ? <ErrorState title={t.exportFailed} error={exported.error} /> : null}
      {exported?.isSuccess ? <AirlockResultView result={exported.data} columnLabel={summaryLabel} /> : null}
      <section aria-labelledby={`${id}-preview`} className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 id={`${id}-preview`} className="text-card-title font-semibold">
              {t.preview}
            </h3>
            <p className="text-ui text-muted-foreground">{t.previewNote}</p>
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
            {t.export}
          </Button>
        </div>
        {buildError ? (
          <ErrorState title={t.cannotBuild} error={buildError} />
        ) : preview.isError ? (
          <ErrorState title={t.computeFailed} error={preview.error} />
        ) : preview.isPending ? (
          <div className="grid gap-px" role="status" aria-label={t.computing}>
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
              caption={t.previewCaption}
              columnLabel={summaryLabel}
            />
          </div>
        )}
        {sql ? <CodeBlock title={t.showSql} language="SQL" code={sql} /> : null}
      </section>
    </div>
  );
}

function AirlockResultView({
  result,
  columnLabel,
}: {
  result: Awaited<ReturnType<typeof api.speAirlock>>;
  columnLabel: (column: string) => string;
}) {
  const spe = useT().spe;
  const rows = result.rows ?? [];
  const reasons = result.reasons ?? [];
  if (result.status === "blocked") {
    return (
      <Alert variant="destructive" role="alert">
        <Ban />
        <AlertTitle>{spe.airlock.refused}</AlertTitle>
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
    <section aria-label={spe.airlock.region} className="grid gap-4">
      <p className="flex flex-wrap items-center gap-1.5 text-ui">
        <CheckCircle2 aria-hidden className="size-4 text-success" />
        <span className="font-medium">{spe.airlock.released}</span>
        <span className="text-muted-foreground">
          ·{" "}
          {spe.airlock.suppressed(
            spe.rows(rows.length - suppressed, formatValue(rows.length - suppressed)),
            formatValue(suppressed),
          )}
        </span>
      </p>
      <ResultTable
        className="max-w-2xl"
        columns={result.columns ?? []}
        rows={rows}
        caption={spe.airlock.region}
        columnLabel={columnLabel}
      />
    </section>
  );
}
