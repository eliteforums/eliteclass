// ---------------------------------------------------------------------------
// EduOS — LMS Assignment Service
// All functions return ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type {
  LmsAssignment,
  LmsAssignmentSubmission,
  ApiResponse,
  GradeSubmissionPayload,
} from "@/types";

const NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Extended submit payload (adds student_id / institute_id to base type) ─────

export interface ExtendedSubmitAssignmentPayload {
  assignment_id: string;
  enrollment_id: string;
  student_id: string;
  institute_id: string;
  file_urls?: string[];
  storage_paths?: string[];
  text_response?: string;
}

// ── getCourseAssignments ──────────────────────────────────────────────────────

export async function getCourseAssignments(
  courseId: string,
  instituteId: string,
): Promise<ApiResponse<LmsAssignment[]>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_assignments")
    .select("*")
    .eq("course_id", courseId)
    .eq("institute_id", instituteId)
    .eq("is_published", true)
    .order("created_at");

  if (error) return { data: null, error: error.message, success: false };
  return { data: data ?? [], error: null, success: true };
}

// ── getAssignmentByLesson ─────────────────────────────────────────────────────

export async function getAssignmentByLesson(
  lessonId: string,
): Promise<ApiResponse<LmsAssignment | null>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_assignments")
    .select("*")
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) return { data: null, error: error.message, success: false };
  return { data, error: null, success: true };
}

// ── getStudentSubmission ──────────────────────────────────────────────────────

export async function getStudentSubmission(
  assignmentId: string,
  studentId: string,
): Promise<ApiResponse<LmsAssignmentSubmission | null>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_assignment_submissions")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (error) return { data: null, error: error.message, success: false };
  return { data, error: null, success: true };
}

// ── submitAssignment ──────────────────────────────────────────────────────────

export async function submitAssignment(
  payload: ExtendedSubmitAssignmentPayload,
): Promise<ApiResponse<LmsAssignmentSubmission>> {
  if (!supabase) return NOT_CONFIGURED;

  const now = new Date().toISOString();

  // Check due date and late-submission policy
  const { data: assignment } = await supabase
    .from("lms_assignments")
    .select("due_date, allow_late")
    .eq("id", payload.assignment_id)
    .single();

  const isLate = assignment?.due_date ? new Date(now) > new Date(assignment.due_date) : false;

  if (isLate && !assignment?.allow_late) {
    return {
      data: null,
      error: "The deadline has passed and late submissions are not allowed for this assignment.",
      success: false,
    };
  }

  const { data, error } = await supabase
    .from("lms_assignment_submissions")
    .upsert(
      {
        assignment_id: payload.assignment_id,
        enrollment_id: payload.enrollment_id,
        student_id: payload.student_id,
        institute_id: payload.institute_id,
        file_urls: payload.file_urls ?? [],
        storage_paths: payload.storage_paths ?? [],
        text_response: payload.text_response ?? null,
        status: "submitted",
        submitted_at: now,
        is_late: isLate,
      },
      { onConflict: "assignment_id,student_id" },
    )
    .select()
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data, error: null, success: true };
}

// ── deleteAssignment ────────────────────────────────────────────────────────

/**
 * Permanently deletes an assignment and its associated submissions.
 * Cascade deletion is handled at the database level.
 */
export async function deleteAssignment(assignmentId: string): Promise<ApiResponse<null>> {
  if (!supabase) return NOT_CONFIGURED;

  const { error } = await supabase.from("lms_assignments").delete().eq("id", assignmentId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

// ── gradeSubmission ──────────────────────────────────────────────────────────

/**
 * Applies a grade and optional feedback to a submission.
 * Sets status to 'graded' and records the grader's ID and timestamp.
 */
export async function gradeSubmission(
  payload: GradeSubmissionPayload,
  gradedBy: string,
): Promise<ApiResponse<LmsAssignmentSubmission>> {
  if (!supabase) return NOT_CONFIGURED;

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("lms_assignment_submissions")
    .update({
      grade: payload.grade,
      feedback: payload.feedback ?? null,
      graded_by: gradedBy,
      graded_at: now,
      status: "graded" as const,
      updated_at: now,
    })
    .eq("id", payload.submission_id)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsAssignmentSubmission, error: null, success: true };
}

// ── getSubmissionsForAssignment ───────────────────────────────────────────────

export interface PaginatedSubmissionResult {
  items: LmsAssignmentSubmission[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Returns a paginated list of submissions for an assignment, with basic student
 * info (id, name, email) joined from the users table.
 * Used by instructors on the grading dashboard.
 */
export async function getSubmissionsForAssignment(
  assignmentId: string,
  page = 1,
  pageSize = 20,
): Promise<ApiResponse<PaginatedSubmissionResult>> {
  if (!supabase) return NOT_CONFIGURED;

  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(100, pageSize));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  const { data, error, count } = await supabase
    .from("lms_assignment_submissions")
    .select(
      `
      *,
      student:users(id, name, email)
    `,
      { count: "exact" },
    )
    .eq("assignment_id", assignmentId)
    .order("submitted_at", { ascending: false })
    .range(from, to);

  if (error) return { data: null, error: error.message, success: false };

  const total = count ?? 0;
  return {
    data: {
      items: (data ?? []) as unknown as LmsAssignmentSubmission[],
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    },
    error: null,
    success: true,
  };
}
