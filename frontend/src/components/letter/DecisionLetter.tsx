import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  CircleSlash,
  Hourglass,
  Lightbulb,
  Lock,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useId, type ReactNode } from "react";

import { useT } from "@/i18n";

import type { RequestResult, SpeOutput } from "@/api/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/cn";
import { decisionMeta, EUR_LEX_URL, refusalFor } from "@/lib/decisions";
import { formatSeconds, formatTime, formatValue, humanise } from "@/lib/format";
import { parseLegalLine } from "@/lib/legal";
import { legalBasisRows, plainSentence } from "@/lib/letter";

import { ArticleChip } from "../ArticleChip";
import { DecisionBadge } from "../DecisionBadge";
import { StatsTable } from "../StatsTable";

type LetterProps = {
  result: RequestResult;
  /** The applicant's own copy links to their secure workspace; staff previews do not. */
  workspaceLink?: boolean;
};

/** The decision as the applicant receives it: outcome, one sentence, legal basis, then what they get. */
export function DecisionLetter({ result, workspaceLink = true }: LetterProps) {
  const t = useT();
  const headingId = useId();
  const withdrawn = result.status === "withdrawn";
  const reopened = result.status === "reopened";
  const awaitingPermit = result.status === "awaiting_permit";
  const action = result.staff_action;
  const staffReason = action && action.kind !== "permit_issued" ? action.reason.trim() : "";
  const conditions = action?.kind === "permit_issued" ? action.reason.trim() : "";
  const explanation = result.assessment.explanation_for_applicant.trim();
  const footer = awaitingPermit ? t.letter.recommended : t.letter.issued;

  return (
    <Card role="article" aria-labelledby={headingId} className="animate-in duration-150 fade-in-0">
      <div className="grid gap-6 px-6 pt-7 pb-6 sm:px-8">
        {reopened ? (
          <Alert variant="info" role="alert">
            <RotateCcw />
            <AlertTitle>{t.letter.reopenedTitle}</AlertTitle>
            <AlertDescription>
              <p>{t.letter.reopenedContact}</p>
            </AlertDescription>
          </Alert>
        ) : null}
        {reopened && staffReason ? <StaffReason reason={staffReason} /> : null}
        {/* A reopened refusal stays visible, muted: it is set aside, not replaced yet. */}
        <div className={cn("grid justify-items-start gap-3", reopened && "opacity-60")}>
          <LetterHeadline result={result} headingId={headingId} />
        </div>
        {withdrawn && staffReason ? <StaffReason reason={staffReason} /> : null}

        {!withdrawn && explanation ? (
          <section aria-labelledby={`${headingId}-why`} className="grid gap-2">
            <h3 id={`${headingId}-why`} className="text-data font-medium text-subtle-foreground">
              {t.letter.assessment}
            </h3>
            <p className="max-w-[60ch] text-body">{explanation}</p>
          </section>
        ) : null}

        {!withdrawn && result.articles.length ? (
          <section aria-labelledby={`${headingId}-basis`} className="grid gap-3">
            <h3 id={`${headingId}-basis`} className="text-data font-medium text-subtle-foreground">
              {t.letter.legalBasis}
            </h3>
            <ul className="grid gap-2.5">
              {legalBasisRows(result).map((row) => (
                <li key={row.article} className="flex items-center gap-3">
                  <ArticleChip article={row.article} detail={row.detail} />
                  <span className="text-body">{row.label}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {result.statistics ? (
        <Section label={t.letter.yourStatistics}>
          <StatsTable stats={result.statistics} caption={t.letter.statsCaption(result.request_id)} />
        </Section>
      ) : null}

      {result.spe ? (
        <PermitSummary
          spe={result.spe}
          workspaceLink={workspaceLink}
          locked={result.status !== "issued"}
          conditions={conditions}
        />
      ) : null}

      {result.decision === "REJECT" && !withdrawn ? (
        <Section label={t.letter.insteadSection}>
          <p className="flex max-w-[60ch] gap-3 text-body">
            <Lightbulb aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="font-medium">{t.letter.insteadTitle}</span>{" "}
              <span className="text-muted-foreground">{refusalFor(result.assessment).instead}</span>
            </span>
          </p>
        </Section>
      ) : null}

      <FullReasoning result={result} />

      <CardFooter className="flex-wrap justify-between gap-x-4 gap-y-1">
        <span>
          {footer(
            result.cached ? null : formatSeconds(result.timings?.total_s),
            formatTime(result.processed_at),
          )}
        </span>
        <a
          href={EUR_LEX_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.regulation}
          <ArrowUpRight aria-hidden className="size-3.5" />
          <span className="sr-only"> {t.letter.opensInNewTab}</span>
        </a>
      </CardFooter>
    </Card>
  );
}

/**
 * Badge, headline and one sentence. A withdrawn grant leads with the withdrawal, so the page never
 * still announces data the applicant no longer has; a records grant waiting for its permit says so.
 */
function LetterHeadline({ result, headingId }: { result: RequestResult; headingId: string }) {
  const t = useT();
  const headline = (text: string) => (
    <h2 id={headingId} className="text-headline font-semibold tracking-[-0.01em]">
      {text}
    </h2>
  );
  const sentence = (text: string) => <p className="max-w-[56ch] text-lead text-muted-foreground">{text}</p>;

  if (result.status === "withdrawn") {
    return (
      <>
        <Badge variant="warning">
          <CircleSlash aria-hidden />
          {t.letter.withdrawnTitle}
        </Badge>
        {headline(t.letter.withdrawnHeadline[result.decision])}
        {sentence(`${t.letter.withdrawnData[result.decision]} ${t.letter.willContact}`)}
      </>
    );
  }
  if (result.status === "awaiting_permit") {
    return (
      <>
        <Badge variant="info">
          <Hourglass aria-hidden />
          {t.letter.awaitingPermit.badge}
        </Badge>
        {headline(t.letter.awaitingPermit.headline)}
        {sentence(t.letter.awaitingPermit.sentence)}
      </>
    );
  }
  return (
    <>
      <DecisionBadge decision={result.decision} />
      {headline(decisionMeta(result.decision).headline)}
      {sentence(plainSentence(result))}
    </>
  );
}

/** A note written by a person, quoted and labelled so it never reads as part of a sentence. */
export function QuotedNote({ label, text }: { label: string; text: string }) {
  const t = useT();
  return (
    <figure className="grid gap-1.5">
      <figcaption className="text-data font-medium text-subtle-foreground">{label}</figcaption>
      <blockquote className="max-w-[60ch] border-l-2 pl-4 text-body break-words whitespace-pre-line">
        {t.letter.quoted(text)}
      </blockquote>
    </figure>
  );
}

function StaffReason({ reason }: { reason: string }) {
  const t = useT();
  return <QuotedNote label={t.letter.staffReason} text={reason} />;
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="border-t border-divider px-6 py-7 sm:px-8">
      {children}
    </section>
  );
}

function FullReasoning({ result }: { result: RequestResult }) {
  const t = useT();
  return (
    <Collapsible className="border-t border-divider px-6 py-3 sm:px-8">
      <CollapsibleTrigger className="group -mx-2 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-ui text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronRight
          aria-hidden
          className="size-4 transition-transform duration-100 group-data-[state=open]:rotate-90"
        />
        {t.letter.fullReasoning}
      </CollapsibleTrigger>
      <CollapsibleContent className="grid max-w-[60ch] gap-4 pt-2 pb-4">
        <p className="text-body">{result.reason}</p>
        <ul className="grid gap-2 text-body text-muted-foreground">
          {result.legal_basis.map((line) => {
            const { article, text } = parseLegalLine(line);
            return (
              <li key={line}>
                {article ? <span className="font-medium text-foreground">Art. {article} </span> : null}
                {text}
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Stat({ label, value, note, mono }: { label: string; value: string; note?: string; mono?: boolean }) {
  return (
    <div className="grid content-start gap-1">
      <dt className="text-data text-muted-foreground">{label}</dt>
      <dd className={cn(mono ? "pt-1.5 font-mono text-ui" : "text-title font-semibold tabular-nums")}>
        {value}
      </dd>
      {note ? <dd className="text-data text-muted-foreground">{note}</dd> : null}
    </div>
  );
}

function PermitSummary({
  spe,
  workspaceLink,
  locked,
  conditions,
}: {
  spe: SpeOutput;
  workspaceLink: boolean;
  /** Until staff issue the permit the workspace exists but stays closed. */
  locked: boolean;
  conditions: string;
}) {
  const t = useT();
  const tables = Object.entries(spe.tables).filter(([name]) => name !== "cohort");
  const records = tables.reduce((sum, [, rows]) => sum + rows, 0);
  return (
    <Section label={t.letter.yourPermit}>
      <div className="grid gap-7">
        <dl className="grid gap-6 sm:grid-cols-3">
          <Stat label={t.letter.patientsExact} value={formatValue(spe.cohort_size)} />
          <Stat
            label={t.letter.recordsCopied}
            value={formatValue(records)}
            note={tables
              .map(
                ([name, rows]) => `${t.letter.tableNames[name] ?? humanise(name)}\u00a0${formatValue(rows)}`,
              )
              .join(" · ")}
          />
          <Stat label={t.letter.dataPermit} value={spe.permit_id} mono />
        </dl>
        {conditions ? <QuotedNote label={t.letter.permitConditions} text={conditions} /> : null}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-ui text-muted-foreground">
            <Lock aria-hidden className="size-4" />
            {spe.download_blocked ? t.letter.downloadBlocked : t.letter.downloadAllowed}
          </p>
          {locked ? (
            <p className="flex items-center gap-2 text-ui text-muted-foreground">
              <Hourglass aria-hidden className="size-4" />
              {t.letter.awaitingPermit.locked}
            </p>
          ) : workspaceLink ? (
            <Button asChild size="lg">
              <Link href={`/spe/?permit=${encodeURIComponent(spe.permit_id)}`}>
                {t.letter.openWorkspace}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
