import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

// ── Column definition ────────────────────────────────────────────────────────

/**
 * Column descriptor for `VirtualDataTable<T>`.
 */
export interface ColumnDef<T> {
  /** Unique column identifier — used as the React key. */
  key: string;
  /** Text rendered in the column header. */
  header: string;
  /** CSS width value (e.g., "200px", "30%"). */
  width?: string;
  /** Custom cell renderer. Falls back to `row[key]` if not provided. */
  render?: (row: T, index: number) => React.ReactNode;
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface VirtualDataTableProps<T> {
  /** The array of row data to render. */
  data: T[];
  /** Ordered list of column definitions. */
  columns: ColumnDef<T>[];
  /** Fixed height of each row in pixels. */
  rowHeight: number;
  /** Number of rows to render outside the visible area (default: 5). */
  overscan?: number;
  /** Called when the user scrolls near the end of the list. */
  onLoadMore?: () => void;
  /** Whether more data is available to load. */
  hasNextPage?: boolean;
  /** Whether a load-more request is currently in progress. */
  isLoading?: boolean;
  /** Extra Tailwind classes merged onto the root wrapper. */
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * `VirtualDataTable` — virtualized table for large datasets.
 *
 * Only renders visible rows + an overscan buffer, enabling smooth scrolling
 * through thousands of rows without DOM bloat. Supports infinite scroll via
 * `onLoadMore` / `hasNextPage`.
 *
 * @example
 * ```tsx
 * <VirtualDataTable
 *   data={students}
 *   columns={[
 *     { key: "name", header: "Name", render: (s) => s.user?.name },
 *     { key: "admission", header: "Admission No", render: (s) => s.admission_no },
 *     { key: "status", header: "Status", render: (s) => <Badge>{s.status}</Badge> },
 *   ]}
 *   rowHeight={48}
 *   onLoadMore={fetchNextPage}
 *   hasNextPage={hasNextPage}
 *   isLoading={isFetchingNextPage}
 * />
 * ```
 */
function VirtualDataTableInner<T>({
  data,
  columns,
  rowHeight,
  overscan = 5,
  onLoadMore,
  hasNextPage = false,
  isLoading = false,
  className,
}: VirtualDataTableProps<T>) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // ── Infinite scroll trigger ────────────────────────────────────────────────
  React.useEffect(() => {
    if (!onLoadMore || !hasNextPage || isLoading) return;

    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;

    // Trigger when the last visible virtual item is within 5 rows of the end
    if (lastItem.index >= data.length - 5) {
      onLoadMore();
    }
  }, [virtualItems, data.length, onLoadMore, hasNextPage, isLoading]);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-muted/40">
        <div className="flex">
          {columns.map((col) => (
            <div
              key={col.key}
              className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider sm:px-4 sm:py-3 sm:text-xs text-muted-foreground whitespace-nowrap"
              style={{ width: col.width, flex: col.width ? "none" : "1" }}
            >
              {col.header}
            </div>
          ))}
        </div>
      </div>

      {/* ── Virtualized body ───────────────────────────────────────────────── */}
      <div
        ref={parentRef}
        className="overflow-auto overscroll-y-contain"
        style={{ maxHeight: "600px" }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualRow) => {
            const row = data[virtualRow.index];
            return (
              <div
                key={virtualRow.index}
                className="flex items-center border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className="px-3 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm truncate"
                    style={{ width: col.width, flex: col.width ? "none" : "1" }}
                  >
                    {col.render
                      ? col.render(row, virtualRow.index)
                      : (row as Record<string, unknown>)[col.key] as React.ReactNode}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* ── Loading indicator ──────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            <svg
              className="mr-2 h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Loading more…
          </div>
        )}
      </div>
    </div>
  );
}

export const VirtualDataTable = React.memo(VirtualDataTableInner) as typeof VirtualDataTableInner;
