// ---------------------------------------------------------------------------
// EduOS — useTeacherStudents (staff-scoped list + filters + pagination)
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { getTeacherStudents, invalidateTeacherStudentsCache } from "@/services/teacherStudents.service";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMountedRef } from "@/hooks/useMountedRef";
import type { TeacherStudentListItem, TeacherStudentsFilters } from "@/types";

const DEFAULT_PAGE_SIZE = 20;
const TEACHER_STUDENTS_TIMEOUT_MS = 15_000;

interface UseTeacherStudentsOptions {
  staffId: string | null;
  initialPageSize?: number;
}

export function useTeacherStudents({ staffId, initialPageSize = DEFAULT_PAGE_SIZE }: UseTeacherStudentsOptions) {
  const mounted = useMountedRef();
  const [students, setStudents] = useState<TeacherStudentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(initialPageSize);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<TeacherStudentsFilters>({
    search: "",
    batchId: null,
    status: null,
    attendanceBand: "all",
    performance: "all",
  });

  const debouncedSearch = useDebouncedValue(filters.search ?? "", 300);
  const abortRef = useRef<AbortController | null>(null);

  const fetchStudents = useCallback(
    async (targetPage = page) => {
      if (!staffId) {
        setStudents([]);
        setIsLoading(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const result = await Promise.race([
          getTeacherStudents(
            staffId,
            { ...filters, search: debouncedSearch },
            targetPage,
            pageSize,
          ),
          new Promise<never>((_, reject) => {
            const timeoutId = setTimeout(() => {
              clearTimeout(timeoutId);
              reject(new Error("Loading students timed out."));
            }, TEACHER_STUDENTS_TIMEOUT_MS);
          }),
        ]);

        if (!mounted.current || controller.signal.aborted) return;

        if (!result.success || !result.data) {
          setError(result.error ?? "Failed to load students.");
          setStudents([]);
          return;
        }

        setStudents(result.data.items);
        setTotal(result.data.meta.total);
        setTotalPages(result.data.meta.total_pages);
      } catch (err) {
        if (!mounted.current || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load students.");
        setStudents([]);
      } finally {
        if (mounted.current && !controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [staffId, filters, debouncedSearch, page, pageSize, mounted],
  );

  useEffect(() => {
    void fetchStudents(page);
    return () => abortRef.current?.abort();
  }, [fetchStudents, page]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters.batchId, filters.status, filters.attendanceBand, filters.performance]);

  const refresh = useCallback(() => {
    if (staffId) invalidateTeacherStudentsCache(staffId);
    void fetchStudents(page);
  }, [staffId, fetchStudents, page]);

  return {
    students,
    isLoading,
    error,
    filters,
    setFilters,
    page,
    setPage,
    pageSize,
    total,
    totalPages,
    refresh,
  };
}
