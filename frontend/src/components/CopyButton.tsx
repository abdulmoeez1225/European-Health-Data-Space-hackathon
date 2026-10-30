"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => {
      setCopied(false);
    }, 1500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [copied]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        title={copied ? "Copied" : label}
        onClick={() => {
          navigator.clipboard?.writeText(text).then(
            () => {
              setCopied(true);
            },
            () => undefined,
          );
        }}
      >
        {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
      {/* Outside the button: a button's content is not exposed as a live region. */}
      <span role="status" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}
