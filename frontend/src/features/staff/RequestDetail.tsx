"use client";

import { AlertTriangle, CheckCircle2, FileText, Undo2, XCircle } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { readRequest } from "@/api/request";
import type { CodeMapping, Consensus, PrivacyCheck, RequestResult } from "@/api/types";
import { useSignatures } from "@/app/providers";
import { ArticleChip } from "@/components/ArticleChip";
import { CodeBlock } from "@/components/CodeBlock";
import { DecisionBadge } from "@/components/DecisionBadge";
import { DecisionLetter } from "@/components/letter/DecisionLetter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { purposeLabel } from "@/lib/decisions";
import { formatTime, formatValue, humanise } from "@/lib/format";
import { parseLegalLine } from "@/lib/legal";

/** Everything a case officer checks before approving an automated decision. */
export function RequestDetail({ result }: { result: RequestResult }) {
  const request = readRequest(result.request);
  const flags = result.review_flags ?? [];
  const details = new Map(
    result.legal_basis
      .map((line) => parseLegalLine(line))
      .flatMap(({ article, text }) => (article ? [[article, text]] : [])),
  );

  return (
    <article aria-labelledby="detail-title" className="grid gap-6 px-5 py-5 sm:px-6">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{result.request_id}</span> · {formatTime(result.processed_at)}
            </p>
            <h2 id="detail-title" className="mt-1 text-[15px] leading-snug font-medium">
              {request.applicant.organisation || result.request_id}
            </h2>
          </div>
          <ReviewActions requestId={result.request_id} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <DecisionBadge decision={result.decision} />
          {result.articles.map((article) => (
            <ArticleChip key={article} article={article} detail={details.get(article)} />
          ))}
        </div>
        <p className="max-w-[70ch] text-[13px] leading-relaxed text-foreground/80">{result.reason}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <LetterPreview result={result} />
          {result.spe ? (
            <span>
              Permit <span className="font-mono text-foreground">{result.spe.permit_id}</span> ·{" "}
              {formatValue(result.spe.cohort_size)} patients
            </span>
          ) : null}
        </div>
      </header>

      {flags.length ? (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>
            {flags.length === 1 ? "1 review flag" : `${flags.length} review flags`} — check before approving
          </AlertTitle>
          <AlertDescription>
            <ul className="grid list-disc gap-0.5 pl-4">
              {flags.map((flag) => (
                <li key={flag.reason}>{flag.reason}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Section title="AI assessment">
        <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
          <Property label="Prohibited ground">
            {result.assessment.prohibited ? (
              <span className="text-destructive">{humanise(result.assessment.prohibited_ground)}</span>
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
          <blockquote className="mt-3 border-l-2 pl-3 text-[13px] leading-relaxed text-muted-foreground">
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

function ReviewActions({ requestId }: { requestId: string }) {
  const { signatures, sign, undo } = useSignatures();
  const signature = signatures[requestId];
  // After Approve/Override/Undo the clicked button disappears; keep focus on the replacement.
  const moveFocus = useRef(false);
  const undoButton = useRef<HTMLButtonElement>(null);
  const approveButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (signature ? undoButton : approveButton).current?.focus();
  }, [signature]);
  const act = (action: () => void) => {
    moveFocus.current = true;
    action();
  };

  return (
    <div className="flex items-center gap-1.5">
      <span role="status" className="sr-only">
        {signature ? (signature.kind === "sign" ? "Decision approved." : "Decision overridden.") : ""}
      </span>
      {signature ? (
        <>
          <Badge variant={signature.kind === "sign" ? "success" : "warning"}>
            {signature.kind === "sign" ? <CheckCircle2 aria-hidden /> : <Undo2 aria-hidden />}
            {signature.kind === "sign" ? "Approved" : "Overridden"} ·{" "}
            {formatTime(signature.at).split(", ").at(-1)}
          </Badge>
          <Button
            ref={undoButton}
            variant="ghost"
            size="sm"
            onClick={() => {
              act(() => {
                undo(requestId);
              });
            }}
          >
            Undo
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              act(() => {
                sign(requestId, "override");
              });
            }}
          >
            Override
          </Button>
          <Button
            ref={approveButton}
            size="sm"
            onClick={() => {
              act(() => {
                sign(requestId, "sign");
              });
            }}
          >
            Approve
          </Button>
        </>
      )}
    </div>
  );
}

/** The letter exactly as the applicant received it, without leaving the staff workspace. */
function LetterPreview({ result }: { result: RequestResult }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2">
          <FileText aria-hidden />
          Preview letter
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[80vh] max-w-3xl overflow-y-auto bg-background p-4 pt-12"
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

/** "3 of 3 independent readings agreed", for the assessment and for the query plan. */
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
          <span className="w-20 text-muted-foreground">{row.label}</span>
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
    <div className="rounded-md border">
      <Table>
        <TableHeader className="bg-muted/40">
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
                <Badge variant="outline">{mapping.system}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">{mapping.prefix}</TableCell>
              <TableCell>
                {mapping.matched.length ? (
                  <ul className="grid gap-0.5">
                    {mapping.matched.map((entry) => {
                      const [code = "", ...label] = entry.split(" ");
                      return (
                        <li key={entry} className="flex gap-2">
                          <span className="w-14 shrink-0 font-mono text-xs leading-5">{code}</span>
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
    <ul className="divide-y rounded-md border">
      {checks.map((check) => (
        <li key={check.name} className="flex gap-2.5 px-3 py-2">
          {check.passed ? (
            <CheckCircle2 role="img" aria-label="Passed" className="mt-0.5 size-3.5 shrink-0 text-success" />
          ) : (
            <XCircle role="img" aria-label="Failed" className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          )}
          <div className="min-w-0 text-[13px]">
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
    <section className="grid gap-2.5">
      <div>
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground/80">{description}</p> : null}
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
