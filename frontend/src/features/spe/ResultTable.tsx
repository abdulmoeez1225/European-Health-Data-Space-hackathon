import { SmallCellBadge } from "@/components/SmallCellBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { formatValue, humanise, isProtectedMarker, toResultValue } from "@/lib/format";

export const MAX_ROWS = 200;

/** A column is numeric when it holds numbers and otherwise only NULL or small-cell markers. */
function numericColumns(columns: string[], rows: unknown[][]): boolean[] {
  return columns.map((_, c) => {
    const values = rows.map((row) => row[c]);
    return (
      values.some((v) => typeof v === "number") &&
      values.every((v) => v === null || typeof v === "number" || isProtectedMarker(v))
    );
  });
}

type ResultTableProps = {
  columns: string[];
  rows: unknown[][];
  caption: string;
  /** Header text; readable names by default, raw names (in mono) for hand-written SQL. */
  columnLabel?: (column: string) => string;
  rawHeaders?: boolean;
  className?: string;
};

export function ResultTable({
  columns,
  rows,
  caption,
  columnLabel = humanise,
  rawHeaders = false,
  className,
}: ResultTableProps) {
  const t = useT().spe;
  const shown = rows.slice(0, MAX_ROWS);
  const numeric = numericColumns(columns, shown);
  return (
    <div className="grid gap-2">
      <Table
        label={caption}
        containerClassName={cn("max-h-[480px] overflow-auto rounded-lg border bg-card", className)}
      >
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)] [&_tr]:border-b-0">
          <TableRow className="hover:bg-transparent">
            {columns.map((column, c) => (
              <TableHead
                key={`${c}-${column}`}
                scope="col"
                className={cn("h-9", rawHeaders && "font-mono", numeric[c] && "text-right")}
              >
                {rawHeaders ? column : columnLabel(column)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={Math.max(columns.length, 1)}
                className="py-8 text-center text-muted-foreground"
              >
                {t.noRows}
              </TableCell>
            </TableRow>
          ) : (
            shown.map((row, r) => (
              <TableRow key={r}>
                {columns.map((column, c) => {
                  const value = toResultValue(row[c]);
                  return (
                    <TableCell
                      key={`${c}-${column}`}
                      className={cn("whitespace-nowrap", numeric[c] && "text-right tabular-nums")}
                    >
                      {isProtectedMarker(value) ? (
                        <SmallCellBadge value={value} />
                      ) : value === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        formatValue(value)
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {rows.length > MAX_ROWS ? (
        <p className="text-xs text-muted-foreground">
          {t.showingFirst(formatValue(MAX_ROWS), formatValue(rows.length))}
        </p>
      ) : null}
    </div>
  );
}
