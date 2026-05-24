// ---------------------------------------------------------------------------
// EduOS — Course Store (Zustand v5)
//
// LMS module-wide state: course catalogue, curriculum editor, categories,
// enrollments, and per-lesson progress for the course player.
//
// Two logical sections:
//   1. Admin / Staff  — course list, curriculum, loading + error state
//   2. Student        — enrollments, active enrollment, progress map
//
// The `lessonProgressMap` (keyed by lesson_id) is the single source of truth
// for optimistic progress updates inside the CoursePlayer. It is populated
// from React Query on page load and cleared when the player is unmounted.
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  LmsCourse,
  LmsCategory,
  LmsCourseWithCurriculum,
  LmsEnrollment,
  LmsEnrollmentWithProgress,
  LmsLessonProgress,
} from "@/types";

// ── State interface ───────────────────────────────────────────────────────────

interface CourseState {
  // ── Admin / Staff ────────────────────────────────────────────────────────
  /** Paginated list of courses currently displayed in the management table */
  courses: LmsCourse[];
  /** Total course count from the last paginated fetch (for page count) */
  totalCourses: number;
  /** Course currently open in the detail panel / edit wizard */
  selectedCourse: LmsCourse | null;
  /** Full curriculum (course + modules + lessons) loaded in the editor */
  curriculum: LmsCourseWithCurriculum | null;
  /** Institute-scoped category list (rarely changes — long stale time in RQ) */
  categories: LmsCategory[];
  /** Global loading flag for operations not tracked by React Query */
  isLoading: boolean;
  /** Last error message (null when no error) */
  error: string | null;

  // ── Student ──────────────────────────────────────────────────────────────
  /** All enrollments for the current student (My Learning page) */
  enrollments: LmsEnrollmentWithProgress[];
  /** Enrollment currently open in the course player */
  activeEnrollment: LmsEnrollment | null;
  /**
   * Progress records keyed by lesson_id.
   * Populated from React Query on player mount; updated optimistically on
   * every video-progress event or lesson completion.
   */
  lessonProgressMap: Record<string, LmsLessonProgress>;

  // ── Actions: Admin / Staff ───────────────────────────────────────────────
  setCourses: (courses: LmsCourse[], total: number) => void;
  setSelectedCourse: (course: LmsCourse | null) => void;
  setCurriculum: (c: LmsCourseWithCurriculum | null) => void;
  setCategories: (cats: LmsCategory[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  /** Replace a single course in the list in-place (after an update mutation) */
  updateCourseInList: (course: LmsCourse) => void;
  /** Remove a course from the list (after a delete mutation) */
  removeCourseFromList: (courseId: string) => void;

  // ── Actions: Student ─────────────────────────────────────────────────────
  setEnrollments: (enrollments: LmsEnrollmentWithProgress[]) => void;
  setActiveEnrollment: (enrollment: LmsEnrollment | null) => void;
  /** Replace the entire progress map (called after the initial RQ fetch) */
  setProgressMap: (map: Record<string, LmsLessonProgress>) => void;
  /** Upsert a single lesson's progress record (called after a DB write) */
  setLessonProgress: (lessonId: string, progress: LmsLessonProgress) => void;
  /**
   * Merge a partial update into an existing progress record.
   * Used for optimistic video-position updates so the sidebar ring re-renders
   * immediately without waiting for a server round-trip.
   */
  updateLessonProgress: (lessonId: string, partial: Partial<LmsLessonProgress>) => void;
  /** Clear the progress map — called when the player unmounts */
  clearProgress: () => void;

  // ── Reset ────────────────────────────────────────────────────────────────
  /** Wipe all state back to initial values (e.g. on logout) */
  reset: () => void;
}

// ── Initial state snapshot ────────────────────────────────────────────────────
// Extracted so `reset` can restore it cleanly without duplicating defaults.

const initialState = {
  // Admin / Staff
  courses: [] as LmsCourse[],
  totalCourses: 0,
  selectedCourse: null as LmsCourse | null,
  curriculum: null as LmsCourseWithCurriculum | null,
  categories: [] as LmsCategory[],
  isLoading: false,
  error: null as string | null,
  // Student
  enrollments: [] as LmsEnrollmentWithProgress[],
  activeEnrollment: null as LmsEnrollment | null,
  lessonProgressMap: {} as Record<string, LmsLessonProgress>,
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCourseStore = create<CourseState>()(
  devtools(
    (set) => ({
      ...initialState,

      // ── Admin / Staff actions ──────────────────────────────────────────

      setCourses: (courses, total) =>
        set({ courses, totalCourses: total }, false, "course/setCourses"),

      setSelectedCourse: (course) =>
        set({ selectedCourse: course }, false, "course/setSelectedCourse"),

      setCurriculum: (curriculum) => set({ curriculum }, false, "course/setCurriculum"),

      setCategories: (categories) => set({ categories }, false, "course/setCategories"),

      setLoading: (isLoading) => set({ isLoading }, false, "course/setLoading"),

      setError: (error) => set({ error }, false, "course/setError"),

      updateCourseInList: (course) =>
        set(
          (state) => ({
            courses: state.courses.map((c) => (c.id === course.id ? course : c)),
            // Also update selectedCourse if it's the same one
            selectedCourse: state.selectedCourse?.id === course.id ? course : state.selectedCourse,
          }),
          false,
          "course/updateCourseInList",
        ),

      removeCourseFromList: (courseId) =>
        set(
          (state) => ({
            courses: state.courses.filter((c) => c.id !== courseId),
            totalCourses: Math.max(0, state.totalCourses - 1),
            selectedCourse: state.selectedCourse?.id === courseId ? null : state.selectedCourse,
          }),
          false,
          "course/removeCourseFromList",
        ),

      // ── Student actions ────────────────────────────────────────────────

      setEnrollments: (enrollments) => set({ enrollments }, false, "course/setEnrollments"),

      setActiveEnrollment: (enrollment) =>
        set({ activeEnrollment: enrollment }, false, "course/setActiveEnrollment"),

      setProgressMap: (map) => set({ lessonProgressMap: map }, false, "course/setProgressMap"),

      setLessonProgress: (lessonId, progress) =>
        set(
          (state) => ({
            lessonProgressMap: {
              ...state.lessonProgressMap,
              [lessonId]: progress,
            },
          }),
          false,
          "course/setLessonProgress",
        ),

      updateLessonProgress: (lessonId, partial) =>
        set(
          (state) => {
            const existing = state.lessonProgressMap[lessonId];
            if (!existing) return state;
            return {
              lessonProgressMap: {
                ...state.lessonProgressMap,
                [lessonId]: { ...existing, ...partial },
              },
            };
          },
          false,
          "course/updateLessonProgress",
        ),

      clearProgress: () => set({ lessonProgressMap: {} }, false, "course/clearProgress"),

      // ── Reset ──────────────────────────────────────────────────────────

      reset: () => set(initialState, false, "course/reset"),
    }),
    { name: "EduOS Course Store" },
  ),
);
