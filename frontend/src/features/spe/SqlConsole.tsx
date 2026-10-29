"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowUpFromLine, Ban, CheckCircle2, Play, ShieldX, Terminal } from "lucide-react";
import { useId, useState } from "react";

import { api } from "@/api/client";
import { ApiError, errorMessage } from "@/api/errors";
import type { AirlockResult, QueryResult } from "@/api/types";
import { DataGrid } from "@/components/DataGrid";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { isProtectedMarker, plural } from "@/lib/format";

type Mode = "query" | "airlock";

export const PRESET_COPY = "COPY cohort TO 'out.csv'";
export const PRESET_AIRLOCK =
  "SELECT atc, count(DISTINCT patient_id) AS n FROM medications GROUP BY atc ORDER BY n DESC";

const PRESETS: { label: string; sql: string; mode: Mode }[] = [
  { label: "Browse conditions", sql: "SELECT * FROM conditions LIMIT 20", mode: "query" },
  { label: `Try: ${PRESET_COPY}`, sql: PRESET_COPY, mode: "query" },
  { label: "Airlock export", sql: PRESET_AIRLOCK, mode: "airlock" },
  {
    label: "Airlock with patient IDs",
    sql: "SELECT patient_id, count(*) AS n FROM conditions GROUP BY patient_id",
    mode: "airlock",
  },
];

type Outcome = { mode: "query"; data: QueryResult } | { mode: "airlock"; data: AirlockResult };

export function SqlConsole({ permitId }: { permitId: string }) {
  const inputId = useId();
  const [sql, setSql] = useState(PRESETS[0]?.sql ?? "");
  const run = useMutation({
    mutationFn: async ({ mode, text }: { mode: Mode; text: string }): Promise<Outcome> =>
      mode === "airlock"
        ? { mode, data: await api.speAirlock(permitId, text) }
        : { mode, data: await api.speQuery(permitId, text) },
  });

  const execute = (mode: Mode, text = sql) => {
    if (text.trim() && !run.isPending) run.mutate({ mode, text: text.trim() });
  };

  return (
    <Section
      headingLevel={2}
      title="SQL console"
      icon={<Terminal />}
      description="Read-only SELECT on this permit's tables. Results stay inside; only the airlock can release aggregates."
    >
      <label htmlFor={inputId} className="sr-only">
        SQL query
      </label>
      <textarea
        id={inputId}
        value={sql}
        onChange={(event) => {
          setSql(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            execute("query");
          }
        }}
        rows={4}
        spellCheck={false}
        className="block w-full resize-y rounded-xl border border-line bg-code px-4 py-3 font-mono text-[0.8125rem] leading-relaxed focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={<Play aria-hidden className="size-4" />}
          loading={run.isPending && run.variables.mode === "query"}
          disabled={run.isPending}
          onClick={() => {
            execute("query");
          }}
        >
          Run
        </Button>
        <Button
          icon={<ArrowUpFromLine aria-hidden className="size-4" />}
          loading={run.isPending && run.variables.mode === "airlock"}
          disabled={run.isPending}
          onClick={() => {
            execute("airlock");
          }}
        >
          Export via airlock
        </Button>
        <span className="hidden text-xs text-muted sm:inline">⌘/Ctrl + Enter runs</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">Presets</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={run.isPending}
            onClick={() => {
              setSql(preset.sql);
              execute(preset.mode, preset.sql);
            }}
            className="rounded-full border border-line bg-surface-2 px-3 py-1 font-mono text-xs text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <p role="status" className="sr-only">
        {run.isPending ? "Running…" : run.isSuccess ? "Result ready." : ""}
      </p>
      <div className="mt-5">
        {run.isError ? <QueryError error={run.error} /> : null}
        {run.isSuccess ? <OutcomeView outcome={run.data} /> : null}
      </div>
    </Section>
  );
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function QueryError({ error }: { error: Error }) {
  const blocked = error instanceof ApiError && error.status === 400 && /^blocked/i.test(error.message);
  if (blocked) {
    return (
      <Banner tone="blocked" title="Blocked inside the secure environment" live>
        {capitalise(error.message.replace(/^Blocked:\s*/i, ""))}. Nothing can be written to files or taken out
        of the environment (Art. 73).
      </Banner>
    );
  }
  return (
    <Banner tone="error" title="The query failed" live>
      {errorMessage(error)}
    </Banner>
  );
}

function OutcomeView({ outcome }: { outcome: Outcome }) {
  if (outcome.mode === "query") {
    const { data } = outcome;
    return (
      <div className="animate-fade">
        <p className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Pill tone="spe">Inside the environment only</Pill>
          {plural(data.rows.length, "row")}
          {data.truncated ? " (first rows only, truncated by the server)" : ""}
        </p>
        <DataGrid columns={data.columns} rows={data.rows} caption="Query result" />
      </div>
    );
  }
  const { data } = outcome;
  const rows = data.rows ?? [];
  const reasons = data.reasons ?? [];
  if (data.status === "blocked") {
    return (
      <Banner tone="blocked" title="Airlock refused the export" live>
        <ul className="mt-1 grid list-disc gap-0.5 pl-5">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </Banner>
    );
  }
  const suppressed = rows.filter((row) => row.some(isProtectedMarker)).length;
  return (
    <div className="animate-fade">
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-stats/35 bg-stats-soft px-4 py-3">
        <CheckCircle2 aria-hidden className="size-5 text-stats" />
        <p className="font-semibold text-fg">Released through the airlock</p>
        <p className="text-sm text-muted">
          {plural(rows.length - suppressed, "row")} released as is
          {suppressed ? (
            <>
              {" · "}
              <span className="inline-flex items-center gap-1">
                <Ban aria-hidden className="size-3.5" />
                {plural(suppressed, "row")} with fewer than 10 patients suppressed
              </span>
            </>
          ) : null}
        </p>
      </div>
      {reasons.length ? (
        <ul className="mb-3 grid gap-1 text-sm text-muted">
          {reasons.map((reason) => (
            <li key={reason} className="flex gap-2">
              <ShieldX aria-hidden className="mt-0.5 size-4 shrink-0" />
              {reason}
            </li>
          ))}
        </ul>
      ) : null}
      <DataGrid columns={data.columns ?? []} rows={rows} caption="Airlock export" />
    </div>
  );
}
