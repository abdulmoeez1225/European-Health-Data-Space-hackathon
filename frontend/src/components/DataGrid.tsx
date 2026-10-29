import { formatValue, isProtectedMarker, toResultValue } from "@/lib/format";

import { ValuePill } from "./ValuePill";

type DataGridProps = { columns: string[]; rows: unknown[][]; maxRows?: number; caption?: string };

/** Generic SQL result grid for the secure environment. */
/** A column is numeric when every value is a number, NULL or a small-cell marker. */
function numericColumns(columns: string[], rows: unknown[][]): boolean[] {
  return columns.map((_, c) => {
    const values = rows.map((row) => row[c]);
    return (
      values.some((v) => typeof v === "number") &&
      values.every((v) => v === null || typeof v === "number" || isProtectedMarker(v))
    );
  });
}

export function DataGrid({ columns, rows, maxRows = 200, caption }: DataGridProps) {
  const shown = rows.slice(0, maxRows);
  const numeric = numericColumns(columns, shown);
  return (
    <div>
      <div
        tabIndex={0}
        role="region"
        aria-label={caption ?? "Result"}
        className="max-h-[480px] overflow-auto rounded-xl border border-line"
      >
        <table className="w-full min-w-max border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="sticky top-0 z-10 bg-surface-2 text-xs tracking-wide text-muted uppercase">
            <tr>
              {columns.map((column, c) => (
                <th
                  key={`${c}-${column}`}
                  scope="col"
                  className={`px-3.5 py-2 font-mono font-semibold normal-case ${numeric[c] ? "text-right" : "text-left"}`}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => (
              <tr key={r} className="border-t border-line hover:bg-surface-2/60">
                {columns.map((column, c) => {
                  const value = toResultValue(row[c]);
                  return (
                    <td
                      key={`${c}-${column}`}
                      className={numeric[c] ? "px-3.5 py-2 text-right tabular-nums" : "px-3.5 py-2"}
                    >
                      {isProtectedMarker(value) ? (
                        <ValuePill value={value} />
                      ) : value === null ? (
                        <span className="text-muted italic">NULL</span>
                      ) : (
                        formatValue(value)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > maxRows ? (
        <p className="mt-2 text-sm text-muted">
          Showing the first {maxRows} of {rows.length} rows.
        </p>
      ) : null}
    </div>
  );
}
