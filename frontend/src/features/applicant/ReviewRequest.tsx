"use client";

import { MessageSquareText } from "lucide-react";
import { useId } from "react";

import type { RequestResult } from "@/api/types";
import { QuotedNote } from "@/components/letter/DecisionLetter";
import { ReasonDialog } from "@/components/ReasonDialog";
import { Card } from "@/components/ui/card";
import { useT } from "@/i18n";
import { formatTime } from "@/lib/format";

/**
 * Under a refusal: the case reference, and either the way to ask the access body for a review (once)
 * or the review already asked for, with the applicant's own reason.
 */
export function ReviewRequest({ result }: { result: RequestResult }) {
  const t = useT().applicant.review;
  const { appeal } = result;
  const canAsk = !appeal && result.status === "issued";
  const headingId = useId();

  return (
    <Card role="region" aria-labelledby={headingId} className="grid gap-5 px-6 py-6 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <h2 id={headingId} className="flex items-center gap-2 text-card-title font-semibold">
            <MessageSquareText aria-hidden className="size-4 text-muted-foreground" />
            {appeal ? t.requestedOn(formatTime(appeal.at)) : t.title}
          </h2>
          <p className="max-w-[60ch] text-body text-muted-foreground">{appeal ? t.next : t.text}</p>
        </div>
        {canAsk ? (
          <ReasonDialog
            requestId={result.request_id}
            action="appeal"
            copy={{ ...t, trigger: t.trigger, title: t.dialogTitle, description: t.dialogDescription }}
            triggerVariant="outline"
            submitVariant="default"
          />
        ) : null}
      </div>
      {appeal ? <QuotedNote label={t.yourReason} text={appeal.reason} /> : null}
      <dl className="flex flex-wrap gap-x-2 text-ui">
        <dt className="text-muted-foreground">{t.caseReference}</dt>
        <dd className="font-mono">{result.request_id}</dd>
      </dl>
    </Card>
  );
}
