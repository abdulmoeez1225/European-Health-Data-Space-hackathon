"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  REQUEST_KINDS,
  type FieldErrors,
  type RequestDraft,
  type RequestKind,
  type RequiredField,
} from "./draft";

const DEFINITION_EXAMPLES = [
  "Adult = aged 18 or older on 31 December 2025.",
  "Type 2 diabetes = any condition with an ICD-10 code starting with E11.",
  "Report per region: adults, adults with type 2 diabetes and the prevalence.",
];

type FormProps = {
  draft: RequestDraft;
  onChange: (patch: Partial<RequestDraft>) => void;
  errors: FieldErrors;
  /** Required fields whose errors are shown: visited, or all after a submit attempt. */
  touched: ReadonlySet<RequiredField>;
  onTouch: (field: RequiredField) => void;
  disabled?: boolean;
};

export function RequestForm({ draft, onChange, errors, touched, onTouch, disabled }: FormProps) {
  const id = useId();
  const shown = (field: RequiredField) => (touched.has(field) ? errors[field] : undefined);
  const errorProps = (field: RequiredField, errorId: string) =>
    shown(field) ? { "aria-invalid": true, "aria-describedby": errorId } : {};

  return (
    <fieldset disabled={disabled} className="grid gap-6">
      <legend className="sr-only">Data request</legend>

      <Section title="Applicant" description="Who is asking. Requests are decided per organisation.">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_5rem]">
          <Field label="Name" htmlFor={`${id}-name`}>
            <Input
              id={`${id}-name`}
              value={draft.name}
              placeholder="Dr. Sophie Lechner"
              autoComplete="name"
              onChange={(event) => {
                onChange({ name: event.target.value });
              }}
            />
          </Field>
          <Field label="Organisation" htmlFor={`${id}-org`} required error={shown("organisation")}>
            <Input
              id={`${id}-org`}
              value={draft.organisation}
              placeholder="University research group"
              autoComplete="organization"
              aria-required
              {...errorProps("organisation", `${id}-org-error`)}
              onBlur={() => {
                onTouch("organisation");
              }}
              onChange={(event) => {
                onChange({ organisation: event.target.value });
              }}
            />
          </Field>
          <Field label="Country" htmlFor={`${id}-country`}>
            <Input
              id={`${id}-country`}
              value={draft.country}
              placeholder="AT"
              maxLength={2}
              className="uppercase placeholder:normal-case"
              onChange={(event) => {
                onChange({ country: event.target.value.toUpperCase() });
              }}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Request"
        description="What you ask for and why. Only this text is sent to the language model."
      >
        <Field
          label="Type"
          htmlFor={`${id}-kind`}
          hint={
            draft.kind === "records"
              ? "Records are only granted inside the secure environment, and only if you explain why statistics are not enough."
              : "Answered with anonymised counts, percentages or means."
          }
        >
          <Select
            value={draft.kind}
            onValueChange={(value) => {
              onChange({ kind: value as RequestKind });
            }}
            disabled={disabled}
          >
            <SelectTrigger id={`${id}-kind`} className="w-full" aria-describedby={`${id}-kind-hint`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(REQUEST_KINDS) as RequestKind[]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {REQUEST_KINDS[kind].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Purpose" htmlFor={`${id}-purpose`} required error={shown("purpose")}>
          <Textarea
            id={`${id}-purpose`}
            value={draft.purpose}
            placeholder="We study regional differences in type 2 diabetes to plan a prevention programme with the regional health authorities."
            className="min-h-[72px]"
            aria-required
            {...errorProps("purpose", `${id}-purpose-error`)}
            onBlur={() => {
              onTouch("purpose");
            }}
            onChange={(event) => {
              onChange({ purpose: event.target.value });
            }}
          />
        </Field>
        <Field label="Question" htmlFor={`${id}-question`}>
          <Textarea
            id={`${id}-question`}
            value={draft.question}
            placeholder="How many adults have type 2 diabetes in each region, and what is the prevalence?"
            className="min-h-[52px]"
            onChange={(event) => {
              onChange({ question: event.target.value });
            }}
          />
        </Field>
      </Section>

      <Definitions
        definitions={draft.definitions}
        onChange={(definitions) => {
          onChange({ definitions });
        }}
        onTouch={() => {
          onTouch("definitions");
        }}
        error={shown("definitions")}
        errorId={`${id}-definitions-error`}
      />
    </fieldset>
  );
}

function Definitions({
  definitions,
  onChange,
  onTouch,
  error,
  errorId,
}: {
  definitions: string[];
  onChange: (definitions: string[]) => void;
  onTouch: () => void;
  error?: string;
  errorId: string;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focusIndex = useRef<number | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  // Move focus after rows are added or removed (Enter adds below, Backspace on an empty row removes it).
  useEffect(() => {
    const index = focusIndex.current;
    if (index === null) return;
    focusIndex.current = null;
    if (index < 0) addButton.current?.focus();
    else inputs.current[index]?.focus();
  });

  const insert = (at: number) => {
    focusIndex.current = at;
    onChange([...definitions.slice(0, at), "", ...definitions.slice(at)]);
  };
  const remove = (at: number) => {
    focusIndex.current = definitions.length > 1 ? Math.max(0, at - 1) : -1;
    onChange(definitions.filter((_, i) => i !== at));
    onTouch();
  };

  return (
    <Section
      title="Definitions"
      required
      description="Define every condition, drug, measurement and group in plain English. The codes are looked up for you."
    >
      {definitions.length ? (
        <ol className="grid max-h-72 gap-1.5 overflow-y-auto p-0.5" aria-label="Definitions">
          {definitions.map((definition, index) => (
            <li key={index} className="group flex items-center gap-2">
              <span
                aria-hidden
                className="w-4 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
              >
                {index + 1}
              </span>
              <Input
                ref={(element) => {
                  inputs.current[index] = element;
                }}
                value={definition}
                aria-label={`Definition ${index + 1}`}
                {...(error ? { "aria-invalid": true, "aria-describedby": errorId } : {})}
                placeholder={DEFINITION_EXAMPLES[index] ?? "Another definition"}
                onBlur={onTouch}
                onChange={(event) => {
                  onChange(definitions.map((d, i) => (i === index ? event.target.value : d)));
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.repeat) return;
                  if (event.key === "Enter") {
                    event.preventDefault();
                    insert(index + 1);
                  } else if (event.key === "Backspace" && !definition) {
                    event.preventDefault();
                    remove(index);
                  }
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove definition ${index + 1}`}
                onClick={() => {
                  remove(index);
                }}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="rounded-md border border-dashed px-4 py-5 text-center text-[13px] text-muted-foreground">
          No definitions yet. For example:{" "}
          <span className="text-foreground/80">{DEFINITION_EXAMPLES[0]}</span>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          ref={addButton}
          variant="outline"
          size="sm"
          onClick={() => {
            insert(definitions.length);
          }}
        >
          <Plus aria-hidden />
          Add definition
        </Button>
        {definitions.length ? (
          <span className="text-xs text-muted-foreground">
            <kbd className="font-sans">Enter</kbd> adds a row below
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </Section>
  );
}

function Section({
  title,
  description,
  required,
  children,
}: {
  title: string;
  description?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-[13px] font-medium">
          {title}
          {required ? <RequiredMark /> : null}
        </h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <RequiredMark /> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function RequiredMark() {
  return (
    <span aria-hidden className="ml-0.5 font-normal text-muted-foreground/70">
      *
    </span>
  );
}
