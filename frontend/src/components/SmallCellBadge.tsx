"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/i18n";
import type { SUPPRESSED } from "@/lib/format";
import { formatValue, LESS_THAN_TEN } from "@/lib/format";

/** Muted marker for a value the small-cell rule withholds; the tooltip explains the rule. */
export function SmallCellBadge({ value }: { value: typeof LESS_THAN_TEN | typeof SUPPRESSED }) {
  const t = useT();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-6 cursor-help items-center rounded-md bg-accent px-2 text-caption font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {formatValue(value)}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {value === LESS_THAN_TEN ? t.smallCells.lessThanTen : t.smallCells.suppressed}
      </TooltipContent>
    </Tooltip>
  );
}
