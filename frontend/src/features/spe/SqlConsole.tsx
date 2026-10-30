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
import { capitalise, formatValue, isProtectedMarker, plural } from "@/lib/format";

import { ResultTable } from "./ResultTable";

type Mode = "query" | "airlock";

export const PRESET_COPY = "COPY cohort TO 'out.csv'";
export const PRESET_AIRLOCK =
  "SELECT atc, count(DISTINCT patient_id) AS n FROM medications GROUP BY atc ORDER BY n DESC";

const PRESETS: { label: string; sql: string; mode: Mode }[] = [
  { label: "Try COPY to file", sql: PRESET_COPY, mode: "query" },
  { label: "Airlock export", sql: PRESET_AIRLOCK, mode: "airlock" },
];

type Outcome = { mode: "query"; data: QueryResult } | { mode: "airlock"; data: AirlockResult };

export function SqlConsole({ permitId }: { permitId: string }) {
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
            SQL console
          </h3>
          <p className="text-ui text-muted-foreground">
            Read-only SELECT on this permit&apos;s tables. Results stay inside.
          </p>
        </div>
        <span className="text-xs text-muted-foreground max-sm:hidden">⌘/Ctrl + Enter to run</span>
      </div>
      <Label htmlFor={inputId} className="sr-only">
        SQL query
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
          Run
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
          Export via airlock
        </Button>
        <span className="mx-1 h-4 w-px bg-border max-sm:hidden" aria-hidden />
        <span className="text-data text-muted-foreground">Examples:</span>
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            variant="ghost"
            className="h-9"
            disabled={run.isPending}
            onClick={() => {
              setSql(preset.sql);
              execute(preset.mode, preset.sql);
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <p role="status" className="sr-only">
        {run.isPending
          ? "Running…"
          : run.isSuccess
            ? "Result ready."
            : run.isError
              ? "The query did not run."
              : ""}
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
  const blocked = error instanceof ApiError && error.status === 400 && /^blocked/i.test(error.message);
  if (!blocked) return <ErrorState title="The query failed" error={error} />;
  return (
    <Alert variant="destructive" role="alert">
      <Ban />
      <AlertTitle>Blocked inside the secure environment</AlertTitle>
      <AlertDescription>
        {capitalise(error.message.replace(/^Blocked:\s*/i, ""))}. Nothing can be written to files or taken out
        of the environment (Art. 73).
      </AlertDescription>
    </Alert>
  );
}

function OutcomeView({ outcome }: { outcome: Outcome }) {
  if (outcome.mode === "query") {
    const { data } = outcome;
    return (
      <>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock aria-hidden className="size-3" />
          {plural(data.rows.length, "row")} · inside the environment only
          {data.truncated ? " · truncated by the server" : ""}
        </p>
        <ResultTable columns={data.columns} rows={data.rows} caption="Query result" rawHeaders />
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
    <>
      <p className="flex flex-wrap items-center gap-1.5 text-ui">
        <CheckCircle2 aria-hidden className="size-4 text-success" />
        <span className="font-medium">Released through the airlock</span>
        <span className="text-muted-foreground">
          · {plural(rows.length - suppressed, "row")} released · {formatValue(suppressed)} suppressed
        </span>
      </p>
      {reasons.length ? (
        <ul className="grid gap-0.5 text-xs text-muted-foreground">
          {reasons.map((reason) => (
            <li key={reason}>{capitalise(reason)}</li>
          ))}
        </ul>
      ) : null}
      <ResultTable columns={data.columns ?? []} rows={rows} caption="Airlock export" rawHeaders />
    </>
  );
}
