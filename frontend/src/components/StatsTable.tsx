import { Lock } from "lucide-react";
import { useId } from "react";

import type { ReleasedCell, StatisticsOutput } from "@/api/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { capitalise, formatValue, humanise, isProtectedMarker } from "@/lib/format";

import { SmallCellBadge } from "./SmallCellBadge";

function metricOrder(stats: StatisticsOutput): string[] {
  return [...new Set(stats.rows.flatMap((row) => row.cells.map((cell) => cell.metric)))];
}

function dimensionsOf(stats: StatisticsOutput): string[] {
  if (stats.dimensions.length) return stats.dimensions;
  return Object.keys(stats.rows[0]?.labels ?? {});
}

export function StatsTable({ stats, caption }: { stats: StatisticsOutput; caption: string }) {
  const baseId = useId();
  const dimensions = dimensionsOf(stats);
  const metrics = metricOrder(stats);
  const notes: { id: string; text: string }[] = [];
  const hasSmallCells = stats.rows.some((row) =>
    row.cells.some((cell) => !cell.suppressed_by && isProtectedMarker(cell.shown)),
  );

  // One value per cell; ledger-withheld values get a lock and a numbered footnote.
  const renderValue = (cell: ReleasedCell, iconSize: string) => {
    if (cell.suppressed_by) {
      const number = notes.length + 1;
      const note = { id: `${baseId}-note-${number}`, text: capitalise(cell.suppressed_by) };
      notes.push(note);
      return (
        <span className="inline-flex items-center gap-1 font-medium text-destructive">
          <Lock role="img" aria-label="Withheld by the release ledger" className={iconSize} />
          {formatValue(cell.shown, cell.kind)}
          <a
            href={`#${note.id}`}
            aria-label={`Footnote ${number}`}
            className="rounded-sm text-caption outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <sup>{number}</sup>
          </a>
        </span>
      );
    }
    return isProtectedMarker(cell.shown) ? (
      <SmallCellBadge value={cell.shown} />
    ) : (
      formatValue(cell.shown, cell.kind)
    );
  };

  const renderCell = (cell: ReleasedCell | undefined, key: string) =>
    cell ? (
      <TableCell key={key} className="text-right tabular-nums">
        {renderValue(cell, "size-3")}
      </TableCell>
    ) : (
      <TableCell key={key} className="text-right text-muted-foreground">
        –
      </TableCell>
    );

  // An ungrouped answer (no group-by: one row without labels) is a single number, not a table.
  const single = dimensions.length === 0 && stats.rows.length === 1 ? stats.rows[0] : undefined;

  return (
    <div className="grid gap-3">
      {single ? (
        <dl aria-label={caption} className="grid gap-5 sm:grid-cols-2">
          {single.cells.map((cell) => (
            <div key={cell.metric} className="grid gap-1">
              <dt className="text-ui text-muted-foreground">{humanise(cell.metric)}</dt>
              <dd className="text-title font-semibold tabular-nums">{renderValue(cell, "size-5")}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="overflow-hidden rounded-lg border border-divider">
          <Table label={caption}>
            <caption className="sr-only">{caption}</caption>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-transparent">
                {(dimensions.length ? dimensions : ["group"]).map((dimension) => (
                  <TableHead key={dimension} scope="col">
                    {humanise(dimension)}
                  </TableHead>
                ))}
                {metrics.map((metric) => (
                  <TableHead key={metric} scope="col" className="max-w-48 text-right whitespace-normal">
                    {humanise(metric)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.rows.map((row, index) => {
                const byMetric = new Map(row.cells.map((cell) => [cell.metric, cell]));
                return (
                  <TableRow key={index}>
                    {dimensions.length ? (
                      dimensions.map((dimension) => (
                        <TableHead
                          key={dimension}
                          scope="row"
                          className="h-auto text-data font-normal text-foreground"
                        >
                          {row.labels[dimension] ?? ""}
                        </TableHead>
                      ))
                    ) : (
                      <TableHead scope="row" className="h-auto text-data font-normal text-foreground">
                        All matching patients
                      </TableHead>
                    )}
                    {metrics.map((metric) => renderCell(byMetric.get(metric), metric))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {hasSmallCells ? (
        <p className="text-data text-muted-foreground">
          <span className="font-medium text-foreground">&lt;10</span> and{" "}
          <span className="font-medium text-foreground">suppressed</span> hide groups of fewer than 10
          patients (small-cell rule).
        </p>
      ) : null}
      {notes.length ? (
        <ol className="grid gap-1 text-data text-muted-foreground">
          {notes.map((note, index) => (
            <li key={note.id} id={note.id} className="flex scroll-mt-24 gap-1.5">
              <Lock aria-hidden className="mt-1 size-3.5 shrink-0 text-destructive" />
              <span>
                <sup className="mr-0.5">{index + 1}</sup>
                <span className="font-medium text-foreground">Withheld by the release ledger.</span>{" "}
                {note.text}.
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
