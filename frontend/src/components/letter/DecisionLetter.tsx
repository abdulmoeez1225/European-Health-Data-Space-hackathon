import { ArrowRight, Lightbulb, Lock, Quote, Scale } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { readRequest } from "@/api/request";
import type { PurposeAssessment, RequestResult, SpeOutput } from "@/api/types";
import { cn } from "@/lib/cn";
import { decisionMeta, EUR_LEX_URL, prohibitionFor, type DecisionTone } from "@/lib/decisions";
import { formatSeconds, formatTime, formatValue, humanise } from "@/lib/format";
import { parseLegalLine, uncoveredArticles } from "@/lib/legal";

import { ArticleChip } from "../ArticleChip";
import { TONE_ICONS } from "../DecisionBadge";
import { StatsTable } from "../StatsTable";

const BAND: Record<DecisionTone, { band: string; icon: string; rule: string }> = {
  reject: { band: "bg-reject-soft", icon: "bg-reject text-on-status", rule: "border-t-reject" },
  stats: { band: "bg-stats-soft", icon: "bg-stats text-on-status", rule: "border-t-stats" },
  spe: { band: "bg-spe-soft", icon: "bg-spe text-on-status", rule: "border-t-spe" },
};

const STATUS_TEXT: Record<DecisionTone, string> = {
  reject: "text-reject",
  stats: "text-stats",
  spe: "text-spe",
};

type LetterProps = {
  result: RequestResult;
  /** Compact letters sit side by side (red team): no request summary, no permit link. */
  compact?: boolean;
  className?: string;
};

/** The decision as the applicant receives it: outcome, why, legal basis, then the numbers. */
export function DecisionLetter({ result, compact = false, className }: LetterProps) {
  // Compact letters are nested in a titled panel, so their headings sit one level lower.
  const Title = compact ? "h3" : "h2";
  const meta = decisionMeta(result.decision);
  const request = readRequest(result.request);
  const band = BAND[meta.tone];
  const Icon = TONE_ICONS[meta.tone];
  const looseArticles = uncoveredArticles(result.articles, result.legal_basis);

  return (
    <article
      aria-label={`Decision on ${result.request_id}: ${meta.label}`}
      className={cn(
        "animate-reveal overflow-hidden rounded-[14px] border border-t-4 border-line bg-surface shadow-card",
        band.rule,
        className,
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-start gap-4",
          band.band,
          compact ? "px-5 py-4" : "px-6 py-6 sm:px-8",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid shrink-0 place-items-center rounded-full",
            band.icon,
            compact ? "size-10 [&>svg]:size-5" : "size-12 [&>svg]:size-6",
          )}
        >
          <Icon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">Decision</p>
          <Title
            className={cn(
              "font-bold tracking-tight",
              STATUS_TEXT[meta.tone],
              compact ? "text-xl" : "text-[1.875rem] leading-tight",
            )}
          >
            {meta.label}
          </Title>
          <p className={cn("mt-1 text-fg", compact ? "text-sm" : "text-lg")}>{meta.headline}</p>
        </div>
        <dl className="grid gap-0.5 text-right text-sm max-sm:basis-full max-sm:text-left">
          <dt className="sr-only">Reference</dt>
          <dd className="font-mono font-semibold">{result.request_id}</dd>
          <dt className="sr-only">Decided</dt>
          <dd className="text-muted">{formatTime(result.processed_at)}</dd>
        </dl>
      </header>

      <div className={cn("grid", compact ? "gap-5 px-5 py-5" : "gap-7 px-6 py-7 sm:px-8")}>
        <LetterSection title="Why" compact={compact}>
          <p className={cn("text-fg", compact ? "text-[0.9375rem]" : "text-lg leading-relaxed")}>
            {result.reason}
          </p>
          {!compact && (request.applicant.organisation || request.question) ? (
            <div className="mt-4 grid gap-1 rounded-xl bg-surface-2 px-4 py-3 text-sm">
              <p className="text-muted">
                Request from{" "}
                <span className="font-semibold text-fg">{request.applicant.organisation || "—"}</span>
                {request.requestedAs ? <> · {request.requestedAs}</> : null}
              </p>
              {request.question ? <p className="text-fg italic">“{request.question}”</p> : null}
            </div>
          ) : null}
        </LetterSection>

        <LetterSection title="Legal basis" icon={<Scale />} compact={compact}>
          <ul className="grid gap-2.5">
            {result.legal_basis.map((line) => {
              const { article, text } = parseLegalLine(line);
              return (
                <li key={line} className="flex items-start gap-3">
                  <span className="w-[4.25rem] shrink-0 pt-px">
                    {article ? <ArticleChip article={article} /> : null}
                  </span>
                  <span className="min-w-0 text-[0.9375rem]">{text}</span>
                </li>
              );
            })}
          </ul>
          {looseArticles.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
              Also cited:
              {looseArticles.map((article) => (
                <ArticleChip key={article} article={article} />
              ))}
            </div>
          ) : null}
        </LetterSection>

        {result.decision === "REJECT" ? (
          <Prohibited assessment={result.assessment} compact={compact} />
        ) : null}

        {result.statistics ? (
          <LetterSection title="Your statistics" compact={compact}>
            <StatsTable stats={result.statistics} caption={`Statistics released for ${result.request_id}`} />
          </LetterSection>
        ) : null}

        {result.spe ? <PermitSummary spe={result.spe} compact={compact} /> : null}
      </div>

      <footer
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-t border-line text-xs text-muted",
          compact ? "px-5 py-3" : "px-6 py-4 sm:px-8",
        )}
      >
        <span>
          {result.cached
            ? "Decided automatically (same request decided before)"
            : `Decided automatically in ${formatSeconds(result.timings?.total_s)}`}{" "}
          · reviewed by HDAB staff
        </span>
        {!compact ? (
          <a
            href={EUR_LEX_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent hover:underline"
          >
            Regulation (EU) 2025/327<span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </footer>
    </article>
  );
}

function LetterSection({
  title,
  icon,
  compact,
  children,
}: {
  title: string;
  icon?: ReactNode;
  compact: boolean;
  children: ReactNode;
}) {
  const Heading = compact ? "h4" : "h3";
  return (
    <section>
      <Heading
        className={cn(
          "mb-2.5 flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] text-muted uppercase [&>svg]:size-3.5",
          compact && "mb-2",
        )}
      >
        {icon}
        {title}
      </Heading>
      {children}
    </section>
  );
}

function Prohibited({ assessment, compact }: { assessment: PurposeAssessment; compact: boolean }) {
  const prohibition = prohibitionFor(assessment.prohibited_ground);
  return (
    <LetterSection title="Why this use is prohibited" compact={compact}>
      <p className="text-[0.9375rem]">
        <span className="font-semibold">{prohibition.title}.</span> {prohibition.text}
      </p>
      {assessment.justification ? (
        <blockquote className="mt-3 flex gap-2 border-l-[3px] border-line-strong py-1 pl-3 text-sm text-muted italic">
          <Quote aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{assessment.justification}</span>
        </blockquote>
      ) : null}
      <div className="mt-4 flex gap-3 rounded-xl border border-accent/25 bg-accent-soft px-4 py-3.5">
        <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
        <div>
          <p className="font-semibold text-fg">What you can do instead</p>
          <p className="mt-0.5 text-sm text-fg">{prohibition.instead}</p>
        </div>
      </div>
    </LetterSection>
  );
}

function PermitSummary({ spe, compact }: { spe: SpeOutput; compact: boolean }) {
  const tables = Object.entries(spe.tables).filter(([name]) => name !== "cohort");
  return (
    <LetterSection title="Your data permit" icon={<Lock />} compact={compact}>
      <div className="grid gap-4 rounded-xl border border-spe/25 bg-spe-soft/50 p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Patients in cohort (exact)</p>
          <p className="text-4xl font-bold text-spe tabular-nums">{formatValue(spe.cohort_size)}</p>
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Permit ID</dt>
            <dd className="font-mono font-semibold">{spe.permit_id}</dd>
          </div>
          <div>
            <dt className="text-muted">Download</dt>
            <dd className="flex items-center gap-1.5 font-semibold">
              <Lock aria-hidden className="size-3.5 text-reject" />
              {spe.download_blocked ? "Blocked (Art. 73)" : "Allowed"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Records copied</dt>
            <dd className="font-semibold">
              {tables.map(([name, rows]) => `${humanise(name)} ${formatValue(rows)}`).join(" · ")}
            </dd>
          </div>
        </dl>
      </div>
      {!compact ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={`/spe/?permit=${encodeURIComponent(spe.permit_id)}`}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Open secure environment
            <ArrowRight aria-hidden className="size-4" />
          </Link>
          <p className="text-sm text-muted">
            Only aggregate results with at least 10 patients per row can leave, through the airlock.
          </p>
        </div>
      ) : null}
    </LetterSection>
  );
}
