import type { Decision } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { decisionMeta, TONE_BADGE, TONE_DOT } from "@/lib/decisions";

function StatusDot({ decision }: { decision: Decision }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-1.5 shrink-0 rounded-full", TONE_DOT[decisionMeta(decision).tone])}
    />
  );
}

/** The decision as a tinted badge: dot plus label, so colour is never the only signal. */
export function DecisionBadge({ decision, short = false }: { decision: Decision; short?: boolean }) {
  const meta = decisionMeta(decision);
  return (
    <Badge variant={TONE_BADGE[meta.tone]} data-tone={meta.tone} title={short ? meta.label : undefined}>
      <StatusDot decision={decision} />
      {short ? meta.short : meta.label}
    </Badge>
  );
}
