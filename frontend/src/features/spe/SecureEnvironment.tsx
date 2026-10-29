"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, KeyRound, Lock, ShieldHalf, Table2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId } from "react";

import { api } from "@/api/client";
import { ApiError, errorMessage } from "@/api/errors";
import { useRequests, useSpeInfo } from "@/api/queries";
import { readRequest } from "@/api/request";
import type { SpeOutput } from "@/api/types";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card, Section } from "@/components/ui/Card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { formatValue } from "@/lib/format";

import { DownloadBlocked } from "./DownloadBlocked";
import { SqlConsole } from "./SqlConsole";

type Permit = { spe: SpeOutput; organisation: string; requestId: string };

export function SecureEnvironment() {
  const requests = useRequests();
  const params = useSearchParams();
  const router = useRouter();
  const permits: Permit[] = (requests.data ?? []).flatMap((result) =>
    result.spe
      ? [
          {
            spe: result.spe,
            organisation: readRequest(result.request).applicant.organisation,
            requestId: result.request_id,
          },
        ]
      : [],
  );
  const wanted = params.get("permit");
  const permit = permits.find((p) => p.spe.permit_id === wanted) ?? permits[0] ?? null;

  return (
    <div>
      {requests.isPending ? (
        <Skeleton className="h-44 rounded-[14px]" />
      ) : requests.isError ? (
        <ErrorState
          title="Could not load data permits"
          error={requests.error}
          onRetry={() => void requests.refetch()}
        />
      ) : permit ? (
        <Workspace
          key={permit.spe.permit_id}
          permit={permit}
          permits={permits}
          onSelect={(id) => {
            router.replace(`/spe/?permit=${encodeURIComponent(id)}`, { scroll: false });
          }}
        />
      ) : (
        <EmptyState icon={<KeyRound />} title="No data permit yet">
          Permits are issued for access applications that explain why statistics are not enough.{" "}
          <Link href="/" className="font-semibold text-accent hover:underline">
            Submit one in the Applicant portal
          </Link>{" "}
          (for example R05).
        </EmptyState>
      )}
    </div>
  );
}

type WorkspaceProps = { permit: Permit; permits: Permit[]; onSelect: (permitId: string) => void };

function Workspace({ permit, permits, onSelect }: WorkspaceProps) {
  const selectId = useId();
  const permitId = permit.spe.permit_id;
  const info = useSpeInfo(permitId);
  const download = useMutation({
    mutationFn: () => api.speDownload(permitId),
  });
  const blocked = download.error instanceof ApiError && download.error.status === 403 ? download.error : null;

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden">
        <div className="relative bg-[linear-gradient(135deg,var(--spe-soft),var(--surface)_70%)] px-5 py-6 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex min-w-0 items-start gap-4">
              <span
                aria-hidden
                className="grid size-12 shrink-0 place-items-center rounded-xl bg-spe text-on-status"
              >
                <Lock className="size-6" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">Data permit</p>
                <p className="font-mono text-lg font-bold">{permitId}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {permit.organisation || "Unknown applicant"} · request {permit.requestId}
                </p>
              </div>
            </div>
            <div className="text-right max-sm:text-left">
              <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                Patients in cohort (exact)
              </p>
              <p className="text-4xl font-bold text-spe tabular-nums">
                {formatValue(permit.spe.cohort_size)}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-line pt-5">
            <div className="min-w-[240px] flex-1">
              <label htmlFor={selectId} className="mb-1.5 block text-sm font-semibold">
                Switch permit
              </label>
              <select
                id={selectId}
                value={permitId}
                onChange={(event) => {
                  onSelect(event.target.value);
                }}
                className="h-10 w-full rounded-[10px] border border-line-strong bg-surface px-3 text-sm focus:border-accent focus:outline-none"
              >
                {permits.map((p) => (
                  <option key={p.spe.permit_id} value={p.spe.permit_id}>
                    {p.spe.permit_id} · {p.organisation || p.requestId}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="danger"
              icon={<Download aria-hidden className="size-4" />}
              loading={download.isPending}
              onClick={() => {
                download.mutate();
              }}
            >
              Download data
            </Button>
          </div>
        </div>
      </Card>

      {blocked ? (
        <DownloadBlocked
          key={download.submittedAt}
          message={blocked.message}
          auditId={blocked.auditId}
          at={new Date(download.submittedAt).toISOString()}
        />
      ) : download.isError ? (
        <Banner tone="error" title="Download check failed" live>
          {errorMessage(download.error)}
        </Banner>
      ) : download.isSuccess ? (
        <Banner tone="error" title="Unexpected: the server did not block the download" live />
      ) : null}

      <Section
        headingLevel={2}
        title="Tables in this environment"
        icon={<Table2 />}
        description="Only the cohort's patients and the record types named in the permit were copied in."
        actions={
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
            <ShieldHalf aria-hidden className="size-3.5" /> Patient IDs are pseudonymised
          </span>
        }
      >
        {info.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : info.isError ? (
          <ErrorState
            title="Could not open the environment"
            error={info.error}
            onRetry={() => void info.refetch()}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {info.data.tables.map((table) => (
              <li key={table.name} className="rounded-xl border border-line bg-surface-2/50 p-4">
                <p className="font-mono text-sm font-semibold">{table.name}</p>
                <p className="mt-1 text-2xl font-bold text-fg tabular-nums">{formatValue(table.rows)}</p>
                <p className="text-xs text-muted">rows</p>
                <p
                  className="mt-2 line-clamp-2 font-mono text-[0.6875rem] text-muted"
                  title={table.columns.join(", ")}
                >
                  {table.columns.join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <SqlConsole permitId={permitId} />
    </div>
  );
}
