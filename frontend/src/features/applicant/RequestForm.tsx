"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";

import {
  REQUEST_KINDS,
  type FieldErrors,
  type RequestDraft,
  type RequestKind,
  type RequiredField,
} from "./draft";

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
  const t = useT().applicant;
  const f = t.form;
  const id = useId();
  const shown = (field: RequiredField) => (touched.has(field) ? errors[field] : undefined);
  const errorProps = (field: RequiredField, errorId: string) =>
    shown(field) ? { "aria-invalid": true, "aria-describedby": errorId } : {};

  return (
    <fieldset disabled={disabled} className="grid disabled:opacity-70">
      <legend className="sr-only">{f.legend}</legend>

      <SettingsSection title={f.applicant} description={f.applicantDescription}>
        <Field label={f.organisation} htmlFor={`${id}-org`} required error={shown("organisation")}>
          <Input
            id={`${id}-org`}
            value={draft.organisation}
            placeholder={f.organisationPlaceholder}
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
        <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <Field label={f.contactName} htmlFor={`${id}-name`}>
            <Input
              id={`${id}-name`}
              value={draft.name}
              placeholder={f.contactNamePlaceholder}
              autoComplete="name"
              onChange={(event) => {
                onChange({ name: event.target.value });
              }}
            />
          </Field>
          <Field label={f.country} htmlFor={`${id}-country`}>
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
      </SettingsSection>

      <SettingsSection title={f.request} description={f.requestDescription}>
        <Field label={f.type} htmlFor={`${id}-kind`} hint={t.draft.kindHelp[draft.kind]}>
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
        <Field label={f.purpose} htmlFor={`${id}-purpose`} required error={shown("purpose")}>
          <Textarea
            id={`${id}-purpose`}
            value={draft.purpose}
            placeholder={f.purposePlaceholder}
            className="min-h-24"
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
        <Field label={f.question} htmlFor={`${id}-question`}>
          <Textarea
            id={`${id}-question`}
            value={draft.question}
            placeholder={f.questionPlaceholder}
            className="min-h-16"
            onChange={(event) => {
              onChange({ question: event.target.value });
            }}
          />
        </Field>
      </SettingsSection>

      <SettingsSection title={f.definitions} required description={f.definitionsDescription}>
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
      </SettingsSection>
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
  const f = useT().applicant.form;
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
    <div className="grid gap-3">
      {definitions.length ? (
        <ol className="grid max-h-80 gap-2 overflow-y-auto p-0.5" aria-label={f.definitions}>
          {definitions.map((definition, index) => (
            <li key={index} className="flex items-center gap-2">
              <span
                aria-hidden
                className="w-5 shrink-0 text-right text-data text-subtle-foreground tabular-nums"
              >
                {index + 1}
              </span>
              <Input
                ref={(element) => {
                  inputs.current[index] = element;
                }}
                value={definition}
                aria-label={f.definition(index + 1)}
                {...(error ? { "aria-invalid": true, "aria-describedby": errorId } : {})}
                placeholder={f.definitionExamples[index] ?? f.anotherDefinition}
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
                size="icon"
                aria-label={f.removeDefinition(index + 1)}
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
        <p className="rounded-lg bg-muted px-4 py-5 text-body text-muted-foreground">
          {f.noDefinitions} <span className="text-foreground">{f.definitionExamples[0]}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          ref={addButton}
          variant="outline"
          onClick={() => {
            insert(definitions.length);
          }}
        >
          <Plus aria-hidden />
          {f.addDefinition}
        </Button>
        <span className="text-data text-muted-foreground">{f.enterHint}</span>
      </div>
      {error ? (
        <p id={errorId} className="text-data text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Settings-style section: title and one line on the left, fields on the right. */
function SettingsSection({
  title,
  description,
  required,
  children,
}: {
  title: string;
  description: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-6 border-t border-divider py-10 first-of-type:border-t-0 first-of-type:pt-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      <div className="grid content-start gap-1.5">
        <h2 className="text-card-title font-semibold">
          {title}
          {required ? <RequiredMark /> : null}
        </h2>
        <p className="text-body text-muted-foreground">{description}</p>
      </div>
      <div className="grid max-w-[640px] content-start gap-6">{children}</div>
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
    <div className="grid content-start gap-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <RequiredMark /> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-data text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-data text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function RequiredMark() {
  return (
    <span aria-hidden className="ml-1 font-normal text-subtle-foreground">
      *
    </span>
  );
}
