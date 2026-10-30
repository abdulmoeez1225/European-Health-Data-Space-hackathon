"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  mutationKeys,
  useDecisionMutation,
  useLatestDecision,
  useRequestResult,
  useSamples,
} from "@/api/queries";
import { readRequest } from "@/api/request";
import { useViewState } from "@/app/providers";
import { DecisionLetter } from "@/components/letter/DecisionLetter";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { decisionMeta } from "@/lib/decisions";
import { shorten } from "@/lib/format";
import { scrollBehavior } from "@/lib/motion";
import { rememberRequest } from "@/lib/my-requests";

import {
  draftErrors,
  draftFrom,
  EMPTY_DRAFT,
  REQUIRED_LABELS,
  toRequest,
  type RequestDraft,
  type RequiredField,
} from "./draft";
import { ImportJsonDialog } from "./ImportJsonDialog";
import { RequestForm } from "./RequestForm";

export function NewRequest() {
  const router = useRouter();
  const [draft, setDraft] = useViewState<RequestDraft>("applicant.draft", EMPTY_DRAFT);
  const [sampleId, setSampleId] = useViewState<string | null>("applicant.sample", null);
  const [touched, setTouched] = useState<ReadonlySet<RequiredField>>(new Set());

  const samples = useSamples();
  const submit = useDecisionMutation(mutationKeys.submit);
  const latest = useLatestDecision(mutationKeys.submit);
  const pending = latest?.status === "pending";

  // ?decision=<id> links to a decision letter; a submission in this tab takes precedence.
  const decisionId = useSearchParams().get("decision");
  const fromLink = !latest || latest.status === "idle";
  const linked = useRequestResult(fromLink ? decisionId : null);
  const letter = latest?.status === "success" ? latest.result : fromLink ? linked.data : undefined;

  const errors = draftErrors(draft);
  const missing = (Object.keys(errors) as RequiredField[]).map((field) => REQUIRED_LABELS[field]);

  const fill = (next: RequestDraft, id: string | null) => {
    setDraft(next);
    setSampleId(id);
    setTouched(new Set());
  };

  // A decision that arrives while the page is open is brought into view; one that is already
  // there when the page mounts (navigating back) is not, so the form can be used again.
  const letterRef = useRef<HTMLDivElement>(null);
  const submittedAt = latest?.status === "success" ? latest.submittedAt : null;
  const shownAt = useRef(submittedAt);
  useEffect(() => {
    if (submittedAt === null || submittedAt === shownAt.current) return;
    shownAt.current = submittedAt;
    letterRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    letterRef.current?.focus({ preventScroll: true });
  }, [submittedAt]);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader
        title="Request health data"
        description="Submit a request. You get a decision with the legal basis in seconds."
        actions={
          <>
            <ImportJsonDialog
              disabled={pending}
              onImport={(next) => {
                fill(next, null);
              }}
            />
            <Select
              value={sampleId ?? ""}
              onValueChange={(id) => {
                const sample = samples.data?.find((candidate) => readRequest(candidate).id === id);
                if (sample) fill(draftFrom(sample), id);
              }}
              disabled={pending || !samples.data?.length}
            >
              <SelectTrigger aria-label="Load a sample request" className="w-48">
                <SelectValue placeholder={samples.isError ? "Samples unavailable" : "Load sample…"} />
              </SelectTrigger>
              <SelectContent align="end" className="w-96">
                {(samples.data ?? []).map((sample) => {
                  const request = readRequest(sample);
                  return (
                    <SelectItem key={request.id} value={request.id}>
                      <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">
                        {request.id}
                      </span>
                      <span className="truncate">{shorten(request.applicant.organisation, 44)}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </>
        }
      />

      <p role="status" className="sr-only">
        {pending
          ? "Processing your request."
          : latest?.status === "success" && latest.result
            ? `Decision ready: ${decisionMeta(latest.result.decision).label}.`
            : ""}
      </p>

      <div
        ref={letterRef}
        tabIndex={-1}
        role="region"
        aria-label="Decision"
        className="grid scroll-mt-6 gap-3 outline-none empty:hidden"
      >
        {latest?.status === "error" ? (
          <ErrorState title="The request could not be processed" error={latest.error} />
        ) : null}
        {fromLink && linked.isPending && linked.fetchStatus !== "idle" ? (
          <Skeleton className="h-72 rounded-lg" aria-label="Loading decision" />
        ) : null}
        {fromLink && linked.isError ? (
          <ErrorState title={`Could not load decision ${decisionId ?? ""}`} error={linked.error} />
        ) : null}
        {letter ? <DecisionLetter result={letter} /> : null}
      </div>

      <Card>
        <form
          ref={formRef}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            if (missing.length) {
              // Show every missing field and move focus to the first one.
              setTouched(new Set(Object.keys(errors) as RequiredField[]));
              requestAnimationFrame(() => {
                formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
              });
              return;
            }
            submit.mutate(toRequest(draft), {
              onSuccess: (result) => {
                rememberRequest(result.request_id);
                router.replace(`/?decision=${encodeURIComponent(result.request_id)}`, { scroll: false });
              },
            });
          }}
        >
          <div className="px-5 py-5">
            <RequestForm
              draft={draft}
              onChange={(patch) => {
                setDraft({ ...draft, ...patch });
              }}
              errors={errors}
              touched={touched}
              onTouch={(field) => {
                setTouched((current) => new Set(current).add(field));
              }}
              disabled={pending}
            />
          </div>
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t bg-card/95 px-5 py-3 backdrop-blur-sm">
            {pending ? (
              <span aria-hidden className="absolute inset-x-0 -top-px h-px overflow-hidden">
                <span className="block h-full w-1/3 animate-progress bg-primary" />
              </span>
            ) : null}
            <SubmitStatus pending={pending} startedAt={latest?.submittedAt} missing={missing} />
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  fill(EMPTY_DRAFT, null);
                }}
              >
                Clear
              </Button>
              <Button type="submit" disabled={pending} aria-describedby="submit-status">
                {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
                {pending ? "Deciding…" : "Submit request"}
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}

function SubmitStatus({
  pending,
  startedAt,
  missing,
}: {
  pending: boolean;
  startedAt: number | undefined;
  missing: string[];
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [pending]);

  if (pending) {
    const seconds = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
    return (
      <p id="submit-status" className="text-xs text-muted-foreground">
        Checking the purpose and computing the answer · <span className="tabular-nums">{seconds} s</span>
      </p>
    );
  }
  if (missing.length)
    return (
      <p id="submit-status" className="text-xs text-muted-foreground">
        Required: {missing.join(", ")}.
      </p>
    );
  return (
    <p id="submit-status" className="text-xs text-muted-foreground">
      Usually decided in 5–15 seconds.
    </p>
  );
}
