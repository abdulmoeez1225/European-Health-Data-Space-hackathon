"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { api } from "@/api/client";
import { ApiError } from "@/api/errors";
import { useMyRequests, useSpeInfo } from "@/api/queries";
import { readRequest } from "@/api/request";
import type { SpeOutput } from "@/api/types";
import { CopyButton } from "@/components/CopyButton";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/States";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatValue, shorten } from "@/lib/format";
import { useMyRequestIds } from "@/lib/my-requests";

import { SqlConsole } from "./SqlConsole";

export const SPE_DESCRIPTION =
  "Work with approved pseudonymised records under your data permit. Nothing can be downloaded.";

type Permit = { spe: SpeOutput; organisation: string; requestId: string };

const TITLE = "Secure workspace";

export function SecureEnvironment() {
  // Only permits issued on requests from this browser: the applicant's own workspaces.
  const ids = useMyRequestIds();
  const requests = useMyRequests(ids);
  const params = useSearchParams();
  const router = useRouter();
  const permits: Permit[] = requests.results.flatMap((result) =>
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

  if (permit) {
    return (
      <Workspace
        key={permit.spe.permit_id}
        permit={permit}
        permits={permits}
        onSelect={(id) => {
          router.replace(`/spe/?permit=${encodeURIComponent(id)}`, { scroll: false });
        }}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader title={TITLE} description={SPE_DESCRIPTION} />
      {ids.length > 0 && requests.isPending ? (
        <div className="grid gap-3" role="status" aria-label="Loading data permits">
          <Skeleton className="h-14" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="rounded-md border">
          <EmptyState icon={<KeyRound />} title="No secure workspace yet">
            <p>
              A workspace opens when an access application is approved: one that asks for pseudonymised
              records and explains why statistics are not enough (for example sample R05).
            </p>
            <Button asChild className="mt-3">
              <Link href="/">Request data</Link>
            </Button>
          </EmptyState>
        </div>
      )}
    </div>
  );
}

type WorkspaceProps = { permit: Permit; permits: Permit[]; onSelect: (permitId: string) => void };

function Workspace({ permit, permits, onSelect }: WorkspaceProps) {
  const permitId = permit.spe.permit_id;
  const info = useSpeInfo(permitId);
  const download = useMutation({ mutationFn: () => api.speDownload(permitId) });
  const blocked = download.error instanceof ApiError && download.error.status === 403 ? download.error : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={TITLE}
        description={SPE_DESCRIPTION}
        actions={
          <>
            <Select value={permitId} onValueChange={onSelect}>
              <SelectTrigger aria-label="Data permit" className="w-60 max-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {permits.map((p) => (
                  <SelectItem key={p.spe.permit_id} value={p.spe.permit_id}>
                    <span className="font-mono">{p.spe.permit_id}</span>
                    <span className="text-muted-foreground">
                      · {shorten(p.organisation || p.requestId, 18)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={download.isPending}
              onClick={() => {
                download.mutate();
              }}
            >
              {download.isPending ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Download aria-hidden />
              )}
              Download data
            </Button>
          </>
        }
      />

      <dl className="grid grid-cols-2 rounded-md border text-[13px] sm:grid-cols-4 sm:divide-x">
        <Property label="Permit">
          <span className="font-mono">{permitId}</span>
        </Property>
        <Property label="Applicant">
          <span title={permit.organisation}>{permit.organisation || "Unknown applicant"}</span>
        </Property>
        <Property label="Patients (exact)">
          <span className="tabular-nums">{formatValue(permit.spe.cohort_size)}</span>
        </Property>
        <Property label="Request">
          <span className="font-mono">{permit.requestId}</span>
        </Property>
      </dl>

      {blocked ? (
        <Alert key={download.submittedAt} variant="destructive" role="alert">
          <ShieldAlert />
          <AlertTitle>
            Download blocked — data cannot leave the secure processing environment (Art. 73)
          </AlertTitle>
          <AlertDescription>
            <p>{blocked.message.replace(/^Download blocked:[^.]*\(Art\. 73\)\.\s*/i, "")}</p>
            {blocked.auditId ? (
              <p className="flex items-center gap-1">
                Logged as audit event <span className="font-mono text-foreground">{blocked.auditId}</span>
                <CopyButton text={blocked.auditId} label="Copy audit event ID" />
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : download.isError ? (
        <ErrorState title="Download check failed" error={download.error} />
      ) : download.isSuccess ? (
        <Alert variant="destructive" role="alert">
          <ShieldAlert />
          <AlertTitle>Unexpected: the server did not block the download</AlertTitle>
          <AlertDescription>
            Report this to the access body; data must not leave the environment.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <section aria-labelledby="spe-tables" className="grid min-w-0 gap-2">
          <h2 id="spe-tables" className="text-[13px] font-medium text-muted-foreground">
            Tables
          </h2>
          {info.isPending ? (
            <div className="grid gap-2" role="status" aria-label="Loading tables">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-11" />
              ))}
            </div>
          ) : info.isError ? (
            <ErrorState
              title="Could not open the environment"
              error={info.error}
              onRetry={() => void info.refetch()}
            />
          ) : (
            <>
              <ul className="min-w-0 divide-y rounded-md border">
                {info.data.tables.map((table) => (
                  <li key={table.name} className="px-3 py-2">
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="font-mono">{table.name}</span>
                      <span className="tabular-nums">{formatValue(table.rows)}</span>
                    </div>
                    <p
                      className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
                      title={table.columns.join(", ")}
                    >
                      {table.columns.join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Only the cohort and the record types named in the permit were copied in. Patient IDs are
                pseudonymised.
              </p>
            </>
          )}
        </section>

        <SqlConsole permitId={permitId} />
      </div>
    </div>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate">{children}</dd>
    </div>
  );
}
