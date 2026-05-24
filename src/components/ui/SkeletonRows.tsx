import * as React from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// SkeletonRows
// ---------------------------------------------------------------------------
// Renders `rows` × `columns` animated skeleton cells inside <tr>/<td> markup
// so it can be dropped directly into a <tbody> during loading states.
// Cell widths vary per column index to mimic realistic table data.
// ---------------------------------------------------------------------------

interface SkeletonRowsProps {
  /** Number of skeleton rows to render. Defaults to 5. */
  rows?: number;
  /** Number of columns per row. Defaults to 4. */
  columns?: number;
  /** Additional Tailwind classes merged on each <tr>. */
  rowClassName?: string;
}

/**
 * Per-column width cycle — gives each column a different skeleton width so the
 * loading state looks more like real data rather than a grid of identical bars.
 */
const COLUMN_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-1/3", "w-4/5", "w-1/2"] as const;

/**
 * `SkeletonRows` — animated table-row placeholder for loading states.
 *
 * Drop this straight into a `<tbody>` while data is being fetched:
 *
 * @example
 * ```tsx
 * <tbody>
 *   {isLoading ? <SkeletonRows rows={6} columns={5} /> : <DataRows />}
 * </tbody>
 * ```
 */
export function SkeletonRows({ rows = 5, columns = 4, rowClassName }: SkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIdx) => (
        <tr
          key={rowIdx}
          className={cn("border-b border-border last:border-0", rowClassName)}
          aria-hidden="true"
        >
          {Array.from({ length: columns }, (_, colIdx) => {
            const widthClass = COLUMN_WIDTHS[colIdx % COLUMN_WIDTHS.length];
            return (
              <td key={colIdx} className="px-4 py-3 align-middle">
                <div
                  className={cn(
                    "h-4 rounded-md bg-muted animate-pulse",
                    widthClass,
                    // Stagger opacity by row so rows don't all pulse identically
                    rowIdx % 2 === 0 ? "opacity-80" : "opacity-60",
                  )}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
