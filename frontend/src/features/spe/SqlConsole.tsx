"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowUpFromLine, Ban, CheckCircle2, Loader2, Lock, Play } from "lucide-react";
import { useId, useState } from "react";

import { api } from "@/api/client";
import { ApiError } from "@/api/errors";
import type { AirlockResult, QueryResult } from "@/api/types";
import { ErrorState } from "@/components/States";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";
import { capitalise, formatValue, isProtectedMarker } from "@/lib/format";

import { ResultTable } from "./ResultTable";

type Mode = "query" | "airlock";

export const PRESET_COPY = "COPY cohort TO 'out.csv'";
export const PRESET_AIRLOCK =
  "SELECT atc, count(DISTINCT patient_id) AS n FROM medications GROUP BY atc ORDER BY n DESC";

const PRESETS: { key: "presetCopy" | "presetAirlock"; sql: string; mode: Mode }[] = [
  { key: "presetCopy", sql: PRESET_COPY, mode: "query" },
  { key: "presetAirlock", sql: PRESET_AIRLOCK, mode: "airlock" },
];

type Outcome = { mode: "query"; data: QueryResult } | { mode: "airlock"; data: AirlockResult };

export function SqlConsole({ permitId }: { permitId: string }) {
  const t = useT().spe.sql;
  const inputId = useId();
  const [sql, setSql] = useState("SELECT * FROM conditions LIMIT 20");
  const run = useMutation({
    mutationFn: async ({ mode, text }: { mode: Mode; text: string }): Promise<Outcome> =>
      mode === "airlock"
        ? { mode, data: await api.speAirlock(permitId, text) }
        : { mode, data: await api.speQuery(permitId, text) },
  });
  const runningMode = run.isPending ? run.variables.mode : null;

  const execute = (mode: Mode, text = sql) => {
    if (text.trim() && !run.isPending) run.mutate({ mode, text: text.trim() });
  };

  return (
    <section aria-labelledby={`${inputId}-heading`} className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 id={`${inputId}-heading`} className="text-card-title font-semibold">
            {t.heading}
          </h3>
          <p className="text-ui text-muted-foreground">{t.hint}</p>
        </div>
        <span className="text-xs text-muted-foreground max-sm:hidden">{t.shortcut}</span>
      </div>
      <Label htmlFor={inputId} className="sr-only">
        {t.queryLabel}
      </Label>
      <Textarea
        id={inputId}
        value={sql}
        rows={6}
        spellCheck={false}
        onChange={(event) => {
          setSql(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            execute("query");
          }
        }}
        className="field-sizing-fixed resize-y font-mono text-data"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="h-9"
          disabled={run.isPending}
          onClick={() => {
            execute("query");
          }}
        >
          {runningMode === "query" ? <Loader2 aria-hidden className="animate-spin" /> : <Play aria-hidden />}
          {t.run}
        </Button>
        <Button
          variant="outline"
          className="h-9"
          disabled={run.isPending}
          onClick={() => {
            execute("airlock");
          }}
        >
          {runningMode === "airlock" ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <ArrowUpFromLine aria-hidden />
          )}
          {t.export}
        </Button>
        <span className="mx-1 h-4 w-px bg-border max-sm:hidden" aria-hidden />
        <span className="text-data text-muted-foreground">{t.examples}</span>
        {PRESETS.map((preset) => (
          <Button
            key={preset.key}
            variant="ghost"
            className="h-9"
            disabled={run.isPending}
            onClick={() => {
              setSql(preset.sql);
              execute(preset.mode, preset.sql);
            }}
          >
            {t[preset.key]}
          </Button>
        ))}
      </div>

      <p role="status" className="sr-only">
        {run.isPending ? t.running : run.isSuccess ? t.ready : run.isError ? t.failedStatus : ""}
      </p>
      {run.isError || run.isSuccess ? (
        <div className="mt-2 grid gap-3">
          {run.isError ? <QueryError error={run.error} /> : null}
          {run.isSuccess ? <OutcomeView outcome={run.data} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function QueryError({ error }: { error: Error }) {
  const t = useT().spe.sql;
  const blocked = error instanceof ApiError && error.status === 400 && /^blocked/i.test(error.message);
  if (!blocked) return <ErrorState title={t.queryFailed} error={error} />;
  return (
    <Alert variant="destructive" role="alert">
      <Ban />
      <AlertTitle>{t.blockedTitle}</AlertTitle>
      <AlertDescription>
        {t.blockedText(capitalise(error.message.replace(/^Blocked:\s*/i, "")))}
      </AlertDescription>
    </Alert>
  );
}

function OutcomeView({ outcome }: { outcome: Outcome }) {
  const spe = useT().spe;
  const t = spe.sql;
  if (outcome.mode === "query") {
    const { data } = outcome;
    return (
      <>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock aria-hidden className="size-3" />
          {spe.rows(data.rows.length, formatValue(data.rows.length))} · {t.insideOnly}
          {data.truncated ? ` · ${t.truncated}` : ""}
        </p>
        <ResultTable columns={data.columns} rows={data.rows} caption={t.queryResult} rawHeaders />
      </>
    );
  }

  const { data } = outcome;
  const rows = data.rows ?? [];
  const reasons = data.reasons ?? [];
  if (data.status === "blocked") {
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
    <>
      <p className="flex flex-wrap items-center gap-1.5 text-ui">
        <CheckCircle2 aria-hidden className="size-4 text-success" />
        <span className="font-medium">{spe.airlock.released}</span>
        <span className="text-muted-foreground">
          ·{" "}
          {spe.airlock.releasedSuppressed(
            spe.rows(rows.length - suppressed, formatValue(rows.length - suppressed)),
            formatValue(suppressed),
          )}
        </span>
      </p>
      {reasons.length ? (
        <ul className="grid gap-0.5 text-xs text-muted-foreground">
          {reasons.map((reason) => (
            <li key={reason}>{capitalise(reason)}</li>
          ))}
        </ul>
      ) : null}
      <ResultTable columns={data.columns ?? []} rows={rows} caption={spe.airlock.region} rawHeaders />
    </>
  );
}
