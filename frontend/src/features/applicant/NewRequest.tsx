"use client";

import { AlertCircle, Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { errorMessage } from "@/api/errors";
import { mutationKeys, useDecisionMutation, useLatestDecision, useSamples } from "@/api/queries";
import { readRequest } from "@/api/request";
import { useViewState } from "@/app/providers";
import { PageHeader } from "@/components/PageHeader";
import { Toast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/i18n";
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
import { BASELINE_KEY, DRAFT_KEY, JUST_DECIDED_KEY, SAMPLE_KEY, decisionHref } from "./routes";

type Replacement = { draft: RequestDraft; sampleId: string | null; message: string };

const sameDraft = (a: RequestDraft, b: RequestDraft) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The request form. This page never shows a decision: on submit the form stays (disabled) with
 * progress in the action bar, then the decision opens on its own page. The draft survives
 * navigation, so Back returns to it.
 */
export function NewRequest() {
  const t = useT().applicant.newRequest;
  const router = useRouter();
  const [draft, setDraft] = useViewState<RequestDraft>(DRAFT_KEY, EMPTY_DRAFT);
  const [baseline, setBaseline] = useViewState<RequestDraft>(BASELINE_KEY, EMPTY_DRAFT);
  const [sampleId, setSampleId] = useViewState<string | null>(SAMPLE_KEY, null);
  const [, setJustDecided] = useViewState<string | null>(JUST_DECIDED_KEY, null);
  const [touched, setTouched] = useState<ReadonlySet<RequiredField>>(new Set());
  const [confirming, setConfirming] = useState<Replacement | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dismissLoaded = useCallback(() => {
    setLoaded(null);
  }, []);

  const samples = useSamples();
  const submit = useDecisionMutation(mutationKeys.submit, (result) => {
    rememberRequest(result.request_id);
  });
  const latest = useLatestDecision(mutationKeys.submit);
  // Pending is read from the shared cache (it survives leaving the page); an error only from this
  // page's own attempt, so Clear or a new attempt removes it.
  const pending = latest?.status === "pending";
  const failed = submit.error;

  const errors = draftErrors(draft);
  const missing = (Object.keys(errors) as RequiredField[]).map((field) => REQUIRED_LABELS[field]);
  const edited = !sameDraft(draft, baseline);

  const apply = ({ draft: next, sampleId: id, message }: Replacement) => {
    setDraft(next);
    setBaseline(next);
    setSampleId(id);
    setTouched(new Set());
    setLoaded(message);
    cardRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  };
  // Loading into an untouched form needs no confirmation; replacing edits does.
  const replaceWith = (replacement: Replacement) => {
    if (edited) setConfirming(replacement);
    else apply(replacement);
  };

  return (
    <div className="grid gap-8">
      <PageHeader title={t.title} description={t.description} />

      <Card ref={cardRef} className="scroll-mt-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-divider px-6 py-5 sm:px-8">
          <span className="mr-1 text-ui font-medium">{t.startFrom}</span>
          <Select
            value={sampleId ?? ""}
            onValueChange={(id) => {
              const sample = samples.data?.find((candidate) => readRequest(candidate).id === id);
              if (!sample) return;
              const request = readRequest(sample);
              replaceWith({
                draft: draftFrom(sample),
                sampleId: id,
                message: t.loaded(id, shorten(request.applicant.organisation, 28)),
              });
            }}
            disabled={pending || !samples.data?.length}
          >
            <SelectTrigger aria-label={t.sampleLabel} className="w-72 max-w-full">
              <SelectValue placeholder={samples.isError ? t.samplesUnavailable : t.samplePlaceholder} />
            </SelectTrigger>
            <SelectContent align="start" className="w-96">
              {(samples.data ?? []).map((sample) => {
                const request = readRequest(sample);
                return (
                  <SelectItem key={request.id} value={request.id}>
                    <span className="w-9 shrink-0 font-mono text-data text-subtle-foreground">
                      {request.id}
                    </span>
                    <span className="truncate">{shorten(request.applicant.organisation, 40)}</span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <ImportJsonDialog
            disabled={pending}
            onImport={(next) => {
              replaceWith({
                draft: next,
                sampleId: null,
                message: next.id ? t.imported(next.id) : t.importedRequest,
              });
            }}
          />
          <span className="text-ui text-muted-foreground max-lg:hidden">{t.orFillIn}</span>
        </div>

        <form
          ref={formRef}
          noValidate
          aria-busy={pending}
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
                setJustDecided(result.request_id);
                router.push(decisionHref(result.request_id));
              },
            });
          }}
        >
          <div className="px-6 sm:px-8">
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

          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-4 rounded-b-xl border-t border-divider bg-card/95 px-6 py-4 backdrop-blur-sm sm:px-8">
            {pending ? (
              <span aria-hidden className="absolute inset-x-0 -top-px h-px overflow-hidden">
                <span className="block h-full w-1/3 animate-progress bg-primary" />
              </span>
            ) : null}
            <ActionStatus
              pending={pending}
              startedAt={latest?.submittedAt}
              missing={missing}
              error={failed}
            />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setDraft(EMPTY_DRAFT);
                  setBaseline(EMPTY_DRAFT);
                  setSampleId(null);
                  setTouched(new Set());
                  submit.reset();
                }}
              >
                {t.clear}
              </Button>
              <Button type="submit" size="lg" disabled={pending} aria-describedby="submit-status">
                {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
                {pending ? t.deciding : t.submit}
              </Button>
            </div>
          </div>
        </form>
      </Card>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.replaceTitle}</DialogTitle>
            <DialogDescription>{t.replaceDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t.cancel}</Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (confirming) apply(confirming);
                setConfirming(null);
              }}
            >
              {t.replace}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loaded ? <Toast message={loaded} onDone={dismissLoaded} /> : null}
    </div>
  );
}

function ActionStatus({
  pending,
  startedAt,
  missing,
  error,
}: {
  pending: boolean;
  startedAt: number | undefined;
  missing: string[];
  error: Error | null;
}) {
  const t = useT().applicant.newRequest;
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
      <p id="submit-status" role="status" className="text-ui text-muted-foreground">
        {t.checking} · <span className="tabular-nums">{t.seconds(seconds)}</span>
      </p>
    );
  }
  if (error) {
    return (
      <p
        id="submit-status"
        role="alert"
        className="flex max-w-[60ch] items-start gap-2 text-ui text-destructive"
      >
        <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{t.failed(errorMessage(error))}</span>
      </p>
    );
  }
  return (
    <p id="submit-status" className="text-ui text-muted-foreground">
      {missing.length ? t.required(missing.join(", ")) : t.usuallyDecided}
    </p>
  );
}
