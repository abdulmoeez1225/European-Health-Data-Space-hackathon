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

  const renderCell = (cell: ReleasedCell | undefined, key: string) => {
    if (!cell) {
      return (
        <TableCell key={key} className="text-right text-muted-foreground">
          –
        </TableCell>
      );
    }
    if (cell.suppressed_by) {
      const number = notes.length + 1;
      const note = { id: `${baseId}-note-${number}`, text: capitalise(cell.suppressed_by) };
      notes.push(note);
      return (
        <TableCell key={key} className="text-right">
          <span className="inline-flex items-center gap-1 font-medium text-destructive">
            <Lock role="img" aria-label="Withheld by the release ledger" className="size-3" />
            {formatValue(cell.shown, cell.kind)}
            <a
              href={`#${note.id}`}
              aria-label={`Footnote ${number}`}
              className="rounded-sm text-[10px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              <sup>{number}</sup>
            </a>
          </span>
        </TableCell>
      );
    }
    return (
      <TableCell key={key} className="text-right tabular-nums">
        {isProtectedMarker(cell.shown) ? (
          <SmallCellBadge value={cell.shown} />
        ) : (
          formatValue(cell.shown, cell.kind)
        )}
      </TableCell>
    );
  };

  return (
    <div className="grid gap-2.5">
      <div className="overflow-hidden rounded-md border">
        <Table label={caption}>
          <caption className="sr-only">{caption}</caption>
          <TableHeader className="bg-muted/40">
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
                        className="h-auto text-[13px] font-normal text-foreground"
                      >
                        {row.labels[dimension] ?? ""}
                      </TableHead>
                    ))
                  ) : (
                    <TableHead scope="row" className="h-auto text-[13px] font-normal text-foreground">
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
      {hasSmallCells ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">&lt;10</span> and{" "}
          <span className="font-medium text-foreground">suppressed</span> hide groups of fewer than 10
          patients (small-cell rule).
        </p>
      ) : null}
      {notes.length ? (
        <ol className="grid gap-1 text-xs text-muted-foreground">
          {notes.map((note, index) => (
            <li key={note.id} id={note.id} className="flex scroll-mt-24 gap-1.5">
              <Lock aria-hidden className="mt-0.5 size-3 shrink-0 text-destructive" />
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
