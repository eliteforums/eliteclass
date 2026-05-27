// ---------------------------------------------------------------------------
// EliteClass — useInfiniteStudents
//
// TanStack Query `useInfiniteQuery` hook for progressive loading of student
// records. Designed for the admin student list which can have 50k+ rows.
//
// Uses `searchStudents` service which already supports page/pageSize params
// and returns `PaginatedResponse<Student>` with meta (page, totalPages, total).
// ---------------------------------------------------------------------------

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { searchStudents } from "@/services/student.service";
import type { Student, StudentFilters } from "@/types";

export interface UseInfiniteStudentsOptions {
  /** Institute to scope all queries to. Pass `null` to defer until auth loads. */
  instituteId: string | null;
  /** Current filter state (search, status, batchId). */
  filters: StudentFilters;
  /** Number of students per page (default: 50). */
  pageSize?: number;
  /** Whether the hook is enabled (set to false while auth is loading). */
  enabled?: boolean;
}

const PAGE_SIZE_DEFAULT = 50;

export function useInfiniteStudents({
  instituteId,
  filters,
  pageSize = PAGE_SIZE_DEFAULT,
  enabled = true,
}: UseInfiniteStudentsOptions) {
  const queryResult = useInfiniteQuery({
    queryKey: ["students", "infinite", instituteId, filters, pageSize],
    queryFn: async ({ pageParam = 1 }) => {
      const result = await searchStudents(
        instituteId!,
        filters,
        pageParam,
        pageSize,
      );

      if (!result.success || !result.data) {
        throw new Error(result.error ?? "Failed to load students");
      }

      return result.data;
    },
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.meta;
      return page < totalPages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: enabled && !!instituteId,
    staleTime: 30_000, // 30s before refetch
  });

  // Flatten all pages into a single student array
  const allStudents = useMemo(
    () => queryResult.data?.pages.flatMap((p) => p.items) ?? [],
    [queryResult.data],
  );

  // Total count from the latest page meta
  const total = queryResult.data?.pages[queryResult.data.pages.length - 1]?.meta.total ?? 0;

  return {
    students: allStudents,
    total,
    isLoading: queryResult.isLoading,
    isFetchingNextPage: queryResult.isFetchingNextPage,
    error: queryResult.error?.message ?? null,
    hasNextPage: queryResult.hasNextPage ?? false,
    fetchNextPage: queryResult.fetchNextPage,
    refetch: queryResult.refetch,
  };
}
