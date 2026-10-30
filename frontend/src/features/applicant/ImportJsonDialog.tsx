"use client";

import { AlertCircle, Braces } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { parseRequestJson, type RequestDraft } from "./draft";

const PLACEHOLDER = `{
  "applicant": { "name": "…", "organisation": "…", "country": "AT" },
  "requested_as": "health data request",
  "purpose": "…",
  "question": "…",
  "definitions": ["Adult = aged 18 or older on 31 December 2025."]
}`;

/** Pasting JSON only fills the form; the form stays the single source of what is submitted. */
export function ImportJsonDialog({
  onImport,
  disabled,
}: {
  onImport: (draft: RequestDraft) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const result = parseRequestJson(text);
  const showError = text.trim() !== "" && !result.ok;

  const fill = () => {
    if (!result.ok) return;
    onImport(result.draft);
    setOpen(false);
    setText("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" disabled={disabled}>
          <Braces aria-hidden />
          Import JSON
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import JSON</DialogTitle>
          <DialogDescription>
            Paste a request in the track format. It fills the form; unknown keys are ignored.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <label htmlFor={id} className="sr-only">
            Request JSON
          </label>
          <Textarea
            id={id}
            value={text}
            autoFocus
            spellCheck={false}
            placeholder={PLACEHOLDER}
            aria-invalid={showError || undefined}
            aria-describedby={`${id}-status`}
            className="h-64 resize-none font-mono text-xs leading-relaxed field-sizing-fixed"
            onChange={(event) => {
              setText(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                fill();
              }
            }}
          />
          <p id={`${id}-status`} aria-live="polite" className="flex min-h-4 items-center gap-1.5 text-xs">
            {showError && !result.ok ? (
              <>
                <AlertCircle aria-hidden className="size-3.5 text-destructive" />
                <span className="text-destructive">{result.message}</span>
              </>
            ) : result.ok ? (
              <span className="text-muted-foreground">
                Ready to fill the form{result.draft.id ? ` with ${result.draft.id}` : ""}.
              </span>
            ) : null}
          </p>
        </div>
        <DialogFooter>
          <span className="mr-auto hidden text-xs text-muted-foreground sm:inline">
            <kbd className="font-sans">⌘ Enter</kbd> to fill
          </span>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button disabled={!result.ok} onClick={fill}>
            Fill form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
