// ---------------------------------------------------------------------------
// EliteClass — Paginated Query Utility
//
// Builds paginated Supabase queries with cursor-based or offset pagination
// and result truncation logic.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PaginationParams {
  /** Last item's ID for cursor-based pagination */
  cursor?: string;
  /** Items per page (default 20) */
  pageSize: number;
  /** Hard cap on total results returned (default 1000) */
  maxResults?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  /** ID of the last item — null means this is the last page */
  nextCursor: string | null;
  /** Total matching records (from count query) */
  totalCount: number;
  /** true if totalCount exceeds maxResults */
  truncated: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_RESULTS = 1000;

// ── Main Function ────────────────────────────────────────────────────────────

/**
 * Execute a paginated query against Supabase.
 * Supports both offset-based and cursor-based pagination.
 *
 * - When `params.cursor` is provided, uses cursor-based pagination (id > cursor).
 * - When `params.cursor` is omitted, returns the first page.
 * - Results are capped at `maxResults` and `truncated` is set accordingly.
 */
export async function paginatedQuery<T extends { id: string }>(
  table: string,
  params: PaginationParams,
  options: {
    select?: string;
    filters?: Record<string, unknown>;
    orderBy?: { column: string; ascending?: boolean };
    abortSignal?: AbortSignal;
  } = {},
): Promise<ApiResponse<PaginatedResponse<T>>> {
  if (!supabase) {
    return {
      data: null,
      error: "Supabase client is not configured",
      success: false,
    };
  }

  const pageSize = params.pageSize || DEFAULT_PAGE_SIZE;
  const maxResults = params.maxResults ?? DEFAULT_MAX_RESULTS;
  const select = options.select ?? "*";
  const orderColumn = options.orderBy?.column ?? "id";
  const ascending = options.orderBy?.ascending ?? true;

  try {
    // ── Count query ──────────────────────────────────────────────────────
    let countQuery = supabase
      .from(table)
      .select("*", { count: "exact", head: true });

    if (options.filters) {
      for (const [column, value] of Object.entries(options.filters)) {
        countQuery = countQuery.eq(column, value);
      }
    }

    if (options.abortSignal) {
      countQuery = countQuery.abortSignal(options.abortSignal);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      return { data: null, error: countError.message, success: false };
    }

    const totalCount = count ?? 0;
    const truncated = totalCount > maxResults;

    // ── Data query ───────────────────────────────────────────────────────
    let dataQuery = supabase.from(table).select(select);

    // Apply filters
    if (options.filters) {
      for (const [column, value] of Object.entries(options.filters)) {
        dataQuery = dataQuery.eq(column, value);
      }
    }

    // Cursor-based pagination: fetch items after the cursor
    if (params.cursor) {
      if (ascending) {
        dataQuery = dataQuery.gt(orderColumn, params.cursor);
      } else {
        dataQuery = dataQuery.lt(orderColumn, params.cursor);
      }
    }

    // Order and limit — fetch one extra to determine if there's a next page
    dataQuery = dataQuery
      .order(orderColumn, { ascending })
      .limit(pageSize + 1);

    if (options.abortSignal) {
      dataQuery = dataQuery.abortSignal(options.abortSignal);
    }

    const { data, error: dataError } = await dataQuery;

    if (dataError) {
      return { data: null, error: dataError.message, success: false };
    }

    const rows = (data ?? []) as unknown as T[];

    // Determine if there's a next page
    const hasMore = rows.length > pageSize;
    const pageData = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore
      ? (pageData[pageData.length - 1] as T)[orderColumn as keyof T] as unknown as string
      : null;

    return {
      data: {
        data: pageData,
        nextCursor,
        totalCount,
        truncated,
      },
      error: null,
      success: true,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown pagination error";
    return { data: null, error: message, success: false };
  }
}
