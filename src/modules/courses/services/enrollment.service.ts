// ---------------------------------------------------------------------------
// EduOS — LMS Enrollment Service
//
// Handles student enrollment into courses — individually, by batch, and
// via direct lookup. Duplicate enrollments are handled gracefully via
// upsert with ignoreDuplicates so re-enrolling an active student is a no-op.
//
// Every function returns ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type {
  ApiResponse,
  LmsEnrollment,
  LmsEnrollmentWithProgress,
  EnrollStudentsPayload,
} from "@/types";

// ── Shared sentinel ──────────────────────────────────────────────────────────

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Result types ─────────────────────────────────────────────────────────────

export interface PaginatedEnrollmentResult {
  items: LmsEnrollment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Enrolls one or more students into a course.
 * Uses upsert with ignoreDuplicates=true so calling this for an already-enrolled
 * student silently succeeds without creating a duplicate or returning an error.
 */
export async function enrollStudents(
  payload: EnrollStudentsPayload,
  enrolledBy: string,
  instituteId: string,
): Promise<ApiResponse<LmsEnrollment[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  if (payload.student_ids.length === 0) {
    return { data: [], error: null, success: true };
  }

  const enrolledAt = new Date().toISOString();

  const records = payload.student_ids.map((studentId) => ({
    course_id: payload.course_id,
    student_id: studentId,
    institute_id: instituteId,
    enrolled_by: enrolledBy,
    batch_id: payload.batch_id || null,
    status: "active" as const,
    enrolled_at: enrolledAt,
    dropped_at: null,
    updated_at: enrolledAt,
  }));

  const { data, error } = await supabase
    .from("lms_enrollments")
    .upsert(records, { onConflict: "course_id,student_id" })
    .select("*");

  if (error) return { data: null, error: error.message, success: false };
  return { data: (data ?? []) as LmsEnrollment[], error: null, success: true };
}

/**
 * Student self-enrollment into a published institute course.
 * Reactivates dropped enrollments via upsert on (course_id, student_id).
 */
export async function selfEnrollInCourse(
  courseId: string,
  studentId: string,
  instituteId: string,
): Promise<ApiResponse<LmsEnrollment>> {
  const result = await enrollStudents(
    { course_id: courseId, student_ids: [studentId] },
    studentId,
    instituteId,
  );

  if (!result.success) {
    return { data: null, error: result.error ?? "Failed to enroll", success: false };
  }

  const row = result.data?.find((e) => e.course_id === courseId && e.student_id === studentId);
  if (!row) {
    return {
      data: null,
      error: "Enrollment could not be confirmed. Please refresh and try again.",
      success: false,
    };
  }

  return { data: row, error: null, success: true };
}

/**
 * Enrolls all active students in a batch into a course.
 * Fetches the students from the `students` table by batch_id, then delegates
 * to `enrollStudents` using the students' user_ids.
 * Students who are already enrolled are silently skipped.
 */
export async function enrollBatch(
  courseId: string,
  batchId: string,
  enrolledBy: string,
  instituteId: string,
): Promise<ApiResponse<LmsEnrollment[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data: studentsData, error: studentsError } = await supabase
    .from("students")
    .select("user_id")
    .eq("institute_id", instituteId)
    .eq("batch_id", batchId)
    .eq("status", "active");

  if (studentsError) return { data: null, error: studentsError.message, success: false };

  const studentIds = ((studentsData ?? []) as { user_id: string }[]).map((s) => s.user_id);

  if (studentIds.length === 0) {
    return { data: [], error: null, success: true };
  }

  return enrollStudents(
    { course_id: courseId, student_ids: studentIds, batch_id: batchId },
    enrolledBy,
    instituteId,
  );
}

/**
 * Soft-drops an enrollment by setting status='dropped' and recording the timestamp.
 * The enrollment record is retained for historical reporting.
 */
export async function dropEnrollment(enrollmentId: string): Promise<ApiResponse<LmsEnrollment>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("lms_enrollments")
    .update({
      status: "dropped",
      dropped_at: now,
      updated_at: now,
    })
    .eq("id", enrollmentId)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsEnrollment, error: null, success: true };
}

/**
 * Fetches a single enrollment by its primary key.
 */
export async function getEnrollmentById(enrollmentId: string): Promise<ApiResponse<LmsEnrollment>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_enrollments")
    .select("*")
    .eq("id", enrollmentId)
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsEnrollment, error: null, success: true };
}

/**
 * Returns all active and completed enrollments for a student with their
 * course info and progress joined inline.
 * Used to power the "My Learning" dashboard.
 */
export async function getStudentEnrollments(
  studentId: string,
  instituteId: string,
): Promise<ApiResponse<LmsEnrollmentWithProgress[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_enrollments")
    .select(
      `
      *,
      course:lms_courses(
        *,
        category:lms_categories(*)
      ),
      progress:lms_course_progress(*)
    `,
    )
    .eq("student_id", studentId)
    .eq("institute_id", instituteId)
    .neq("status", "dropped")
    .order("enrolled_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };

  const rows = (data ?? []) as unknown as LmsEnrollmentWithProgress[];
  const normalized = rows
    .filter((row) => row.course != null)
    .map((e) => ({
      ...e,
      progress: Array.isArray(e.progress)
        ? ((e.progress as unknown[])[0] ?? null)
        : (e.progress ?? null),
    })) as LmsEnrollmentWithProgress[];

  return { data: normalized, error: null, success: true };
}

/**
 * Returns a paginated list of enrollments for a course with student info joined.
 * Used by the admin/staff enrollment management page.
 */
export async function getCourseEnrollments(
  courseId: string,
  instituteId: string,
  page = 1,
  pageSize = 20,
): Promise<ApiResponse<PaginatedEnrollmentResult>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(100, pageSize));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  const { data, error, count } = await supabase
    .from("lms_enrollments")
    .select(
      `
      *,
      student:users(id, name, email, avatar_url),
      progress:lms_course_progress(*)
    `,
      { count: "exact" },
    )
    .eq("course_id", courseId)
    .eq("institute_id", instituteId)
    .order("enrolled_at", { ascending: false })
    .range(from, to);

  if (error) return { data: null, error: error.message, success: false };

  const total = count ?? 0;

  return {
    data: {
      items: (data ?? []) as unknown as LmsEnrollment[],
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    },
    error: null,
    success: true,
  };
}

/**
 * Checks whether a student has an active (non-dropped) enrollment in a course.
 * Returns the enrollment ID when found so the caller can navigate to the player.
 */
export async function isStudentEnrolled(
  courseId: string,
  studentId: string,
): Promise<ApiResponse<{ enrolled: boolean; enrollmentId: string | null }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_enrollments")
    .select("id")
    .eq("course_id", courseId)
    .eq("student_id", studentId)
    .neq("status", "dropped")
    .maybeSingle();

  if (error) return { data: null, error: error.message, success: false };

  return {
    data: {
      enrolled: data !== null,
      enrollmentId: data ? (data as { id: string }).id : null,
    },
    error: null,
    success: true,
  };
}
