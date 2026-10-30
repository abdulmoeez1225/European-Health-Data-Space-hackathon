"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LESS_THAN_TEN, SUPPRESSED } from "@/lib/format";

export const SMALL_CELL_TEXT = {
  [LESS_THAN_TEN]:
    "Fewer than 10 patients in this group, including none. Small counts are never released, so no one can be singled out.",
  [SUPPRESSED]: "Based on fewer than 10 patients, so this percentage or mean is not released.",
} as const;

/** Muted marker for a value the small-cell rule withholds; the tooltip explains the rule. */
export function SmallCellBadge({ value }: { value: typeof LESS_THAN_TEN | typeof SUPPRESSED }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-6 cursor-help items-center rounded-md bg-accent px-2 text-caption font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {value}
        </button>
      </TooltipTrigger>
      <TooltipContent>{SMALL_CELL_TEXT[value]}</TooltipContent>
    </Tooltip>
  );
}
