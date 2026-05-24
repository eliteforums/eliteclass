// ---------------------------------------------------------------------------
// EduOS — LMS Enrollment Hooks
//
// React Query v5 hooks for student enrollment management. Covers student-
// facing queries (my enrollments, enrollment check) and admin/staff mutations
// (enroll by student list, enroll by batch, drop enrollment).
// ---------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import {
  getStudentEnrollments,
  getCourseEnrollments,
  enrollStudents,
  enrollBatch,
  dropEnrollment,
  isStudentEnrolled,
  selfEnrollInCourse,
} from "@/modules/courses/services/enrollment.service";
import { listPublishedCoursesForStudent } from "@/modules/courses/services/course.service";
import { courseKeys } from "@/modules/courses/hooks/useCourses";
import { unwrapApiResponse } from "@/modules/courses/utils/api";
import type {
  LmsEnrollment,
  LmsEnrollmentWithProgress,
  EnrollStudentsPayload,
  LmsCourse,
} from "@/types";
import type { CourseListFilters } from "@/modules/courses/services/course.service";

// ── Query key factory ─────────────────────────────────────────────────────────

export const enrollmentKeys = {
  /** All enrollment queries for a student */
  student: (studentId: string) => ["lms", "enrollments", "student", studentId] as const,
  /** All enrollment queries for a course (admin view) */
  course: (courseId: string) => ["lms", "enrollments", "course", courseId] as const,
  /** Check whether a specific student is enrolled in a specific course */
  check: (courseId: string, studentId: string) => ["lms", "enrolled", courseId, studentId] as const,
  /** Browse published courses for enrollment */
  catalog: (instituteId: string, filters?: CourseListFilters) =>
    ["lms", "catalog", instituteId, filters ?? {}] as const,
};

/** Invalidate student + course enrollment caches after admin enroll or self-enroll. */
export function invalidateEnrollmentCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  opts: { courseId?: string; studentIds?: string[]; instituteId?: string },
) {
  if (opts.courseId) {
    void queryClient.invalidateQueries({ queryKey: enrollmentKeys.course(opts.courseId) });
  }
  if (opts.studentIds?.length) {
    opts.studentIds.forEach((studentId) => {
      void queryClient.invalidateQueries({ queryKey: enrollmentKeys.student(studentId) });
      if (opts.courseId) {
        void queryClient.invalidateQueries({
          queryKey: enrollmentKeys.check(opts.courseId, studentId),
        });
      }
    });
  } else {
    void queryClient.invalidateQueries({ queryKey: ["lms", "enrollments", "student"] });
  }
  if (opts.instituteId) {
    void queryClient.invalidateQueries({ queryKey: enrollmentKeys.catalog(opts.instituteId) });
    void queryClient.invalidateQueries({ queryKey: courseKeys.all(opts.instituteId) });
  }
}

// ── useStudentEnrollments ─────────────────────────────────────────────────────

/**
 * Returns all enrollments for a student, each with the nested course object
 * and a flattened LmsCourseProgress (or null when no progress has been recorded).
 *
 * Powers the "My Learning" dashboard.
 *
 * @example
 * const { data: enrollments, isLoading } = useStudentEnrollments(user.id);
 */
export function useStudentEnrollments(studentId: string) {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useQuery<LmsEnrollmentWithProgress[]>({
    queryKey: enrollmentKeys.student(studentId),
    queryFn: async () => {
      const res = await getStudentEnrollments(studentId, instituteId);
      if (!res.success || !res.data) {
        throw new Error(res.error ?? "Failed to load enrollments");
      }
      return res.data;
    },
    enabled: !!studentId && !!instituteId,
    staleTime: 30_000,
  });
}

// ── useCourseEnrollments ──────────────────────────────────────────────────────

/**
 * Returns a paginated list of enrollments for a course with student info.
 * Intended for the admin / staff enrollment management page.
 *
 * @param courseId  The course whose enrollments to fetch
 * @param page      1-based page number (default: 1)
 * @param pageSize  Rows per page (default: 20, max: 100)
 */
export function useCourseEnrollments(courseId: string, page = 1, pageSize = 20) {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useQuery({
    queryKey: [...enrollmentKeys.course(courseId), page, pageSize] as const,
    queryFn: async () => {
      const res = await getCourseEnrollments(courseId, instituteId, page, pageSize);
      if (!res.success || !res.data) {
        throw new Error(res.error ?? "Failed to load course enrollments");
      }
      return res.data;
    },
    enabled: !!courseId && !!instituteId,
    staleTime: 30_000,
  });
}

// ── useIsEnrolled ─────────────────────────────────────────────────────────────

/**
 * Lightweight check — returns `{ enrolled, enrollmentId }` for a student/course
 * pair. Use this before rendering "Continue Learning" vs "Enroll" CTAs.
 *
 * Returns null when either id is empty (query stays disabled).
 */
export function useIsEnrolled(courseId: string | null, studentId: string | null) {
  return useQuery({
    queryKey: enrollmentKeys.check(courseId ?? "", studentId ?? ""),
    queryFn: async () => {
      const res = await isStudentEnrolled(courseId!, studentId!);
      if (!res.success || res.data === null) {
        throw new Error(res.error ?? "Failed to check enrollment status");
      }
      return res.data;
    },
    enabled: !!courseId && !!studentId,
    staleTime: 60_000,
  });
}

// ── useEnrollStudents ─────────────────────────────────────────────────────────

/**
 * Mutation to enroll one or more students into a course.
 * Uses upsert semantics — already-enrolled students are silently skipped.
 * On success, invalidates the course's enrollment list cache.
 */
export function useEnrollStudents() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useMutation({
    mutationFn: async ({
      payload,
      enrolledBy,
    }: {
      payload: EnrollStudentsPayload;
      enrolledBy: string;
    }) =>
      unwrapApiResponse(
        await enrollStudents(payload, enrolledBy, instituteId),
        "Failed to enroll students",
      ),

    onSuccess: (_data, { payload }) => {
      invalidateEnrollmentCaches(queryClient, {
        courseId: payload.course_id,
        studentIds: payload.student_ids,
        instituteId,
      });
    },
  });
}

// ── useEnrollBatch ────────────────────────────────────────────────────────────

/**
 * Mutation to enroll all active students in a batch into a course.
 * Fetches student user_ids from the `students` table, then bulk-enrolls them.
 * Already-enrolled students are silently skipped (upsert with ignoreDuplicates).
 */
export function useEnrollBatch() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useMutation({
    mutationFn: async ({
      courseId,
      batchId,
      enrolledBy,
    }: {
      courseId: string;
      batchId: string;
      enrolledBy: string;
    }) =>
      unwrapApiResponse(
        await enrollBatch(courseId, batchId, enrolledBy, instituteId),
        "Failed to enroll batch",
      ),

    onSuccess: (_data, { courseId, batchId }) => {
      invalidateEnrollmentCaches(queryClient, { courseId, instituteId });
      void queryClient.invalidateQueries({ queryKey: ["lms", "enrollments", "batch", batchId] });
    },
  });
}

// ── useSelfEnroll ─────────────────────────────────────────────────────────────

export function useSelfEnroll() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";
  const studentId = user?.id ?? "";

  return useMutation({
    mutationFn: async (courseId: string) =>
      unwrapApiResponse(
        await selfEnrollInCourse(courseId, studentId, instituteId),
        "Failed to enroll in course",
      ),

    onSuccess: (_data, courseId) => {
      invalidateEnrollmentCaches(queryClient, {
        courseId,
        studentIds: [studentId],
        instituteId,
      });
    },
  });
}

// ── useStudentCourseCatalog ───────────────────────────────────────────────────

export function useStudentCourseCatalog(filters?: CourseListFilters) {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useQuery<{ items: LmsCourse[]; total: number; totalPages: number }>({
    queryKey: enrollmentKeys.catalog(instituteId, filters),
    queryFn: async () => {
      const res = await listPublishedCoursesForStudent(instituteId, filters);
      if (!res.success || !res.data) {
        throw new Error(res.error ?? "Failed to load courses");
      }
      return res.data;
    },
    enabled: !!instituteId,
    staleTime: 60_000,
  });
}

// ── useDropEnrollment ─────────────────────────────────────────────────────────

/**
 * Mutation to soft-drop a student's enrollment.
 * Sets status → 'dropped' and records the dropped_at timestamp.
 * The enrollment row is retained for historical reporting.
 *
 * Pass `courseId` in the variables so the course enrollment list is
 * invalidated on success.
 */
export function useDropEnrollment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ enrollmentId }: { enrollmentId: string; courseId: string }) =>
      unwrapApiResponse(await dropEnrollment(enrollmentId), "Failed to drop enrollment"),

    onSuccess: (_data, { courseId }) => {
      invalidateEnrollmentCaches(queryClient, { courseId });
      void queryClient.invalidateQueries({ queryKey: ["enrollment", courseId] });
    },
  });
}
