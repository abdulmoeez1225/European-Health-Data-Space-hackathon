"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { CopyButton } from "./CopyButton";

type CodeBlockProps = { summary: string; code: string; language?: string; defaultOpen?: boolean };

export function CodeBlock({ summary, code, language, defaultOpen = false }: CodeBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-xl border border-line"
    >
      <div className="flex items-center justify-between gap-2 bg-surface-2/60 pr-2">
        <Collapsible.Trigger className="group flex flex-1 items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-accent">
          <ChevronRight
            aria-hidden
            className="size-4 transition-transform duration-150 group-data-[state=open]:rotate-90"
          />
          {summary}
          {language ? <span className="font-mono text-xs font-normal text-muted">{language}</span> : null}
        </Collapsible.Trigger>
        <CopyButton text={code} />
      </div>
      <Collapsible.Content>
        <pre className="max-h-[420px] overflow-auto border-t border-line bg-code px-4 py-3 font-mono text-[0.8125rem] leading-relaxed text-fg">
          <code>{code}</code>
        </pre>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
