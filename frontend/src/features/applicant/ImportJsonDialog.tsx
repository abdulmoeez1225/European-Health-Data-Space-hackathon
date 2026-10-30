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
import { useT } from "@/i18n";

import { parseRequestJson, type RequestDraft } from "./draft";

/** Pasting JSON only fills the form; the form stays the single source of what is submitted. */
export function ImportJsonDialog({
  onImport,
  disabled,
}: {
  onImport: (draft: RequestDraft) => void;
  disabled?: boolean;
}) {
  const t = useT().applicant.importJson;
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
        <Button variant="outline" disabled={disabled}>
          <Braces aria-hidden />
          {t.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <label htmlFor={id} className="sr-only">
            {t.label}
          </label>
          <Textarea
            id={id}
            value={text}
            autoFocus
            spellCheck={false}
            placeholder={t.placeholder}
            aria-invalid={showError || undefined}
            aria-describedby={`${id}-status`}
            className="h-64 resize-none font-mono text-data leading-relaxed field-sizing-fixed"
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
              <span className="text-muted-foreground">{t.ready(result.draft.id)}</span>
            ) : null}
          </p>
        </div>
        <DialogFooter>
          <span className="mr-auto hidden text-xs text-muted-foreground sm:inline">
            <kbd className="font-sans">⌘ Enter</kbd> {t.toFill}
          </span>
          <DialogClose asChild>
            <Button variant="ghost">{t.cancel}</Button>
          </DialogClose>
          <Button disabled={!result.ok} onClick={fill}>
            {t.fill}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
