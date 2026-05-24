// ---------------------------------------------------------------------------
// EduOS — LMS Progress Hooks
//
// React Query v5 hooks for tracking lesson and course progress.
// Provides:
//   - useLessonProgress     — single lesson progress (or null if not started)
//   - useCourseProgress     — aggregate course progress for an enrollment
//   - useAllLessonProgress  — full progress map (lesson_id → progress) for the player
//   - useUpdateProgress     — mutation with optimistic Zustand update
//   - useStudentStats       — learning statistics dashboard
// ---------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import {
  getCourseProgressView,
  getCourseProgress,
  getLessonProgress,
  getSingleLessonProgress,
  getAllLessonProgress,
  upsertLessonProgress,
  getStudentLearningStats,
  type UpsertLessonProgressPayload,
} from "@/modules/courses/services/progress.service";
import type { ApiResponse, LmsLessonProgress, LmsCourseProgress } from "@/types";

// ── Query key factory ─────────────────────────────────────────────────────────

export const progressKeys = {
  /** Per-enrollment, per-lesson progress */
  lesson: (enrollmentId: string, lessonId: string) =>
    ["lms", "progress", "lesson", enrollmentId, lessonId] as const,
  /** All lesson progress rows for an enrollment (keyed map) */
  allLessons: (enrollmentId: string, courseId: string) =>
    ["lms", "progress", "lessons", enrollmentId, courseId] as const,
  /** Aggregate course progress for an enrollment */
  course: (enrollmentId: string) => ["lms", "progress", "course", enrollmentId] as const,
  /** Student learning statistics */
  stats: (studentId: string) => ["lms", "stats", studentId] as const,
};

// ── useLessonProgress ─────────────────────────────────────────────────────────

/**
 * Fetches progress for a single lesson within an enrollment.
 * Returns null (not an error) when the student hasn't started the lesson yet.
 *
 * Use `useAllLessonProgress` in the course player for O(1) lookups across
 * all lessons — only use this hook when you need a single lesson's progress
 * outside of the player context.
 */
export function useLessonProgress(enrollmentId: string, lessonId: string) {
  return useQuery<LmsLessonProgress | null>({
    queryKey: progressKeys.lesson(enrollmentId, lessonId),
    queryFn: async () => {
      const res = await getSingleLessonProgress(enrollmentId, lessonId);
      if (!res.success) throw new Error(res.error ?? "Failed to load lesson progress");
      return res.data;
    },
    enabled: !!enrollmentId && !!lessonId,
    staleTime: 15_000,
  });
}

// ── useCourseProgress ─────────────────────────────────────────────────────────

/**
 * Fetches the aggregate course progress for a given enrollment.
 * Returns null (not an error) for brand-new enrollments with no activity.
 */
export function useCourseProgress(enrollmentId: string) {
  return useQuery<LmsCourseProgress | null>({
    queryKey: progressKeys.course(enrollmentId),
    queryFn: async () => {
      const res = await getCourseProgress(enrollmentId);
      // A missing progress row is expected for new enrollments — return null.
      if (!res.success) return null;
      return res.data;
    },
    enabled: !!enrollmentId,
    staleTime: 30_000,
  });
}

// ── useAllLessonProgress ──────────────────────────────────────────────────────

/**
 * Fetches all lesson progress rows for an enrollment and returns them as a
 * map keyed by lesson_id for O(1) lookups in the player sidebar.
 */
export function useAllLessonProgress(enrollmentId: string, courseId: string) {
  return useQuery<Record<string, LmsLessonProgress>>({
    queryKey: progressKeys.allLessons(enrollmentId, courseId),
    queryFn: async () => {
      const res = await getLessonProgress(enrollmentId, courseId);
      if (!res.success) throw new Error(res.error ?? "Failed to load lesson progress");

      const map: Record<string, LmsLessonProgress> = {};
      for (const p of res.data ?? []) {
        map[p.lesson_id] = p;
      }
      return map;
    },
    enabled: !!enrollmentId && !!courseId,
    staleTime: 10_000,
  });
}

// ── useUpdateProgress ─────────────────────────────────────────────────────────

/**
 * Mutation that upserts lesson progress and invalidates the related queries
 * on success so the sidebar and progress rings re-render automatically.
 *
 * The course player also updates the Zustand store optimistically before
 * calling this mutation so the UI responds instantly without a loading state.
 */
export function useUpdateProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpsertLessonProgressPayload) => upsertLessonProgress(payload),

    onSuccess: (result: ApiResponse<LmsLessonProgress>, variables: UpsertLessonProgressPayload) => {
      if (result.success) {
        void queryClient.invalidateQueries({
          queryKey: progressKeys.allLessons(variables.enrollment_id, variables.course_id),
        });
        void queryClient.invalidateQueries({
          queryKey: progressKeys.lesson(variables.enrollment_id, variables.lesson_id),
        });
        void queryClient.invalidateQueries({
          queryKey: progressKeys.course(variables.enrollment_id),
        });
      }
    },
  });
}

// ── useStudentStats ───────────────────────────────────────────────────────────

/**
 * Returns aggregate learning statistics for a student across all their courses.
 *
 * Stat fields:
 * - `total_enrolled`     — active + completed enrollments
 * - `total_completed`    — enrollments where status = 'completed'
 * - `total_in_progress`  — active enrollments with at least 1 lesson started
 * - `avg_completion_pct` — average completion % across all enrolled courses
 * - `total_watch_hours`  — total video watch time in hours (2 decimal places)
 */
export function useStudentStats(studentId: string | null) {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useQuery({
    queryKey: progressKeys.stats(studentId ?? ""),
    queryFn: async () => {
      const res = await getStudentLearningStats(studentId!, instituteId);
      if (!res.success || !res.data) {
        throw new Error(res.error ?? "Failed to load learning stats");
      }
      return res.data;
    },
    enabled: !!studentId && !!instituteId,
    staleTime: 60_000, // Stats update slowly — 1 min is fine
  });
}

// ── Re-export service types so consumers import from one place ────────────────
export type { UpsertLessonProgressPayload };
// getCourseProgressView is still available for legacy use in $courseId.tsx
export { getCourseProgressView };
