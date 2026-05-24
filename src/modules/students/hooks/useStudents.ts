// ---------------------------------------------------------------------------
// EduOS — useStudents
//
// Local-state hook for the student management list page.
//
// ROOT CAUSE FIXES applied in this hook:
//
//  1. AUTH RACE GUARD — The hook now reads `authStore.isLoading` and skips
//     all fetches while auth is still hydrating.  Previously, `instituteId`
//     could briefly be null (SSR → client rehydration window), causing the
//     fetch to be skipped on mount.  Auth guard ensures exactly one fetch
//     fires after both auth AND institute_id are confirmed.
//
//  2. TIMEOUT SAFETY — A 15-second ceiling ensures `isLoading` is ALWAYS
//     set to false, even if the Supabase promise stalls indefinitely.
//     A stalled promise can happen when RLS evaluation is slow or when the
//     PostgREST response never arrives due to a network issue.
//
//  3. LOADING INITIAL STATE — Changed from `false` to `true` when
//     `instituteId` is already available on mount (e.g. from persisted store).
//     This prevents a flash of empty state before the first fetch completes.
// ---------------------------------------------------------------------------

import { useState, useCallback, useEffect, useRef } from "react";
import { searchStudents, updateStudent } from "@/services/student.service";
import { useAuthStore } from "@/store/authStore";
import { isAbortError } from "@/utils/helpers";
import type { Student, StudentStatus, StudentFilters, PaginationMeta } from "@/types";

export interface UseStudentsOptions {
  /** Institute to scope all queries to. Pass `null` to defer until auth loads. */
  instituteId: string | null;
  /** Whether to fetch automatically on mount. Defaults to `true`. */
  autoFetch?: boolean;
}

export type { StudentFilters };

/** How long (ms) to wait for a Supabase response before forcibly stopping the spinner. */
const FETCH_TIMEOUT_MS = 15_000;

export function useStudents({ instituteId, autoFetch = true }: UseStudentsOptions) {
  // Read auth loading state so we never query before the session is ready.
  const authIsLoading = useAuthStore((s) => s.isLoading);

  // ── Core state ─────────────────────────────────────────────────────────────
  const [students, setStudents] = useState<Student[]>([]);
  // Start in loading state when we already have an instituteId, to avoid
  // flashing an empty table before the first fetch completes.
  const [isLoading, setIsLoading] = useState(() => !!instituteId && !authIsLoading);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });

  const [filters, setFiltersState] = useState<StudentFilters>({});
  const filtersRef = useRef<StudentFilters>({});

  // Debounce search requests to avoid hammering Supabase on every keystroke.
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Abort controller ref — cancelled when component unmounts or instituteId changes.
  const abortRef = useRef<AbortController | null>(null);
  // Safety timeout ref — forces loading off if the query stalls.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setFilters = useCallback((next: StudentFilters) => {
    filtersRef.current = next;
    setFiltersState(next);
  }, []);

  // ── Clear safety timers ────────────────────────────────────────────────────
  const clearTimers = useCallback((reason: string = "Request cancelled") => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort(reason);
      abortRef.current = null;
    }
  }, []);

  // ── Core fetch ─────────────────────────────────────────────────────────────
  const fetchStudents = useCallback(
    async (page: number = 1) => {
      // Guard 1: never query without a valid institute scope
      if (!instituteId) {
        setIsLoading(false);
        return;
      }

      // Guard 2: never query while auth is still rehydrating
      if (authIsLoading) {
        return;
      }

      // Cancel any in-flight request before starting a new one
      clearTimers();

      setIsLoading(true);
      setError(null);

      // Safety timeout: force loading off after FETCH_TIMEOUT_MS
      // Prevents the page from being stuck in a permanent spinner if the
      // Supabase promise stalls due to a slow RLS evaluation or network issue.
      timeoutRef.current = setTimeout(() => {
        console.warn(
          `[useStudents] Fetch timeout after ${FETCH_TIMEOUT_MS}ms for institute ${instituteId}`,
        );
        setIsLoading(false);
        setError("Request timed out. Please check your connection and try again.");
      }, FETCH_TIMEOUT_MS);

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const result = await searchStudents(
          instituteId,
          filtersRef.current,
          page,
          20,
          controller.signal,
        );

        // Clear the timeout since the request completed normally
        clearTimers();

        if (result.success && result.data) {
          setStudents(result.data.items);
          setPagination(result.data.meta);
          setCurrentPage(result.data.meta.page);
        } else {
          if (result.error === "Aborted") return;

          console.error("[useStudents] searchStudents failed:", result.error);
          setError(result.error ?? "Failed to load students. Please try again.");
          setStudents([]);
        }
      } catch (err) {
        clearTimers("Error caught in useStudents");
        if (isAbortError(err)) return;

        const message = err instanceof Error ? err.message : "Unexpected error loading students";
        console.error("[useStudents] unexpected error:", message);
        setError(message);
        setStudents([]);
      } finally {
        // This runs even if the timeout already fired — the double-call to
        // setIsLoading(false) is harmless (idempotent state update).
        clearTimers();
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instituteId, authIsLoading, clearTimers],
  );

  // ── Auto-fetch — wait for BOTH auth and instituteId to be ready ────────────
  useEffect(() => {
    if (autoFetch && instituteId && !authIsLoading) {
      fetchStudents(1);
    } else if (!instituteId && !authIsLoading) {
      // Auth finished but there's genuinely no institute — stop spinning
      setIsLoading(false);
    }
  }, [autoFetch, instituteId, authIsLoading, fetchStudents]);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), [clearTimers]);

  // ── Filter setters ─────────────────────────────────────────────────────────
  const setSearch = useCallback(
    (query: string) => {
      setFilters({ ...filtersRef.current, search: query || undefined });

      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }

      searchDebounceRef.current = setTimeout(() => {
        fetchStudents(1);
      }, 250);
    },
    [fetchStudents, setFilters],
  );

  const setStatusFilter = useCallback(
    (status: StudentStatus | undefined) => {
      setFilters({ ...filtersRef.current, status });
      fetchStudents(1);
    },
    [fetchStudents, setFilters],
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const archiveStudent = useCallback(
    async (id: string): Promise<{ error: string | null }> => {
      setStudents((prev) => prev.filter((s) => s.id !== id));
      const result = await updateStudent(id, { status: "inactive" });
      if (!result.success) {
        fetchStudents(currentPage);
        return { error: result.error ?? "Failed to archive student." };
      }
      return { error: null };
    },
    [currentPage, fetchStudents],
  );

  const restoreStudent = useCallback(async (id: string): Promise<{ error: string | null }> => {
    const result = await updateStudent(id, { status: "active" });
    if (result.success) {
      setStudents((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "active" as StudentStatus } : s)),
      );
      return { error: null };
    }
    return { error: result.error ?? "Failed to restore student." };
  }, []);

  const refresh = useCallback(() => fetchStudents(currentPage), [fetchStudents, currentPage]);

  // ── Return ─────────────────────────────────────────────────────────────────
  return {
    students,
    isLoading,
    error,
    pagination,
    filters,
    setSearch,
    setStatusFilter,
    archiveStudent,
    restoreStudent,
    refresh,
    fetchStudents,
  };
}
