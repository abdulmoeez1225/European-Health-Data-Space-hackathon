"use client";

import { AlertTriangle, CheckCircle2, CircleSlash, FileText, Loader2, XCircle } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { errorMessage } from "@/api/errors";
import { useWithdraw } from "@/api/queries";
import { readRequest } from "@/api/request";
import type { CodeMapping, Consensus, PrivacyCheck, RequestResult, Withdrawal } from "@/api/types";
import { ArticleChip } from "@/components/ArticleChip";
import { CodeBlock } from "@/components/CodeBlock";
import { DecisionBadge } from "@/components/DecisionBadge";
import { DecisionLetter } from "@/components/letter/DecisionLetter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { purposeLabel } from "@/lib/decisions";
import { formatTime, formatValue, humanise } from "@/lib/format";
import { parseLegalLine } from "@/lib/legal";

/** An issued decision as a case officer checks it; the one action is to withdraw it. */
export function RequestDetail({ result }: { result: RequestResult }) {
  const request = readRequest(result.request);
  const flags = result.review_flags ?? [];
  const details = new Map(
    result.legal_basis
      .map((line) => parseLegalLine(line))
      .flatMap(({ article, text }) => (article ? [[article, text]] : [])),
  );

  return (
    <article aria-labelledby="detail-title" className="grid gap-8 px-5 py-8 sm:px-8">
      {result.withdrawal ? <WithdrawnStamp withdrawal={result.withdrawal} /> : null}
      {result.needs_attention && flags.length ? (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Why this needs attention</AlertTitle>
          <AlertDescription>
            <ul className="grid list-disc gap-1 pl-4">
              {flags.map((flag) => (
                <li key={flag.reason}>{flag.reason}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <header className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <p className="text-caption text-subtle-foreground">
              <span className="font-mono">{result.request_id}</span> · {formatTime(result.processed_at)}
            </p>
            <h2 id="detail-title" className="text-section font-semibold">
              {request.applicant.organisation || result.request_id}
            </h2>
          </div>
          {result.status === "issued" ? <WithdrawAction result={result} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DecisionBadge decision={result.decision} />
          {result.articles.map((article) => (
            <ArticleChip key={article} article={article} detail={details.get(article)} />
          ))}
        </div>
        <p className="max-w-[60ch] text-body text-foreground/85">{result.reason}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui text-muted-foreground">
          <LetterPreview result={result} />
          {result.spe ? (
            <span>
              Permit <span className="font-mono text-foreground">{result.spe.permit_id}</span> ·{" "}
              {formatValue(result.spe.cohort_size)} patients
            </span>
          ) : null}
        </div>
      </header>

      <Section title="AI assessment">
        <dl className="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-6 gap-y-3 text-ui">
          <Property label="Prohibited ground">
            {result.assessment.prohibited ? (
              <span className="font-medium">{humanise(result.assessment.prohibited_ground)}</span>
            ) : (
              "None"
            )}
          </Property>
          <Property label="Purpose">{purposeLabel(result.assessment.allowed_purpose)}</Property>
          <Property label="Records justified">{result.assessment.records_justified ? "Yes" : "No"}</Property>
          <Property label="Consensus">
            <ConsensusSummary consensus={result.consensus} hasPlan={Boolean(result.plan)} />
          </Property>
        </dl>
        {result.assessment.justification ? (
          <blockquote className="max-w-[60ch] border-l-2 pl-4 text-body text-muted-foreground">
            {result.assessment.justification}
          </blockquote>
        ) : null}
      </Section>

      {result.code_mappings?.length ? (
        <Section title="Code mappings">
          <MappingsTable mappings={result.code_mappings} />
        </Section>
      ) : null}

      {result.statistics?.privacy_checks.length ? (
        <Section title="Privacy checks">
          <ChecksList checks={result.statistics.privacy_checks} />
        </Section>
      ) : null}

      {result.plan || result.statistics ? (
        <Section
          title="Query plan and SQL"
          description="The language model writes the plan; the SQL is compiled from it by rules."
        >
          <div className="grid gap-2">
            {result.plan ? (
              <CodeBlock title="Query plan" language="JSON" code={JSON.stringify(result.plan, null, 2)} />
            ) : null}
            {result.statistics ? <CodeBlock title="SQL" language="SQL" code={result.statistics.sql} /> : null}
          </div>
        </Section>
      ) : null}
    </article>
  );
}

const shortTime = (iso: string) => formatTime(iso).split(", ").at(-1) ?? "";

/** After a withdrawal: who, when and why, as the case file records it. */
function WithdrawnStamp({ withdrawal }: { withdrawal: Withdrawal }) {
  return (
    <div role="status" className="grid gap-1.5 rounded-lg bg-muted px-4 py-3">
      <p className="flex items-center gap-2 text-ui font-medium">
        <CircleSlash aria-hidden className="size-4 text-subtle-foreground" />
        Withdrawn by staff
        <span className="font-normal text-muted-foreground">{` · ${shortTime(withdrawal.withdrawn_at)}`}</span>
      </p>
      <p className="max-w-[60ch] text-body text-foreground/85">{withdrawal.reason}</p>
      {withdrawal.released_data_withdrawn ? (
        <p className="text-data text-muted-foreground">
          Released data was pulled; the case is handled manually.
        </p>
      ) : null}
    </div>
  );
}

/** The one staff action: pull an issued decision, with a reason the applicant will see. */
export function WithdrawAction({ result }: { result: RequestResult }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const withdraw = useWithdraw(result.request_id);
  const missing = !reason.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTried(false);
          withdraw.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive-outline">Withdraw decision…</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw this decision?</DialogTitle>
          <DialogDescription>
            Released statistics or the secure workspace are pulled and the case moves to manual handling. The
            applicant sees the reason.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            setTried(true);
            if (missing) return;
            withdraw.mutate(reason.trim(), {
              onSuccess: () => {
                setOpen(false);
              },
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor={id}>Reason</Label>
            <Textarea
              id={id}
              value={reason}
              autoFocus
              placeholder="Why the decision does not stand. The applicant reads this."
              aria-required
              aria-invalid={tried && missing ? true : undefined}
              aria-describedby={tried && missing ? `${id}-error` : undefined}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
            {tried && missing ? (
              <p id={`${id}-error`} className="text-data text-destructive">
                A reason is required to withdraw.
              </p>
            ) : null}
            {withdraw.isError ? (
              <p role="alert" className="text-data text-destructive">
                {errorMessage(withdraw.error)}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={withdraw.isPending}>
              {withdraw.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
              Withdraw
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The letter exactly as the applicant received it, without leaving the staff workspace. */
function LetterPreview({ result }: { result: RequestResult }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-3">
          <FileText aria-hidden />
          Preview letter
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[85vh] max-w-3xl overflow-y-auto bg-background p-5 pt-14"
        onOpenAutoFocus={(event) => {
          // Focus the dialog itself, not the first article chip (which would pop its tooltip).
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogTitle className="sr-only">Decision letter for {result.request_id}</DialogTitle>
        <DialogDescription className="sr-only">As sent to the applicant</DialogDescription>
        <DecisionLetter result={result} workspaceLink={false} />
      </DialogContent>
    </Dialog>
  );
}

function ConsensusSummary({ consensus, hasPlan }: { consensus: Consensus | undefined; hasPlan: boolean }) {
  const rows: { label: string; votes: number; agreeing: number }[] = [
    {
      label: "Assessment",
      votes: consensus?.assessment_votes ?? 0,
      agreeing: consensus?.assessment_agreeing ?? 0,
    },
  ];
  if (hasPlan)
    rows.push({ label: "Plan", votes: consensus?.plan_votes ?? 0, agreeing: consensus?.plan_agreeing ?? 0 });
  return (
    <ul className="grid gap-1">
      {rows.map((row) => (
        <li key={row.label} className="flex flex-wrap items-center gap-2">
          <span className="w-24 text-muted-foreground">{row.label}</span>
          {row.votes ? (
            <>
              <span aria-hidden className="flex gap-0.5">
                {Array.from({ length: row.votes }, (_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-1.5 w-3 rounded-full",
                      index < row.agreeing
                        ? row.agreeing === row.votes
                          ? "bg-success"
                          : "bg-warning"
                        : "bg-muted-foreground/25",
                    )}
                  />
                ))}
              </span>
              <span className={row.agreeing < row.votes ? "text-warning" : undefined}>
                {row.agreeing} of {row.votes} independent readings agreed
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Not measured</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function MappingsTable({ mappings }: { mappings: CodeMapping[] }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="w-20">
              System
            </TableHead>
            <TableHead scope="col" className="w-24">
              Prefix
            </TableHead>
            <TableHead scope="col">Codes found in the data</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mappings.map((mapping) => (
            <TableRow key={`${mapping.system}-${mapping.prefix}`} className="align-top hover:bg-transparent">
              <TableCell>
                <Badge>{mapping.system}</Badge>
              </TableCell>
              <TableCell className="font-mono text-data">{mapping.prefix}</TableCell>
              <TableCell>
                {mapping.matched.length ? (
                  <ul className="grid gap-0.5">
                    {mapping.matched.map((entry) => {
                      const [code = "", ...label] = entry.split(" ");
                      return (
                        <li key={entry} className="flex gap-2">
                          <span className="w-16 shrink-0 font-mono text-data leading-5">{code}</span>
                          <span className="text-muted-foreground">{label.join(" ")}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">No codes found</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ChecksList({ checks }: { checks: PrivacyCheck[] }) {
  return (
    <ul className="divide-y divide-divider overflow-hidden rounded-lg border">
      {checks.map((check) => (
        <li key={check.name} className="flex gap-3 px-4 py-3">
          {check.passed ? (
            <CheckCircle2 role="img" aria-label="Passed" className="mt-0.5 size-3.5 shrink-0 text-success" />
          ) : (
            <XCircle role="img" aria-label="Failed" className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          )}
          <div className="min-w-0 text-ui">
            <p>{check.name}</p>
            <p className="text-xs text-muted-foreground">{check.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div className="grid gap-0.5">
        <h3 className="text-card-title font-semibold">{title}</h3>
        {description ? <p className="text-ui text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
