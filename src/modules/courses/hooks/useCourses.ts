// ---------------------------------------------------------------------------
// EduOS — LMS Course Hooks
//
// React Query v5 hooks for course creation, updates, publishing, and
// curriculum loading. All queries use the `courseKeys` factory for consistent
// cache invalidation across mutations.
// ---------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import {
  createCourse,
  updateCourse,
  getCourseById,
  getCourseWithCurriculum,
  listCourses,
  listCategories,
  publishCourse,
  archiveCourse,
  deleteCourse,
  getCourseStats,
  type CourseListFilters,
  type CourseStats,
} from "@/modules/courses/services/course.service";
import { getCourseAnalytics } from "@/modules/courses/services/analytics.service";
import { unwrapApiResponse } from "@/modules/courses/utils/api";
import type { CreateCoursePayload, LmsCourse, LmsCategory, LmsCourseAnalytics } from "@/types";

// Re-export for consumers that import filters from the hook module
export type { CourseListFilters as CourseFilters, CourseStats };

// ── Query key factory ─────────────────────────────────────────────────────────
// All keys are scoped to instituteId so different institutes never share cache.

export const courseKeys = {
  /** Root key — invalidate to bust the entire course cache */
  all: (instituteId: string) => ["lms", "courses", instituteId] as const,
  /** Paginated / filtered list */
  list: (instituteId: string, filters?: CourseListFilters) =>
    ["lms", "courses", instituteId, filters ?? {}] as const,
  /** Single course detail */
  detail: (courseId: string) => ["lms", "course", courseId] as const,
  /** Full course + modules + lessons */
  curriculum: (courseId: string) => ["lms", "curriculum", courseId] as const,
  /** Institute category list */
  categories: (instituteId: string) => ["lms", "categories", instituteId] as const,
  /** Course analytics (RPC) */
  analytics: (courseId: string) => ["lms", "analytics", courseId] as const,
};

// ── useCourses ────────────────────────────────────────────────────────────────

/**
 * Paginated course list for the management table.
 * Automatically scoped to the logged-in user's institute.
 *
 * @example
 * const { data, isLoading } = useCourses({ status: 'published', page: 1 });
 */
export function useCourses(filters?: CourseListFilters) {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useQuery({
    queryKey: courseKeys.list(instituteId, filters),
    queryFn: async () => {
      const response = await listCourses(instituteId, filters);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Failed to load courses");
      }
      return response.data;
    },
    enabled: !!instituteId,
    staleTime: 30_000,
  });
}

// ── useCourseDetail ───────────────────────────────────────────────────────────

/**
 * Fetches a single course by ID (with category join).
 * Disabled when courseId is falsy.
 */
export function useCourseDetail(courseId: string | null) {
  return useQuery({
    queryKey: courseId ? courseKeys.detail(courseId) : (["lms", "course", "__none__"] as const),
    queryFn: async (): Promise<LmsCourse> => {
      const response = await getCourseById(courseId!);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Failed to load course");
      }
      return response.data;
    },
    enabled: !!courseId,
    staleTime: 30_000,
  });
}

// ── useCourseCurriculum ───────────────────────────────────────────────────────

/**
 * Fetches the full course + modules + lessons tree (used in editor and player).
 */
export function useCourseCurriculum(courseId: string | null) {
  return useQuery({
    queryKey: courseId
      ? courseKeys.curriculum(courseId)
      : (["lms", "curriculum", "__none__"] as const),
    queryFn: async () => {
      const response = await getCourseWithCurriculum(courseId!);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Failed to load curriculum");
      }
      return response.data;
    },
    enabled: !!courseId,
    staleTime: 30_000,
    retry: 2,
  });
}

// ── useCategories ─────────────────────────────────────────────────────────────

/**
 * Institute-scoped category list. Categories rarely change, so staleTime is 5 min.
 */
export function useCategories(instituteId: string | null) {
  return useQuery({
    queryKey: instituteId
      ? courseKeys.categories(instituteId)
      : (["lms", "categories", "__none__"] as const),
    queryFn: async (): Promise<LmsCategory[]> => {
      const response = await listCategories(instituteId!);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Failed to load categories");
      }
      return response.data;
    },
    enabled: !!instituteId,
    staleTime: 5 * 60_000, // 5 minutes — categories change rarely
  });
}

// ── useCreateCourse ───────────────────────────────────────────────────────────

export function useCreateCourse() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useMutation({
    mutationFn: async ({ payload, userId }: { payload: CreateCoursePayload; userId: string }) =>
      unwrapApiResponse(
        await createCourse(payload, instituteId, userId),
        "Failed to create course",
      ),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: courseKeys.all(instituteId) });
    },
  });
}

// ── useUpdateCourse ────────────────────────────────────────────

export function useUpdateCourse() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useMutation({
    mutationFn: async ({ courseId, updates }: { courseId: string; updates: Partial<LmsCourse> }) =>
      unwrapApiResponse(await updateCourse(courseId, updates), "Failed to update course"),

    onSuccess: (_data, { courseId }) => {
      void queryClient.invalidateQueries({ queryKey: courseKeys.detail(courseId) });
      void queryClient.invalidateQueries({ queryKey: courseKeys.curriculum(courseId) });
      void queryClient.invalidateQueries({ queryKey: courseKeys.all(instituteId) });
    },
  });
}

// ── usePublishCourse ──────────────────────────────────────────────────────────

/**
 * Publishes a course (sets status → 'published', records published_at).
 * Invalidates the list and detail queries on success.
 */
export function usePublishCourse() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useMutation({
    mutationFn: async (courseId: string) =>
      unwrapApiResponse(await publishCourse(courseId), "Failed to publish course"),

    onSuccess: (_data, courseId) => {
      void queryClient.invalidateQueries({ queryKey: courseKeys.all(instituteId) });
      void queryClient.invalidateQueries({ queryKey: courseKeys.detail(courseId) });
      void queryClient.invalidateQueries({ queryKey: courseKeys.curriculum(courseId) });
    },
  });
}

// ── useArchiveCourse ──────────────────────────────────────────────────────────

/**
 * Archives a course (sets status → 'archived').
 * Existing enrollments are not affected.
 */
export function useArchiveCourse() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useMutation({
    mutationFn: async (courseId: string) =>
      unwrapApiResponse(await archiveCourse(courseId), "Failed to archive course"),

    onSuccess: (_data, courseId) => {
      void queryClient.invalidateQueries({ queryKey: courseKeys.all(instituteId) });
      void queryClient.invalidateQueries({ queryKey: courseKeys.detail(courseId) });
    },
  });
}

// ── useDeleteCourse ───────────────────────────────────────────────────────────

/**
 * Permanently deletes a course. UI must confirm before calling.
 * Removes the course from all list queries and clears the detail cache.
 */
export function useDeleteCourse() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useMutation({
    mutationFn: async (courseId: string) =>
      unwrapApiResponse(await deleteCourse(courseId), "Failed to delete course"),

    onSuccess: (_data, courseId) => {
      queryClient.removeQueries({ queryKey: courseKeys.detail(courseId) });
      queryClient.removeQueries({ queryKey: courseKeys.curriculum(courseId) });
      void queryClient.invalidateQueries({ queryKey: courseKeys.all(instituteId) });
    },
  });
}

// ── useCourseStats ──────────────────────────────────────────────────────────

/**
 * Fetches aggregate statistics (total, published, draft, archived, totalEnrollments)
 * for the institute’s courses.
 * Pass `createdBy` to scope to a specific staff member’s courses only.
 */
export function useCourseStats(createdBy?: string) {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useQuery<CourseStats>({
    queryKey: [...courseKeys.all(instituteId), "stats", createdBy ?? "all"],
    queryFn: async (): Promise<CourseStats> => {
      if (!instituteId) {
        return { total: 0, published: 0, draft: 0, archived: 0, totalEnrollments: 0 };
      }
      const response = await getCourseStats(instituteId, createdBy);
      if (!response.success || !response.data) {
        return { total: 0, published: 0, draft: 0, archived: 0, totalEnrollments: 0 };
      }
      return response.data;
    },
    enabled: !!instituteId,
    staleTime: 60_000,
  });
}

// ── useCourseAnalytics ────────────────────────────────────────────────────────

export function useCourseAnalytics(courseId: string | null) {
  return useQuery<LmsCourseAnalytics>({
    queryKey: courseId
      ? courseKeys.analytics(courseId)
      : (["lms", "analytics", "__none__"] as const),
    queryFn: async (): Promise<LmsCourseAnalytics> => {
      const response = await getCourseAnalytics(courseId!);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Failed to load course analytics");
      }
      return response.data;
    },
    enabled: !!courseId,
    staleTime: 60_000,
  });
}
