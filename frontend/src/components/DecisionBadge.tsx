import type { Decision } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { decisionMeta, TONE_DOT } from "@/lib/decisions";

export function StatusDot({ decision, className }: { decision: Decision; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        TONE_DOT[decisionMeta(decision).tone],
        className,
      )}
    />
  );
}

/** Decision as a neutral badge with a status dot; the text carries the meaning, the dot the colour. */
export function DecisionBadge({ decision, short = false }: { decision: Decision; short?: boolean }) {
  const meta = decisionMeta(decision);
  return (
    <Badge variant="outline" data-tone={meta.tone} title={short ? meta.label : undefined}>
      <StatusDot decision={decision} />
      {short ? meta.short : meta.label}
    </Badge>
  );
}
