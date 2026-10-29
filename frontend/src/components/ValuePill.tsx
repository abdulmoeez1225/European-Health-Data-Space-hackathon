import { LESS_THAN_TEN } from "@/lib/format";

import { Tooltip } from "./ui/Tooltip";

export const SMALL_CELL_TEXT = {
  [LESS_THAN_TEN]:
    "Fewer than 10 patients in this group (including none). Exact small counts are never released, so no one can be singled out.",
  suppressed: "This percentage or mean is based on fewer than 10 patients, so it is not released.",
} as const;

/** Calm muted pill for values withheld by the small-cell rule. */
export function ValuePill({ value }: { value: "<10" | "suppressed" }) {
  return (
    <Tooltip content={<span className="block">{SMALL_CELL_TEXT[value]}</span>}>
      <button
        type="button"
        className="inline-flex h-6 cursor-help items-center rounded-full bg-surface-2 px-2.5 text-xs font-semibold text-muted ring-1 ring-line ring-inset"
      >
        {value}
      </button>
    </Tooltip>
  );
}
