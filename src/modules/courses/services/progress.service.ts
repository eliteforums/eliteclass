// ---------------------------------------------------------------------------
// EduOS — LMS Progress Service
// Handles lesson progress upserts and course progress view queries.
// All functions return ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type {
  LmsLessonProgress,
  LmsCourseProgress,
  ApiResponse,
  UpdateProgressPayload,
} from "@/types";

const NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Extended payload (includes DB-required fields not in UpdateProgressPayload) ─

export interface UpsertLessonProgressPayload {
  enrollment_id: string;
  lesson_id: string;
  student_id: string;
  course_id: string;
  institute_id: string;
  is_completed?: boolean;
  watch_seconds?: number;
  last_position_secs?: number;
}

// ── upsertLessonProgress ──────────────────────────────────────────────────────

export async function upsertLessonProgress(
  payload: UpsertLessonProgressPayload,
): Promise<ApiResponse<LmsLessonProgress>> {
  if (!supabase) return NOT_CONFIGURED;

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("lms_lesson_progress")
    .upsert(
      {
        enrollment_id: payload.enrollment_id,
        lesson_id: payload.lesson_id,
        student_id: payload.student_id,
        course_id: payload.course_id,
        institute_id: payload.institute_id,
        is_completed: payload.is_completed ?? false,
        watch_seconds: payload.watch_seconds ?? 0,
        last_position_secs: payload.last_position_secs ?? 0,
        last_accessed_at: now,
        completed_at: payload.is_completed ? now : null,
      },
      { onConflict: "enrollment_id,lesson_id" },
    )
    .select()
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data, error: null, success: true };
}

// ── getLessonProgress ─────────────────────────────────────────────────────────

export async function getLessonProgress(
  enrollmentId: string,
  courseId: string,
): Promise<ApiResponse<LmsLessonProgress[]>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_lesson_progress")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .eq("course_id", courseId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: data ?? [], error: null, success: true };
}

// ── getCourseProgressView ────────────────────────────────────────────────────

export async function getCourseProgressView(
  enrollmentId: string,
): Promise<ApiResponse<LmsCourseProgress>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_course_progress")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data, error: null, success: true };
}

// ── getCourseProgress (null-safe) ─────────────────────────────────────────

/**
 * Fetches aggregate course progress for a given enrollment.
 * Returns null (not an error) for new enrollments with no recorded activity.
 * Prefer this over getCourseProgressView in student-facing code.
 */
export async function getCourseProgress(
  enrollmentId: string,
): Promise<ApiResponse<LmsCourseProgress | null>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_course_progress")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .maybeSingle();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsCourseProgress | null, error: null, success: true };
}

// ── getSingleLessonProgress ───────────────────────────────────────────────

/**
 * Fetches progress for a single specific lesson within an enrollment.
 * Returns null (not an error) when no progress row exists yet for this lesson.
 */
export async function getSingleLessonProgress(
  enrollmentId: string,
  lessonId: string,
): Promise<ApiResponse<LmsLessonProgress | null>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_lesson_progress")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsLessonProgress | null, error: null, success: true };
}

// ── getAllLessonProgress ─────────────────────────────────────────────────────

/**
 * Fetches all lesson progress rows for a given enrollment without requiring
 * a courseId. Useful when the course context isn't immediately available.
 * The caller typically transforms the result into a lessonId → progress map.
 */
export async function getAllLessonProgress(
  enrollmentId: string,
): Promise<ApiResponse<LmsLessonProgress[]>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_lesson_progress")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message, success: false };
  return { data: (data ?? []) as LmsLessonProgress[], error: null, success: true };
}

// ── getStudentLearningStats ─────────────────────────────────────────────────

export interface StudentLearningStats {
  total_enrolled: number;
  total_completed: number;
  total_in_progress: number;
  avg_completion_pct: number;
  total_watch_hours: number;
}

/**
 * Returns aggregate learning statistics for a student across all their courses.
 *
 * - total_enrolled:     count of active + completed enrollments
 * - total_completed:    count of enrollments with status = 'completed'
 * - total_in_progress:  count of active enrollments where at least 1 lesson has been started
 * - avg_completion_pct: average completion_pct across all enrolled courses (0–100)
 * - total_watch_hours:  sum of total_watch_seconds / 3600 (rounded to 2 decimal places)
 */
export async function getStudentLearningStats(
  studentId: string,
  instituteId: string,
): Promise<ApiResponse<StudentLearningStats>> {
  if (!supabase) return NOT_CONFIGURED;

  // 1. Fetch all non-dropped enrollments for the student
  const { data: enrollments, error: enrollError } = await supabase
    .from("lms_enrollments")
    .select("id, status")
    .eq("student_id", studentId)
    .eq("institute_id", instituteId)
    .in("status", ["active", "completed"]);

  if (enrollError) return { data: null, error: enrollError.message, success: false };

  const rows = (enrollments ?? []) as { id: string; status: string }[];
  const enrollmentIds = rows.map((r) => r.id);
  const total_enrolled = rows.length;
  const total_completed = rows.filter((r) => r.status === "completed").length;

  // Short-circuit when the student hasn't enrolled in anything yet
  if (enrollmentIds.length === 0) {
    return {
      data: {
        total_enrolled: 0,
        total_completed: 0,
        total_in_progress: 0,
        avg_completion_pct: 0,
        total_watch_hours: 0,
      },
      error: null,
      success: true,
    };
  }

  // 2. Fetch course-level progress for all those enrollments
  const { data: progressRows, error: progressError } = await supabase
    .from("lms_course_progress")
    .select("enrollment_id, completion_pct, total_watch_seconds, completed_lessons")
    .in("enrollment_id", enrollmentIds);

  if (progressError) return { data: null, error: progressError.message, success: false };

  const progressData = (progressRows ?? []) as {
    enrollment_id: string;
    completion_pct: number;
    total_watch_seconds: number;
    completed_lessons: number;
  }[];

  // Active enrollments that have at least one lesson started (completed_lessons > 0)
  const activeIds = new Set(rows.filter((r) => r.status === "active").map((r) => r.id));
  const total_in_progress = progressData.filter(
    (p) => activeIds.has(p.enrollment_id) && p.completed_lessons > 0,
  ).length;

  const avg_completion_pct =
    progressData.length > 0
      ? progressData.reduce((sum, p) => sum + (p.completion_pct ?? 0), 0) / progressData.length
      : 0;

  const rawWatchHours =
    progressData.reduce((sum, p) => sum + (p.total_watch_seconds ?? 0), 0) / 3600;

  return {
    data: {
      total_enrolled,
      total_completed,
      total_in_progress,
      avg_completion_pct: Math.round(avg_completion_pct * 100) / 100,
      total_watch_hours: Math.round(rawWatchHours * 100) / 100,
    },
    error: null,
    success: true,
  };
}

// ── Re-export UpdateProgressPayload convenience alias ───────────────────────────
// (Consumers can import it from here rather than needing @/types directly)
export type { UpdateProgressPayload };
