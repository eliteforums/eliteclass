import * as React from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { SkeletonRows } from "@/components/ui/SkeletonRows";

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------
// Generic, fully-typed table component with three built-in states:
//   1. Loading  — renders animated <SkeletonRows> placeholders
//   2. Empty    — renders the `emptyState` slot
//   3. Populated — renders data rows via caller-supplied column definitions
//
// Usage:
//   import { DataTable, type DataTableColumn } from "@/components/ui/DataTable"
// ---------------------------------------------------------------------------

// ── Column definition ────────────────────────────────────────────────────────

/**
 * Typed column descriptor consumed by `DataTable<T>`.
 *
 * @template T  The row data type — same `T` as the parent `DataTable`.
 */
export interface DataTableColumn<T> {
  /** Unique identifier — used as the React key on `<th>` and `<td>`. */
  key: string;
  /** Text rendered in the column header. Pass `""` for icon-only columns. */
  header: string;
  /** Returns the cell content for a given row. */
  render: (row: T, rowIndex: number) => ReactNode;
  /** Extra Tailwind classes merged onto the `<th>` element. */
  headerClassName?: string;
  /** Extra Tailwind classes merged onto every `<td>` in this column. */
  cellClassName?: string;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface DataTableProps<T> {
  /** Ordered list of column definitions. */
  columns: DataTableColumn<T>[];
  /** The array of row objects to render. */
  data: T[];
  /**
   * When `true` the table body is replaced with animated skeleton rows.
   * Defaults to `false`.
   */
  isLoading?: boolean;
  /**
   * How many skeleton placeholder rows to show while loading.
   * Defaults to `5`.
   */
  loadingRows?: number;
  /**
   * Rendered below the table when `data` is empty and `isLoading` is false.
   * Typically a `<EmptyState>` component.
   */
  emptyState?: ReactNode;
  /**
   * Returns a stable, unique React key for each row.
   * Usually `(row) => row.id`.
   */
  keyExtractor?: (row: T) => string;
  /**
   * Optional click handler applied to an entire row.
   * When provided the row receives `cursor-pointer` and a hover highlight.
   */
  onRowClick?: (row: T) => void;
  /** Extra Tailwind classes merged onto the root wrapper `<div>`. */
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * `DataTable` — generic, accessible table component.
 *
 * Handles loading, empty, and populated states automatically.
 * Column definitions are fully typed to `T`, giving callers autocomplete and
 * type-safety on `row` inside each `render` function.
 *
 * @example
 * ```tsx
 * const columns: DataTableColumn<Student>[] = [
 *   { key: "name", header: "Name", render: (s) => s.user?.name ?? "—" },
 *   { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
 * ];
 *
 * <DataTable
 *   columns={columns}
 *   data={students}
 *   isLoading={isLoading}
 *   keyExtractor={(s) => s.id}
 *   emptyState={<EmptyState title="No students found" />}
 * />
 * ```
 */
function DataTableInner<T>({
  columns,
  data,
  isLoading = false,
  loadingRows = 5,
  emptyState,
  keyExtractor,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const showEmpty = !isLoading && data.length === 0;
  const isClickable = typeof onRowClick === "function";

  // ── Render ───────────────────────────────────────────────────────────────────
  // Using React.useMemo for rows to prevent unnecessary re-renders of the whole table body
  const tableRows = React.useMemo(() => {
    if (isLoading) return <SkeletonRows rows={loadingRows} columns={columns.length} />;

    // Defensive: if caller didn't provide a keyExtractor, fall back to common fields
    // (id or key) and finally the row index. Also log once to aid debugging.
    return data.map((row, rowIndex) => {
      const fallbackRow = row as { id?: string | number; key?: string | number };
      const key =
        typeof keyExtractor === "function"
          ? keyExtractor(row)
          : // fallback: prefer `id`, then `key`, then index
            (fallbackRow.id ?? fallbackRow.key ?? String(rowIndex));

      return (
        <tr
          key={key}
          onClick={isClickable ? () => onRowClick!(row) : undefined}
          className={cn(
            "border-b border-border last:border-0 transition-colors",
            isClickable ? "cursor-pointer hover:bg-muted/50" : "hover:bg-muted/30",
          )}
        >
          {columns.map((col) => (
            <td
              key={col.key}
              className={cn(
                "px-3 py-2 align-middle text-xs sm:px-4 sm:py-3 sm:text-sm",
                col.cellClassName,
              )}
            >
              {col.render(row, rowIndex)}
            </td>
          ))}
        </tr>
      );
    });
  }, [data, isLoading, loadingRows, columns, keyExtractor, isClickable, onRowClick]);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="min-w-[640px] w-full text-xs sm:min-w-full sm:text-sm">
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider sm:px-4 sm:py-3 sm:text-xs",
                    "text-muted-foreground whitespace-nowrap",
                    col.headerClassName,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          {/* ── Body ───────────────────────────────────────────────────────── */}
          <tbody>{tableRows}</tbody>
        </table>
      </div>

      {/* Empty state — rendered outside <table> so it spans the full width */}
      {showEmpty && emptyState && <div className="flex justify-center">{emptyState}</div>}
    </div>
  );
}

export const DataTable = React.memo(DataTableInner) as typeof DataTableInner;
