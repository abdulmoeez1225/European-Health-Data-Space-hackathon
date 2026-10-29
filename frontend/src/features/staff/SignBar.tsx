"use client";

import { PenLine, Undo2, UserCheck } from "lucide-react";
import { useEffect, useRef } from "react";

import { useSignatures } from "@/app/providers";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";

export function SignBar({ requestId }: { requestId: string }) {
  const { signatures, sign, undo } = useSignatures();
  const signature = signatures[requestId];
  const signed = signature !== undefined;
  const undoRef = useRef<HTMLButtonElement>(null);
  const signRef = useRef<HTMLButtonElement>(null);
  const previous = useRef(signed);

  // The clicked button is replaced, so move focus to its counterpart instead of losing it.
  useEffect(() => {
    if (previous.current === signed) return;
    previous.current = signed;
    (signed ? undoRef : signRef).current?.focus();
  }, [signed]);

  if (signature) {
    const approved = signature.kind === "sign";
    return (
      <div className="flex flex-wrap items-center gap-4">
        <div
          role="status"
          className={cn(
            "inline-flex -rotate-1 animate-pop flex-col rounded-lg border-[3px] border-double px-4 py-2 tracking-[0.08em] uppercase",
            approved ? "border-stats text-stats" : "border-warn text-warn",
          )}
        >
          <span className="text-sm font-bold">
            {approved ? "Signed by HDAB staff" : "Overridden by HDAB staff"}
          </span>
          <span className="text-xs font-semibold">{formatTime(signature.at)}</span>
        </div>
        <Button
          ref={undoRef}
          size="sm"
          variant="ghost"
          icon={<Undo2 aria-hidden className="size-3.5" />}
          onClick={() => {
            undo(requestId);
          }}
        >
          Undo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        ref={signRef}
        variant="primary"
        icon={<UserCheck aria-hidden className="size-4" />}
        onClick={() => {
          sign(requestId, "sign");
        }}
      >
        Approve &amp; sign
      </Button>
      <Button
        icon={<PenLine aria-hidden className="size-4" />}
        onClick={() => {
          sign(requestId, "override");
        }}
      >
        Override
      </Button>
      <span className="text-xs text-muted">Local UI state only</span>
    </div>
  );
}
