import { Lock } from "lucide-react";
import { useId } from "react";

import type { ReleasedCell, StatisticsOutput } from "@/api/types";
import { cn } from "@/lib/cn";
import { formatValue, humanise, isProtectedMarker, LESS_THAN_TEN, SUPPRESSED } from "@/lib/format";

import { ValuePill } from "./ValuePill";

type LedgerNote = { text: string; id: string };

function metricOrder(stats: StatisticsOutput): string[] {
  return [...new Set(stats.rows.flatMap((row) => row.cells.map((cell) => cell.metric)))];
}

function dimensionsOf(stats: StatisticsOutput): string[] {
  if (stats.dimensions.length) return stats.dimensions;
  return Object.keys(stats.rows[0]?.labels ?? {});
}

/** Released statistics: group labels as row headers, right-aligned tabular figures, protected values as pills. */
export function StatsTable({ stats, caption }: { stats: StatisticsOutput; caption?: string }) {
  const baseId = useId();
  const dimensions = dimensionsOf(stats);
  const metrics = metricOrder(stats);
  const notes: LedgerNote[] = [];
  // Ledger-withheld cells have their own footnote; the legend explains only small-cell markers.
  const shownValues = stats.rows.flatMap((row) =>
    row.cells.filter((cell) => !cell.suppressed_by).map((cell) => cell.shown),
  );
  const hasSmall = shownValues.includes(LESS_THAN_TEN);
  const hasSuppressed = shownValues.includes(SUPPRESSED);

  const renderCell = (cell: ReleasedCell | undefined, key: string) => {
    if (!cell) {
      return (
        <td key={key} className="px-4 py-2.5 text-right text-muted">
          –
        </td>
      );
    }
    if (cell.suppressed_by) {
      const note = { text: cell.suppressed_by, id: `${baseId}-note-${notes.length + 1}` };
      notes.push(note);
      return (
        <td key={key} className="px-4 py-2.5 text-right" title={cell.suppressed_by}>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-reject-soft px-2.5 text-xs font-semibold text-reject ring-1 ring-reject/30 ring-inset">
            <Lock role="img" aria-label="Withheld by the release ledger" className="size-3.5" />
            {formatValue(cell.shown, cell.kind)}
            <a
              href={`#${note.id}`}
              aria-label={`Footnote ${notes.length}`}
              className="font-bold underline-offset-2 hover:underline"
            >
              <sup>{notes.length}</sup>
            </a>
          </span>
        </td>
      );
    }
    return (
      <td key={key} className="px-4 py-2.5 text-right font-medium tabular-nums">
        {isProtectedMarker(cell.shown) ? (
          <ValuePill value={cell.shown} />
        ) : (
          formatValue(cell.shown, cell.kind)
        )}
      </td>
    );
  };

  const body = stats.rows.map((row, index) => {
    const byMetric = new Map(row.cells.map((cell) => [cell.metric, cell]));
    return (
      <tr key={index} className="border-t border-line transition-colors hover:bg-surface-2/60">
        {dimensions.length ? (
          dimensions.map((dimension) => (
            <th key={dimension} scope="row" className="px-4 py-2.5 text-left font-semibold">
              {row.labels[dimension] ?? ""}
            </th>
          ))
        ) : (
          <th scope="row" className="px-4 py-2.5 text-left font-semibold">
            All matching patients
          </th>
        )}
        {metrics.map((metric) => renderCell(byMetric.get(metric), metric))}
      </tr>
    );
  });

  return (
    <div>
      <div
        tabIndex={0}
        role="region"
        aria-label={caption ?? "Statistics"}
        className="overflow-x-auto rounded-xl border border-line"
      >
        <table className="w-full min-w-max border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="bg-surface-2 text-xs tracking-wide text-muted uppercase">
            <tr>
              {(dimensions.length ? dimensions : ["group"]).map((dimension) => (
                <th key={dimension} scope="col" className="px-4 py-2.5 text-left font-semibold">
                  {humanise(dimension)}
                </th>
              ))}
              {metrics.map((metric) => (
                <th key={metric} scope="col" className="px-4 py-2.5 text-right font-semibold">
                  {humanise(metric)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>
      {hasSmall || hasSuppressed || notes.length ? (
        <div className="mt-3 grid gap-3 text-sm text-muted">
          {hasSmall || hasSuppressed ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-fg">Small-cell rule.</span>
              {hasSmall ? (
                <span>
                  <PillLegend>{LESS_THAN_TEN}</PillLegend> a group of fewer than 10 patients, including 0.
                </span>
              ) : null}
              {hasSuppressed ? (
                <span>
                  <PillLegend>{SUPPRESSED}</PillLegend> a percentage or mean based on fewer than 10 patients.
                </span>
              ) : null}
            </p>
          ) : null}
          {notes.length ? (
            <div className="rounded-lg border-l-[3px] border-reject bg-reject-soft/70 px-4 py-3 text-fg">
              <p className="flex items-center gap-2 font-semibold">
                <Lock aria-hidden className="size-4 text-reject" />
                Withheld by the Release Ledger
              </p>
              <p className="mt-0.5 text-muted">
                Combined with an answer you received earlier,{" "}
                {notes.length === 1 ? "this value" : "these values"} would let someone work out a group of
                fewer than 10 patients by subtraction.
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                {notes.map((note) => (
                  <li key={note.id} id={note.id} className="scroll-mt-24">
                    {note.text.charAt(0).toUpperCase() + note.text.slice(1)}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PillLegend({ children }: { children: string }) {
  return (
    <span
      className={cn(
        "mr-1 inline-flex h-5 items-center rounded-full bg-surface-2 px-2 text-xs font-semibold text-muted ring-1 ring-line ring-inset",
      )}
    >
      {children}
    </span>
  );
}
