import { ArrowRight, ArrowUpRight, Lightbulb, Lock } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import type { RequestResult, SpeOutput } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { decisionMeta, EUR_LEX_URL, prohibitionFor } from "@/lib/decisions";
import { formatSeconds, formatTime, formatValue, humanise } from "@/lib/format";
import { parseLegalLine } from "@/lib/legal";

import { ArticleChip } from "../ArticleChip";
import { DecisionBadge } from "../DecisionBadge";
import { StatsTable } from "../StatsTable";

/** Why each cited article applies, keyed by article number, from the legal-basis lines. */
function articleDetails(legalBasis: string[]): Map<string, string> {
  const details = new Map<string, string>();
  for (const line of legalBasis) {
    const { article, text } = parseLegalLine(line);
    if (article && !details.has(article)) details.set(article, text);
  }
  return details;
}

/** The decision as the applicant receives it: outcome, reason, legal basis, then what they get. */
type LetterProps = {
  result: RequestResult;
  /** The applicant's own copy links to their secure workspace; staff previews do not. */
  workspaceLink?: boolean;
};

export function DecisionLetter({ result, workspaceLink = true }: LetterProps) {
  const meta = decisionMeta(result.decision);
  const details = articleDetails(result.legal_basis);
  // Request ids come from the applicant and may contain spaces, so they cannot be element ids.
  const headingId = useId();

  return (
    <Card
      role="article"
      aria-labelledby={headingId}
      aria-describedby={`${headingId}-status`}
      className="animate-in duration-150 fade-in-0"
    >
      <div className="grid gap-2.5 px-5 pt-4 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span id={`${headingId}-status`}>
            <DecisionBadge decision={result.decision} />
          </span>
          <span className="text-xs text-muted-foreground">
            <span className="font-mono">{result.request_id}</span> · {formatTime(result.processed_at)}
          </span>
        </div>
        <h2 id={headingId} className="text-[15px] leading-6 font-medium">
          {meta.headline}
        </h2>
        <p className="max-w-[70ch] text-[13px] leading-relaxed text-foreground/80">{result.reason}</p>
        {result.articles.length ? (
          <ul aria-label="Legal basis" className="flex flex-wrap gap-1.5 pt-0.5">
            {result.articles.map((article) => (
              <li key={article}>
                <ArticleChip article={article} detail={details.get(article)} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {result.statistics ? (
        <section aria-label="Your statistics" className="border-t px-5 py-4">
          <StatsTable stats={result.statistics} caption={`Statistics released for ${result.request_id}`} />
        </section>
      ) : null}

      {result.spe ? <PermitSummary spe={result.spe} workspaceLink={workspaceLink} /> : null}

      {result.decision === "REJECT" ? (
        <section aria-label="What you can do instead" className="border-t px-5 py-4">
          <p className="flex gap-2.5 text-[13px] leading-relaxed">
            <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="font-medium">What you can do instead.</span>{" "}
              <span className="text-foreground/80">
                {prohibitionFor(result.assessment.prohibited_ground).instead}
              </span>
            </span>
          </p>
        </section>
      ) : null}

      <CardFooter className="justify-between gap-3">
        <span>
          {result.cached
            ? "Decided automatically · identical request answered before"
            : `Decided automatically in ${formatSeconds(result.timings?.total_s)}`}
        </span>
        <a
          href={EUR_LEX_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Regulation (EU) 2025/327
          <ArrowUpRight aria-hidden className="size-3" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </CardFooter>
    </Card>
  );
}

function PermitSummary({ spe, workspaceLink }: { spe: SpeOutput; workspaceLink: boolean }) {
  const tables = Object.entries(spe.tables).filter(([name]) => name !== "cohort");
  return (
    <section aria-label="Your data permit" className="grid gap-4 border-t px-5 py-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-[auto_auto_1fr]">
        <div>
          <dt className="text-xs text-muted-foreground">Permit</dt>
          <dd className="mt-0.5 font-mono">{spe.permit_id}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Patients (exact)</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{formatValue(spe.cohort_size)}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-xs text-muted-foreground">Records copied</dt>
          <dd className="mt-0.5">
            {tables.map(([name, rows]) => `${humanise(name)} ${formatValue(rows)}`).join(" · ")}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock aria-hidden className="size-3" />
          {spe.download_blocked
            ? "Download blocked (Art. 73). Only aggregates leave, through the airlock."
            : "Download allowed."}
        </p>
        {workspaceLink ? (
          <Button asChild size="sm">
            <Link href={`/spe/?permit=${encodeURIComponent(spe.permit_id)}`}>
              Open secure workspace
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
