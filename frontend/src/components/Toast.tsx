"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";

/** A small confirmation in the corner that leaves on its own. */
export function Toast({
  message,
  onDone,
  duration = 4000,
}: {
  message: string;
  onDone: () => void;
  duration?: number;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, duration);
    return () => {
      window.clearTimeout(timer);
    };
  }, [onDone, duration]);

  return (
    <div
      role="status"
      className="fixed top-2 right-4 z-50 flex max-w-[420px] animate-in items-center gap-2.5 rounded-lg border bg-popover px-3.5 py-2 text-ui text-popover-foreground shadow-float duration-150 fade-in-0 slide-in-from-top-2"
    >
      <CheckCircle2 aria-hidden className="size-4 text-success" />
      <span>{message}</span>
    </div>
  );
}
