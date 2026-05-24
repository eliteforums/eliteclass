// ---------------------------------------------------------------------------
// EduOS — useStudentProfile
//
// Fetches a single student profile and their linked parents in parallel.
// Designed for the StudentProfileSheet and any detail page that needs
// both the student record and parent relationship data simultaneously.
//
// Usage:
//   import { useStudentProfile } from "@/modules/students/hooks/useStudentProfile"
//   const { student, parents, isLoading, error, refetch } = useStudentProfile(studentId)
// ---------------------------------------------------------------------------

import { useState, useCallback, useEffect } from "react";
import { getStudentById } from "@/services/student.service";
import { getParentsForStudent } from "@/services/parent.service";
import type { Student, StudentParent } from "@/types";

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * `useStudentProfile` — fetches a student + their linked parents in one shot.
 *
 * Both requests fire in parallel via `Promise.all` to minimise latency.
 * If the student fetch fails, `error` is set and `parents` is left as `[]`.
 * If the parents fetch fails (non-fatal), the student is still returned and
 * the parents array is empty — a warning is logged to the console.
 *
 * Pass `null` for `studentId` to skip fetching entirely (sheet is closed).
 *
 * @param studentId  The `students.id` PK to fetch, or `null` to idle.
 */
export function useStudentProfile(studentId: string | null) {
  const [student, setStudent] = useState<Student | null>(null);
  const [parents, setParents] = useState<StudentParent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    // Nothing to fetch when no ID is provided (e.g. sheet is closed).
    if (!studentId) {
      setStudent(null);
      setParents([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fire both requests in parallel — the student profile and the parent
      // link list are independent and neither depends on the other.
      const [studentResult, parentsResult] = await Promise.all([
        getStudentById(studentId),
        getParentsForStudent(studentId),
      ]);

      // Student is required — fail loudly if it's missing.
      if (!studentResult.success || !studentResult.data) {
        setError(studentResult.error ?? "Failed to load student profile.");
        setStudent(null);
        setParents([]);
        return;
      }

      setStudent(studentResult.data);

      // Parents are a soft dependency — show empty list on failure rather than
      // blocking the entire sheet from rendering.
      if (parentsResult.success && parentsResult.data) {
        setParents(parentsResult.data);
      } else {
        console.warn("[useStudentProfile] Failed to load parents:", parentsResult.error);
        setParents([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  // Re-fetch whenever the studentId changes (including from null → id when
  // the sheet opens, and from id → null when it closes).
  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    /** The fetched student record (includes joined `user`). `null` while loading or on error. */
    student,
    /**
     * All parent links for this student.
     * Each entry is a `StudentParent` row that includes `relation_type` and
     * the nested `parent` profile (with their `user`).
     */
    parents,
    /** `true` while either network request is in flight. */
    isLoading,
    /** Non-null when the student fetch failed. Parents errors are non-fatal and logged only. */
    error,
    /** Manually re-fetches both the student and parents. Call after linking/unlinking a parent. */
    refetch,
  };
}
