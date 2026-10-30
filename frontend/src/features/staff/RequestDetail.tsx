"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  FileText,
  Loader2,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { errorMessage } from "@/api/errors";
import { useStaffAction } from "@/api/queries";
import { readRequest } from "@/api/request";
import type {
  CodeMapping,
  Consensus,
  PrivacyCheck,
  ProhibitedGround,
  RequestResult,
  StaffAction,
} from "@/api/types";
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
import { useT, type Messages } from "@/i18n";
import { cn } from "@/lib/cn";
import { purposeLabel } from "@/lib/decisions";
import { formatTime, formatValue } from "@/lib/format";
import { parseLegalLine } from "@/lib/legal";

/** An issued decision as a case officer checks it; the one action is to withdraw it. */
export function RequestDetail({ result }: { result: RequestResult }) {
  const t = useT();
  const request = readRequest(result.request);
  const flags = result.review_flags ?? [];
  const details = new Map(
    result.legal_basis
      .map((line) => parseLegalLine(line))
      .flatMap(({ article, text }) => (article ? [[article, text]] : [])),
  );

  return (
    <article aria-labelledby="detail-title" className="grid gap-8 px-5 py-8 sm:px-8">
      {result.staff_action ? <StaffActionStamp action={result.staff_action} /> : null}
      {result.needs_attention && flags.length ? (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>{t.staff.detail.attentionTitle}</AlertTitle>
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
              {t.staff.detail.permit}{" "}
              <span className="font-mono text-foreground">{result.spe.permit_id}</span> ·{" "}
              {t.staff.detail.patients(formatValue(result.spe.cohort_size))}
            </span>
          ) : null}
        </div>
      </header>

      <Section title={t.staff.detail.assessment.title}>
        <dl className="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-6 gap-y-3 text-ui">
          <Property label={t.staff.detail.assessment.prohibitedGround}>
            {result.assessment.prohibited ? (
              <span className="font-medium">{prohibitedLabel(t, result.assessment.prohibited_ground)}</span>
            ) : (
              t.staff.detail.assessment.none
            )}
          </Property>
          <Property label={t.staff.detail.assessment.purpose}>
            {purposeLabel(result.assessment.allowed_purpose)}
          </Property>
          <Property label={t.staff.detail.assessment.recordsJustified}>
            {result.assessment.records_justified
              ? t.staff.detail.assessment.yes
              : t.staff.detail.assessment.no}
          </Property>
          <Property label={t.staff.detail.assessment.consensus}>
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
        <Section title={t.staff.detail.mappings.title}>
          <MappingsTable mappings={result.code_mappings} />
        </Section>
      ) : null}

      {result.statistics?.privacy_checks.length ? (
        <Section title={t.staff.detail.privacyChecks.title}>
          <ChecksList checks={result.statistics.privacy_checks} />
        </Section>
      ) : null}

      {result.plan || result.statistics ? (
        <Section title={t.staff.detail.plan.title} description={t.staff.detail.plan.description}>
          <div className="grid gap-2">
            {result.plan ? (
              <CodeBlock
                title={t.staff.detail.plan.planBlock}
                language="JSON"
                code={JSON.stringify(result.plan, null, 2)}
              />
            ) : null}
            {result.statistics ? <CodeBlock title="SQL" language="SQL" code={result.statistics.sql} /> : null}
          </div>
        </Section>
      ) : null}
    </article>
  );
}

/** The prohibited ground in the applicant-facing wording. */
function prohibitedLabel(t: Messages, ground: ProhibitedGround): string {
  if (ground === "none") return t.staff.detail.assessment.none;
  return t.prohibitions[ground === "other_unlawful_or_unethical" ? "other" : ground].title;
}

const shortTime = (iso: string) => formatTime(iso).split(", ").at(-1) ?? "";

/** After a staff action: who, when and why, as the case file records it. */
function StaffActionStamp({ action }: { action: StaffAction }) {
  const t = useT();
  const withdrawn = action.kind === "withdrawn";
  const Icon = withdrawn ? CircleSlash : RotateCcw;
  return (
    <div role="status" className="grid gap-1.5 rounded-lg bg-muted px-4 py-3">
      <p className="flex items-center gap-2 text-ui font-medium">
        <Icon aria-hidden className="size-4 text-subtle-foreground" />
        {withdrawn ? t.staff.withdrawn.stamp : t.staff.reopened.stamp}
        <span className="font-normal text-muted-foreground">{` · ${shortTime(action.at)}`}</span>
      </p>
      <p className="max-w-[60ch] text-body text-foreground/85">{action.reason}</p>
      {action.released_data_withdrawn ? (
        <p className="text-data text-muted-foreground">{t.staff.withdrawn.releasedPulled}</p>
      ) : null}
    </div>
  );
}

/**
 * The one staff action on an issued decision, with a reason the applicant will see: a grant can be
 * withdrawn (its data is pulled), a refusal reopened for manual reconsideration.
 */
export function WithdrawAction({ result }: { result: RequestResult }) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const reopen = result.decision === "REJECT";
  const copy = reopen ? { ...t.staff.withdraw, ...t.staff.reopen } : t.staff.withdraw;
  const withdraw = useStaffAction(result.request_id, reopen ? "reopen" : "withdraw");
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
        <Button variant={reopen ? "outline" : "destructive-outline"}>{copy.trigger}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
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
            <Label htmlFor={id}>{t.staff.withdraw.reason}</Label>
            <Textarea
              id={id}
              value={reason}
              autoFocus
              placeholder={copy.placeholder}
              aria-required
              aria-invalid={tried && missing ? true : undefined}
              aria-describedby={tried && missing ? `${id}-error` : undefined}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
            {tried && missing ? (
              <p id={`${id}-error`} className="text-data text-destructive">
                {copy.required}
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
              <Button variant="ghost">{t.staff.withdraw.cancel}</Button>
            </DialogClose>
            <Button type="submit" variant={reopen ? "default" : "destructive"} disabled={withdraw.isPending}>
              {withdraw.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
              {copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The letter exactly as the applicant received it, without leaving the staff workspace. */
function LetterPreview({ result }: { result: RequestResult }) {
  const t = useT();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-3">
          <FileText aria-hidden />
          {t.staff.detail.previewLetter}
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
        <DialogTitle className="sr-only">{t.staff.detail.letterTitle(result.request_id)}</DialogTitle>
        <DialogDescription className="sr-only">{t.staff.detail.letterDescription}</DialogDescription>
        <DecisionLetter result={result} workspaceLink={false} />
      </DialogContent>
    </Dialog>
  );
}

function ConsensusSummary({ consensus, hasPlan }: { consensus: Consensus | undefined; hasPlan: boolean }) {
  const t = useT().staff.detail.consensus;
  const rows: { label: string; votes: number; agreeing: number }[] = [
    {
      label: t.assessment,
      votes: consensus?.assessment_votes ?? 0,
      agreeing: consensus?.assessment_agreeing ?? 0,
    },
  ];
  if (hasPlan)
    rows.push({ label: t.plan, votes: consensus?.plan_votes ?? 0, agreeing: consensus?.plan_agreeing ?? 0 });
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
                {t.agreed(row.agreeing, row.votes)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{t.notMeasured}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function MappingsTable({ mappings }: { mappings: CodeMapping[] }) {
  const t = useT().staff.detail.mappings;
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="w-20">
              {t.system}
            </TableHead>
            <TableHead scope="col" className="w-24">
              {t.prefix}
            </TableHead>
            <TableHead scope="col">{t.found}</TableHead>
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
                  <span className="text-muted-foreground">{t.none}</span>
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
  const t = useT().staff.detail.privacyChecks;
  return (
    <ul className="divide-y divide-divider overflow-hidden rounded-lg border">
      {checks.map((check) => (
        <li key={check.name} className="flex gap-3 px-4 py-3">
          {check.passed ? (
            <CheckCircle2
              role="img"
              aria-label={t.passed}
              className="mt-0.5 size-3.5 shrink-0 text-success"
            />
          ) : (
            <XCircle role="img" aria-label={t.failed} className="mt-0.5 size-3.5 shrink-0 text-destructive" />
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
