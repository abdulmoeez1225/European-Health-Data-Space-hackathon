"use client";

import { ChevronRight } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { CopyButton } from "./CopyButton";

export function CodeBlock({ title, code, language }: { title: string; code: string; language: string }) {
  return (
    <Collapsible className="rounded-md border">
      <div className="flex items-center gap-1 pr-1">
        <CollapsibleTrigger className="group flex h-8 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-left text-[13px] font-medium outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronRight
            aria-hidden
            className="size-3.5 text-muted-foreground transition-transform duration-100 group-data-[state=open]:rotate-90"
          />
          {title}
          <span className="font-mono text-[11px] font-normal text-muted-foreground">{language}</span>
        </CollapsibleTrigger>
        <CopyButton text={code} label={`Copy ${title.toLowerCase()}`} />
      </div>
      <CollapsibleContent>
        <pre className="max-h-80 overflow-auto border-t bg-muted/40 px-3 py-2.5 font-mono text-xs leading-relaxed">
          <code>{code}</code>
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
