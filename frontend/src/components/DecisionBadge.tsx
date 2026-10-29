import { Ban, BarChart3, ShieldCheck } from "lucide-react";

import type { Decision } from "@/api/types";
import { cn } from "@/lib/cn";
import { decisionMeta, type DecisionTone } from "@/lib/decisions";

const TONE_CLASSES: Record<DecisionTone, string> = {
  reject: "bg-reject-soft text-reject ring-reject/35",
  stats: "bg-stats-soft text-stats ring-stats/35",
  spe: "bg-spe-soft text-spe ring-spe/35",
};

export const TONE_ICONS = { reject: Ban, stats: BarChart3, spe: ShieldCheck } as const;

export function toneClasses(tone: DecisionTone): string {
  return TONE_CLASSES[tone];
}

export function DecisionBadge({ decision, size = "sm" }: { decision: Decision; size?: "sm" | "lg" }) {
  const meta = decisionMeta(decision);
  const Icon = TONE_ICONS[meta.tone];
  return (
    <span
      data-tone={meta.tone}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ring-1 ring-inset",
        TONE_CLASSES[meta.tone],
        size === "lg" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-0.5 text-xs",
      )}
    >
      <Icon aria-hidden className={size === "lg" ? "size-4" : "size-3.5"} />
      {meta.label}
    </span>
  );
}
