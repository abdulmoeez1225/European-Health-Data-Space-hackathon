"use client";

import { useMutation } from "@tanstack/react-query";
import { Ban, Loader2, Lock, Play } from "lucide-react";
import { useId, useState } from "react";

import { api } from "@/api/client";
import { ApiError } from "@/api/errors";
import type { QueryResult } from "@/api/types";
import { ErrorState } from "@/components/States";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";
import { capitalise, formatValue } from "@/lib/format";

import { ResultTable } from "./ResultTable";

export const PRESET_COPY = "COPY cohort TO 'out.csv'";

export function SqlConsole({ permitId }: { permitId: string }) {
  const t = useT().spe.sql;
  const inputId = useId();
  const [sql, setSql] = useState("SELECT * FROM conditions LIMIT 20");
  const run = useMutation({ mutationFn: (text: string) => api.speQuery(permitId, text) });

  const execute = (text = sql) => {
    if (text.trim() && !run.isPending) run.mutate(text.trim());
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
            execute();
          }
        }}
        className="field-sizing-fixed resize-y font-mono text-data"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="h-9"
          disabled={run.isPending}
          onClick={() => {
            execute();
          }}
        >
          {run.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <Play aria-hidden />}
          {t.run}
        </Button>
        <span className="mx-1 h-4 w-px bg-border max-sm:hidden" aria-hidden />
        <span className="text-data text-muted-foreground">{t.examples}</span>
        <Button
          variant="ghost"
          className="h-9"
          disabled={run.isPending}
          onClick={() => {
            setSql(PRESET_COPY);
            execute(PRESET_COPY);
          }}
        >
          {t.presetCopy}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t.exportHint}</p>

      <p role="status" className="sr-only">
        {run.isPending ? t.running : run.isSuccess ? t.ready : run.isError ? t.failedStatus : ""}
      </p>
      {run.isError || run.isSuccess ? (
        <div className="mt-2 grid gap-3">
          {run.isError ? <QueryError error={run.error} /> : null}
          {run.isSuccess ? <QueryOutcome data={run.data} /> : null}
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

function QueryOutcome({ data }: { data: QueryResult }) {
  const spe = useT().spe;
  const t = spe.sql;
  return (
    <>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock aria-hidden className="size-3" />
        {spe.rows(data.rows.length, formatValue(data.rows.length))} · {t.insideOnly}
        {data.truncated ? ` · ${t.truncated}` : ""}
        {data.truncated_cells ? ` · ${t.cellsTruncated(formatValue(data.truncated_cells))}` : ""}
      </p>
      <ResultTable columns={data.columns} rows={data.rows} caption={t.queryResult} rawHeaders />
    </>
  );
}
