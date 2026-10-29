"use client";

import { AlertCircle, CheckCircle2, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

import type { Validation } from "./validateRequest";

type JsonEditorProps = {
  value: string;
  onChange: (value: string) => void;
  validation: Validation;
  id: string;
};

const PLACEHOLDER = `{
  "applicant": { "name": "…", "organisation": "…", "country": "AT" },
  "requested_as": "health data request",
  "requested_format": "anonymised statistics",
  "purpose": "…",
  "question": "…",
  "definitions": ["…"]
}`;

export function JsonEditor({ value, onChange, validation, id }: JsonEditorProps) {
  const lines = value ? value.split("\n").length : 0;
  const statusId = `${id}-status`;
  const bad = validation.kind === "invalid" || validation.kind === "incomplete";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">
          Request (JSON)
        </label>
        <Button
          size="sm"
          variant="ghost"
          icon={<WandSparkles aria-hidden className="size-3.5" />}
          disabled={validation.kind !== "valid" && validation.kind !== "incomplete"}
          onClick={() => {
            if (validation.kind === "valid" || validation.kind === "incomplete") {
              onChange(JSON.stringify(validation.request, null, 2));
            }
          }}
        >
          Format
        </Button>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        spellCheck={false}
        rows={14}
        placeholder={PLACEHOLDER}
        aria-invalid={bad || undefined}
        aria-describedby={statusId}
        className={cn(
          "block w-full resize-y rounded-xl border bg-code px-4 py-3 font-mono text-[0.8125rem] leading-relaxed text-fg transition-colors placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          bad ? "border-reject/60" : "border-line focus:border-accent",
        )}
      />
      <p id={statusId} className="mt-2 flex min-h-5 items-center gap-1.5 text-sm" aria-live="polite">
        {validation.kind === "valid" ? (
          <>
            <CheckCircle2 aria-hidden className="size-4 text-stats" />
            <span className="text-muted">Valid request · {lines} lines</span>
          </>
        ) : validation.kind === "empty" ? (
          <span className="text-muted">Pick a sample above or paste a request.</span>
        ) : (
          <>
            <AlertCircle aria-hidden className="size-4 text-reject" />
            <span className="text-reject">
              {validation.kind === "invalid" ? `Invalid JSON: ${validation.message}` : validation.message}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
