"use client";

import { ArrowLeft, ListChecks, PencilLine, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { useMyRequests, useRequestResult } from "@/api/queries";
import { readRequest } from "@/api/request";
import { useViewState } from "@/app/providers";
import { DecisionLetter } from "@/components/letter/DecisionLetter";
import { PageHeader } from "@/components/PageHeader";
import { RequestList } from "@/components/RequestList";
import { EmptyState, ErrorState } from "@/components/States";
import { Toast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { useMyRequestIds } from "@/lib/my-requests";

import { draftFrom, EMPTY_DRAFT, type RequestDraft } from "./draft";
import { ReviewRequest } from "./ReviewRequest";
import { DRAFT_KEY, JUST_DECIDED_KEY, SAMPLE_KEY, decisionHref } from "./routes";

/** /requests/ lists this browser's requests; /requests/?id=R05 is the decision page for one. */
export function MyRequests() {
  const requestId = useSearchParams().get("id");
  return requestId ? <DecisionPage requestId={requestId} /> : <RequestsOverview />;
}

function RequestsOverview() {
  const t = useT().applicant.myRequests;
  const router = useRouter();
  const ids = useMyRequestIds();
  const { results, isPending } = useMyRequests(ids);

  return (
    <div className="grid gap-10">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Button asChild>
            <Link href="/">
              <Plus aria-hidden />
              {t.newRequest}
            </Link>
          </Button>
        }
      />
      {ids.length > 0 && isPending && results.length === 0 ? (
        <div className="grid gap-1" role="status" aria-label={t.loading}>
          {ids.slice(0, 6).map((id) => (
            <Skeleton key={id} className="h-11" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-xl bg-card">
          <EmptyState icon={<ListChecks />} title={t.emptyTitle}>
            <p>{t.emptyText}</p>
            <Button asChild className="mt-4">
              <Link href="/">{t.requestData}</Link>
            </Button>
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card [&_li:last-child]:border-b-0">
          <RequestList
            label={t.title}
            results={results}
            selectedId={null}
            selectOnArrow={false}
            onSelect={(id) => {
              router.push(decisionHref(id));
            }}
          />
        </div>
      )}
    </div>
  );
}

function DecisionPage({ requestId }: { requestId: string }) {
  const t = useT().applicant.myRequests;
  const router = useRouter();
  const decision = useRequestResult(requestId);
  const [justDecided, setJustDecided] = useViewState<string | null>(JUST_DECIDED_KEY, null);
  const [, setDraft] = useViewState<RequestDraft>(DRAFT_KEY, EMPTY_DRAFT);
  const [, setSample] = useViewState<string | null>(SAMPLE_KEY, null);
  const dismissToast = useCallback(() => {
    setJustDecided(null);
  }, [setJustDecided]);

  const result = decision.data;
  const organisation = result ? readRequest(result.request).applicant.organisation : "";

  return (
    <div className="grid gap-8">
      <div className="grid gap-4">
        <Link
          href="/requests/"
          className="inline-flex w-fit items-center gap-1.5 rounded-sm text-ui text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t.title}
        </Link>
        <PageHeader
          title={t.decision(requestId)}
          description={organisation || undefined}
          actions={
            result ? (
              <>
                {/* Only a refusal is worth rewriting; a grant stands as issued. */}
                {result.decision === "REJECT" ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      // A fresh id: the server keeps an actioned or appealed decision and refuses its id (409).
                      setDraft({ ...draftFrom(result.request), id: "" });
                      setSample(null);
                      router.push("/");
                    }}
                  >
                    <PencilLine aria-hidden />
                    {t.editAndResubmit}
                  </Button>
                ) : null}
                <Button
                  // The letter's "Open secure workspace" is the primary action when there is a permit.
                  variant={result.spe && result.status === "issued" ? "outline" : "default"}
                  onClick={() => {
                    setDraft(EMPTY_DRAFT);
                    setSample(null);
                    router.push("/");
                  }}
                >
                  <Plus aria-hidden />
                  {t.newRequest}
                </Button>
              </>
            ) : null
          }
        />
      </div>

      {decision.isPending ? (
        <Skeleton className="h-80 rounded-xl" aria-label={t.loadingDecision} />
      ) : decision.isError ? (
        <ErrorState
          title={t.loadFailed(requestId)}
          error={decision.error}
          onRetry={() => void decision.refetch()}
        />
      ) : result ? (
        <div className="grid gap-6">
          <DecisionLetter result={result} />
          {result.decision === "REJECT" && (result.status === "issued" || result.appeal) ? (
            <ReviewRequest result={result} />
          ) : null}
        </div>
      ) : null}

      {justDecided === requestId && result ? (
        <Toast message={t.decisionReady(requestId)} onDone={dismissToast} />
      ) : null}
    </div>
  );
}
