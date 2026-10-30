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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatValue, shorten } from "@/lib/format";
import { useMyRequestIds } from "@/lib/my-requests";

import { BrowseTab } from "./BrowseTab";
import { SqlConsole } from "./SqlConsole";
import { SummariseTab } from "./SummariseTab";

export const SPE_DESCRIPTION =
  "Work with approved pseudonymised records under your data permit. Nothing can be downloaded.";

type Permit = { spe: SpeOutput; organisation: string; requestId: string };

const TABS = [
  { value: "browse", label: "Browse" },
  { value: "summarise", label: "Summarise" },
  { value: "sql", label: "SQL (advanced)" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const isTab = (value: string | null): value is Tab => TABS.some((tab) => tab.value === value);

function workspaceUrl(permitId: string, tab: Tab): string {
  const query = new URLSearchParams({ permit: permitId });
  if (tab !== "browse") query.set("tab", tab);
  return `/spe/?${query.toString()}`;
}

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
  const requestedTab = params.get("tab");
  const tab: Tab = isTab(requestedTab) ? requestedTab : "browse";

  if (permit) {
    return (
      <Workspace
        key={permit.spe.permit_id}
        permit={permit}
        permits={permits}
        tab={tab}
        onNavigate={(permitId, nextTab) => {
          router.replace(workspaceUrl(permitId, nextTab), { scroll: false });
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

type WorkspaceProps = {
  permit: Permit;
  permits: Permit[];
  tab: Tab;
  onNavigate: (permitId: string, tab: Tab) => void;
};

function Workspace({ permit, permits, tab, onNavigate }: WorkspaceProps) {
  const permitId = permit.spe.permit_id;
  const info = useSpeInfo(permitId);
  const download = useMutation({ mutationFn: () => api.speDownload(permitId) });
  const blocked = download.error instanceof ApiError && download.error.status === 403 ? download.error : null;

  return (
    <div className="grid gap-8">
      <PageHeader
        title={TITLE}
        description={SPE_DESCRIPTION}
        actions={
          <>
            <Select
              value={permitId}
              onValueChange={(id) => {
                onNavigate(id, tab);
              }}
            >
              <SelectTrigger aria-label="Data permit" className="h-9 w-60 max-w-full">
                <SelectValue>
                  <span className="font-mono">{permitId}</span>
                </SelectValue>
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
              className="h-9"
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

      <dl className="grid grid-cols-3 gap-6 rounded-lg border bg-card px-6 py-5">
        <Property label="Patients (exact)">
          <span className="text-2xl font-medium tracking-tight tabular-nums">
            {formatValue(permit.spe.cohort_size)}
          </span>
        </Property>
        <Property label="Permit">
          <span className="font-mono text-ui">{permitId}</span>
        </Property>
        <Property label="Request">
          <span className="font-mono text-ui">{permit.requestId}</span>
          {permit.organisation ? (
            <span className="block truncate text-xs text-muted-foreground" title={permit.organisation}>
              {permit.organisation}
            </span>
          ) : null}
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

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (isTab(value)) onNavigate(permitId, value);
        }}
        className="gap-6"
      >
        <TabsList aria-label="Ways to work with the records" className="h-9">
          {TABS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="px-3">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {info.isPending ? (
          <div className="grid gap-2" role="status" aria-label="Opening the workspace">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : info.isError ? (
          <ErrorState
            title="Could not open the workspace"
            error={info.error}
            onRetry={() => void info.refetch()}
          />
        ) : (
          <>
            <TabsContent value="browse">
              <BrowseTab permitId={permitId} tables={info.data.tables} />
            </TabsContent>
            <TabsContent value="summarise">
              <SummariseTab permitId={permitId} tables={info.data.tables} />
            </TabsContent>
            <TabsContent value="sql">
              <SqlConsole permitId={permitId} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
