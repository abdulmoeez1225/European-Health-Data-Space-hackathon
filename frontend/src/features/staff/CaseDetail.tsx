"use client";

import {
  AlertTriangle,
  Bot,
  ClipboardList,
  Code2,
  FileText,
  Gauge,
  ListChecks,
  Scale,
  Tags,
  Table2,
} from "lucide-react";
import Link from "next/link";

import { readRequest } from "@/api/request";
import type { CodeMapping, PurposeAssessment, RequestResult } from "@/api/types";
import { ArticleChip } from "@/components/ArticleChip";
import { CheckList } from "@/components/CheckList";
import { DecisionBadge } from "@/components/DecisionBadge";
import { StatsTable } from "@/components/StatsTable";
import { Card, Section } from "@/components/ui/Card";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Facts } from "@/components/ui/Facts";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";
import { decisionMeta } from "@/lib/decisions";
import { formatSeconds, formatTime, formatValue, humanise } from "@/lib/format";
import { decisionLadder } from "@/lib/rules";

import { SignBar } from "./SignBar";

export function CaseDetail({ result }: { result: RequestResult }) {
  const request = readRequest(result.request);
  const flags = result.review_flags ?? [];
  const mappings = result.code_mappings ?? [];

  return (
    <div className="grid animate-fade gap-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <DecisionBadge decision={result.decision} size="lg" />
            <h2 className="mt-3 text-xl font-bold tracking-tight">
              {request.applicant.organisation || result.request_id}
            </h2>
            <p className="mt-0.5 font-mono text-sm text-muted">
              {result.request_id} · {formatTime(result.processed_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {result.articles.map((article) => (
              <ArticleChip key={article} article={article} />
            ))}
          </div>
        </div>
        <p className="mt-4 text-[0.9375rem] leading-relaxed">{result.reason}</p>
        <div className="mt-5 border-t border-line pt-5">
          <SignBar requestId={result.request_id} />
        </div>
      </Card>

      {flags.length ? (
        <section className="rounded-[14px] border border-warn/45 bg-warn-soft p-5 sm:p-6">
          <h3 className="flex items-center gap-2 font-semibold text-warn">
            <AlertTriangle aria-hidden className="size-[18px]" />
            {flags.length === 1 ? "1 review flag" : `${flags.length} review flags`} — check before signing
          </h3>
          <ul className="mt-3 grid list-disc gap-1.5 pl-6 text-fg">
            {flags.map((flag) => (
              <li key={flag.reason}>{flag.reason}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <AssessmentCard assessment={result.assessment} />
        <RulesCard result={result} />
      </div>

      <Section title="Request" icon={<FileText />}>
        <Facts
          items={[
            { label: "Applicant", value: request.applicant.name || "—" },
            { label: "Organisation", value: request.applicant.organisation || "—" },
            { label: "Country", value: request.applicant.country || "—" },
            {
              label: "Asked for",
              value: `${request.requestedAs || "—"} → ${request.requestedFormat || "—"}`,
            },
          ]}
        />
        <div className="mt-5 grid gap-3 text-[0.9375rem]">
          <p>{request.purpose}</p>
          {request.question ? <p className="text-muted italic">“{request.question}”</p> : null}
          {request.definitions.length ? (
            <ul className="grid list-disc gap-1 pl-5 text-sm text-muted">
              {request.definitions.map((definition) => (
                <li key={definition}>{definition}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </Section>

      {mappings.length ? <MappingsCard mappings={mappings} /> : null}

      {result.plan || result.statistics ? (
        <Section
          title="Query plan and SQL"
          icon={<Code2 />}
          description="The language model only writes the plan; the SQL is compiled from it by rules."
        >
          <div className="grid gap-3">
            {result.plan ? (
              <CodeBlock summary="Query plan" language="JSON" code={JSON.stringify(result.plan, null, 2)} />
            ) : null}
            {result.statistics ? (
              <CodeBlock summary="Generated SQL" language="SQL" code={result.statistics.sql} />
            ) : null}
          </div>
          {result.plan?.notes?.length ? (
            <div className="mt-4">
              <p className="text-sm font-semibold">Assumptions noted by the planner</p>
              <ul className="mt-1.5 grid list-disc gap-1 pl-5 text-sm text-muted">
                {result.plan.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      ) : null}

      {result.statistics ? (
        <>
          <Section title="Privacy checks" icon={<ListChecks />}>
            <CheckList checks={result.statistics.privacy_checks} />
          </Section>
          <Section title="Released statistics" icon={<Table2 />}>
            <StatsTable stats={result.statistics} caption={`Statistics released for ${result.request_id}`} />
          </Section>
        </>
      ) : null}

      {result.spe ? (
        <Section title="Secure processing environment" icon={<ClipboardList />}>
          <Facts
            items={[
              { label: "Permit ID", value: result.spe.permit_id, mono: true },
              { label: "Patients in cohort (exact)", value: formatValue(result.spe.cohort_size) },
              {
                label: "Tables copied",
                value: Object.entries(result.spe.tables)
                  .map(([name, rows]) => `${name} (${formatValue(rows)})`)
                  .join(", "),
              },
              { label: "Download", value: result.spe.download_blocked ? "Blocked (Art. 73)" : "Allowed" },
            ]}
          />
          <Link
            href={`/spe/?permit=${encodeURIComponent(result.spe.permit_id)}`}
            className="mt-4 inline-flex h-9 items-center rounded-[10px] border border-line-strong px-3.5 text-sm font-semibold hover:border-accent hover:text-accent"
          >
            Open secure environment
          </Link>
        </Section>
      ) : null}

      <Section title="Execution" icon={<Gauge />}>
        <Facts
          items={[
            { label: "LLM backend", value: result.llm_backend, mono: true },
            { label: "Cached", value: result.cached ? "Yes" : "No" },
            { label: "LLM", value: formatSeconds(result.timings?.llm_s) },
            { label: "Compute", value: formatSeconds(result.timings?.compute_s) },
            { label: "Total", value: formatSeconds(result.timings?.total_s) },
          ]}
        />
      </Section>
    </div>
  );
}

function AssessmentCard({ assessment }: { assessment: PurposeAssessment }) {
  return (
    <Section
      title="AI assessment"
      icon={<Bot />}
      description="Judgement of the request text by the language model."
    >
      <Facts
        items={[
          {
            label: "Prohibited",
            value: assessment.prohibited ? (
              <span className="text-reject">Yes – {humanise(assessment.prohibited_ground)}</span>
            ) : (
              "No"
            ),
          },
          { label: "Allowed purpose", value: humanise(assessment.allowed_purpose) },
          { label: "Records justified", value: assessment.records_justified ? "Yes" : "No" },
        ]}
      />
      {assessment.justification ? (
        <blockquote className="mt-4 border-l-[3px] border-line-strong pl-3 text-sm text-muted italic">
          {assessment.justification}
        </blockquote>
      ) : null}
      {assessment.explanation_for_applicant ? (
        <p className="mt-3 text-sm">{assessment.explanation_for_applicant}</p>
      ) : null}
    </Section>
  );
}

function RulesCard({ result }: { result: RequestResult }) {
  const { steps, firing } = decisionLadder(result);
  const ruled = steps[firing]?.outcome;
  const agrees = ruled === result.decision;
  return (
    <Section
      title="Decision rules"
      icon={<Scale />}
      description="Fixed order; the first rule that holds decides."
    >
      <ol className="grid gap-2">
        {steps.map((step, index) => {
          const fired = index === firing;
          const skipped = index > firing;
          return (
            <li
              key={step.label}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
                fired ? "border-accent/50 bg-accent-soft" : "border-line",
                skipped && "border-dashed",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                  fired ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
                )}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("font-semibold", fired ? "text-fg" : "text-muted")}>{step.label}</p>
                <p className="text-xs text-muted">
                  {fired ? "Applies → " : index < firing ? "Does not apply · " : "Not reached · "}
                  {decisionMeta(step.outcome).label} · Art. {step.articles.join(", ")}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {!agrees ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-warn">
          <AlertTriangle aria-hidden className="size-4" />
          The recorded decision differs from this rule path — review carefully.
        </p>
      ) : null}
    </Section>
  );
}

function MappingsCard({ mappings }: { mappings: CodeMapping[] }) {
  return (
    <Section
      title="Code mappings"
      icon={<Tags />}
      description="Plain-English terms in the request, mapped to the codes found in the data."
    >
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-2 text-xs tracking-wide text-muted uppercase">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left font-semibold">
                System
              </th>
              <th scope="col" className="px-4 py-2.5 text-left font-semibold">
                Prefix
              </th>
              <th scope="col" className="px-4 py-2.5 text-left font-semibold">
                Matched codes in the data
              </th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((mapping) => (
              <tr key={`${mapping.system}-${mapping.prefix}`} className="border-t border-line align-top">
                <td className="px-4 py-3">
                  <Pill tone="accent">{mapping.system}</Pill>
                </td>
                <td className="px-4 py-3 font-mono font-semibold">{mapping.prefix}</td>
                <td className="px-4 py-3">
                  {mapping.matched.length ? (
                    <ul className="grid gap-1">
                      {mapping.matched.map((entry) => {
                        const [code = "", ...label] = entry.split(" ");
                        return (
                          <li key={entry} className="flex gap-3">
                            <span className="w-16 shrink-0 font-mono text-xs leading-5 font-semibold">
                              {code}
                            </span>
                            <span className="text-muted">{label.join(" ")}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <span className="text-muted">No codes found</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
