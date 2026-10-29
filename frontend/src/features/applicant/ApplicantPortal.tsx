"use client";

import { RotateCcw, Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef } from "react";

import { mutationKeys, useDecisionMutation, useLatestDecision, useRequestResult } from "@/api/queries";
import { readRequest } from "@/api/request";
import type { JsonObject } from "@/api/types";
import { DecisionLetter } from "@/components/letter/DecisionLetter";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { useViewState } from "@/app/providers";
import { decisionMeta } from "@/lib/decisions";
import { scrollBehavior } from "@/lib/motion";

import { JsonEditor } from "./JsonEditor";
import { ProgressTimeline } from "./ProgressTimeline";
import { SampleGallery } from "./SampleGallery";
import { validateRequest } from "./validateRequest";

function StepHeading({ step, children }: { step: number; children: string }) {
  return (
    <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold">
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent"
      >
        {step}
      </span>
      {children}
    </h2>
  );
}

export function ApplicantPortal() {
  const editorId = useId();
  const [text, setText] = useViewState("applicant.draft", "");
  const [selectedId, setSelectedId] = useViewState<string | null>("applicant.sample", null);
  const submit = useDecisionMutation(mutationKeys.submit);
  const latest = useLatestDecision(mutationKeys.submit);
  const resultRef = useRef<HTMLDivElement>(null);
  const validation = validateRequest(text);
  const pending = latest?.status === "pending";
  const router = useRouter();
  // ?decision=<request id> is the shareable link to a decision letter; a submission in this tab takes precedence.
  const decisionId = useSearchParams().get("decision");
  const fromLink = !latest || latest.status === "idle";
  const linked = useRequestResult(fromLink ? decisionId : null);
  const letter = latest?.status === "success" ? latest.result : fromLink ? linked.data : undefined;

  const status = latest?.status;
  const submittedAt = latest?.submittedAt;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const region = resultRef.current;
    if (!region || status === undefined || status === "idle") return;
    region.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    if (status === "success") region.focus({ preventScroll: true });
  }, [status, submittedAt]);

  const pick = (sample: JsonObject) => {
    setText(JSON.stringify(sample, null, 2));
    setSelectedId(readRequest(sample).id || null);
  };

  return (
    <div>
      <p role="status" className="sr-only">
        {pending
          ? "Processing your request."
          : latest?.status === "success" && latest.result
            ? `Decision ready: ${decisionMeta(latest.result.decision).label}.`
            : ""}
      </p>

      <div
        ref={resultRef}
        tabIndex={-1}
        aria-label="Decision"
        className="scroll-mt-36 rounded-[14px] empty:hidden focus:outline-none [&:not(:empty)]:mb-12"
      >
        {pending ? <ProgressTimeline startedAt={latest.submittedAt} /> : null}
        {latest?.status === "error" ? (
          <ErrorState title="The request could not be processed" error={latest.error} />
        ) : null}
        {fromLink && linked.isPending && linked.fetchStatus !== "idle" ? (
          <Skeleton className="h-96 rounded-[14px]" />
        ) : null}
        {fromLink && linked.isError ? (
          <ErrorState title={`Could not load decision ${decisionId ?? ""}`} error={linked.error} />
        ) : null}
        {letter ? <DecisionLetter result={letter} /> : null}
      </div>

      <section aria-labelledby="choose" className="mb-10">
        <div id="choose">
          <StepHeading step={1}>Choose a request</StepHeading>
        </div>
        <SampleGallery selectedId={selectedId} onPick={pick} />
      </section>

      <section aria-label="Review and submit" className="mb-10">
        <StepHeading step={2}>Review and submit</StepHeading>
        <Card className="p-5 sm:p-6">
          <JsonEditor
            id={editorId}
            value={text}
            onChange={(value) => {
              setText(value);
              setSelectedId(null);
            }}
            validation={validation}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button
              variant="primary"
              size="lg"
              icon={<Send aria-hidden className="size-4" />}
              loading={pending}
              disabled={validation.kind !== "valid"}
              onClick={() => {
                if (validation.kind !== "valid") return;
                submit.mutate(validation.request, {
                  onSuccess: (result) => {
                    router.replace(`/?decision=${encodeURIComponent(result.request_id)}`, { scroll: false });
                  },
                });
              }}
            >
              {pending ? "Deciding…" : "Submit request"}
            </Button>
            {text ? (
              <Button
                variant="ghost"
                icon={<RotateCcw aria-hidden className="size-4" />}
                disabled={pending}
                onClick={() => {
                  setText("");
                  setSelectedId(null);
                }}
              >
                Clear
              </Button>
            ) : null}
            <p className="text-sm text-muted">
              Only the request text is sent to the language model, never patient data.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
