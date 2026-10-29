import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "stats" | "warn" | "reject" | "spe";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent",
  stats: "bg-stats-soft text-stats",
  warn: "bg-warn-soft text-warn",
  reject: "bg-reject-soft text-reject",
  spe: "bg-spe-soft text-spe",
};

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap [&>svg]:size-3.5",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
