// ---------------------------------------------------------------------------
// EliteClass — Assignment Management Service
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { getErrorMessage } from "@/utils/helpers";
import type {
  ApiResponse,
  Assignment,
  AssignmentResource,
  AssignmentSubmission,
  CreateAssignmentPayload,
  PaginatedResponse,
  SubmissionFile,
} from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

function logAssignmentSupabaseError(
  context: string,
  error: unknown,
  meta?: Record<string, unknown>,
) {
  const err = error as Record<string, unknown> | null;
  console.error(`[assignments] ${context}`, {
    ...meta,
    message: err?.message,
    code: err?.code,
    details: err?.details,
    hint: err?.hint,
    statusCode: err?.statusCode,
    error,
  });
}

function assignmentUploadErrorMessage(error: unknown): string {
  const message = getErrorMessage(error);
  if (/row-level security|violates row-level security policy/i.test(message)) {
    return "Upload was blocked by permissions. Sign in with the correct account or ask your institute admin to apply the latest security policy update.";
  }
  return message;
}

const ASSIGNMENT_RESOURCE_SIGNED_URL_TTL = 3600;

async function resolveStudentResourceDownloadUrls(
  resources: AssignmentResource[] | null | undefined,
): Promise<AssignmentResource[]> {
  if (!resources?.length || !supabase) return resources ?? [];

  // Local const so TypeScript narrows inside the async closure
  const client = supabase;

  const resolved = await Promise.all(
    resources.map(async (resource) => {
      if (!resource.storage_path) return resource;

      const { data, error } = await client.storage
        .from("assignment-resources")
        .createSignedUrl(resource.storage_path, ASSIGNMENT_RESOURCE_SIGNED_URL_TTL);

      if (error || !data?.signedUrl) {
        logAssignmentSupabaseError("resource signed URL failed", error, {
          storage_path: resource.storage_path,
          assignment_id: resource.assignment_id,
        });
        return resource;
      }

      return { ...resource, file_url: data.signedUrl };
    }),
  );

  return resolved;
}

// ── Shared Utilities ───────────────────────────────────────────────────────

/**
 * Upload a file to a specific assignment bucket
 */
export async function uploadAssignmentFile(
  instituteId: string,
  bucket: "assignment-resources" | "assignment-submissions",
  file: File,
  path: string,
): Promise<ApiResponse<{ url: string; path: string }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
  const fullPath = `${instituteId}/${path}/${fileName}`;

  const { data, error } = await supabase.storage.from(bucket).upload(fullPath, file);

  if (error) {
    logAssignmentSupabaseError("storage upload failed", error, { bucket, fullPath });
    return { data: null, error: assignmentUploadErrorMessage(error), success: false };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return {
    data: { url: publicUrl, path: data.path },
    error: null,
    success: true,
  };
}

// ── Admin Services ──────────────────────────────────────────────────────────

/**
 * List all assignments for an institute (Admin/Staff)
 */
export async function listAssignments(
  instituteId: string,
  filters: { status?: string; page?: number; pageSize?: number } = {},
): Promise<ApiResponse<PaginatedResponse<Assignment>>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // We need to fetch assignments with counts for assignees and submissions
  // This is best done with a view or separate counts if RLS allows,
  // but for now we'll fetch basic data and handle counts in a more efficient way if needed.
  let query = supabase
    .from("assignments")
    .select("*, assignment_assignees(count), assignment_submissions(count)", { count: "exact" })
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) return { data: null, error: getErrorMessage(error), success: false };

  const formattedData = (data as any[]).map((item) => ({
    ...item,
    assignees_count: item.assignment_assignees?.[0]?.count ?? 0,
    submissions_count: item.assignment_submissions?.[0]?.count ?? 0,
  }));

  return {
    data: {
      items: formattedData as Assignment[],
      meta: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    },
    error: null,
    success: true,
  };
}

/**
 * Get assignment details with resources
 */
export async function getAssignmentDetail(assignmentId: string): Promise<ApiResponse<Assignment>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("assignments")
    .select(
      `
      *,
      resources:assignment_resources(*)
    `,
    )
    .eq("id", assignmentId)
    .single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as Assignment, error: null, success: true };
}

/**
 * Create a new standalone assignment
 */
export async function createAssignment(
  instituteId: string,
  createdBy: string,
  payload: CreateAssignmentPayload,
  resources?: {
    file_name: string;
    file_url: string;
    storage_path: string;
    file_type?: string;
    file_size?: number;
  }[],
): Promise<ApiResponse<Assignment>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // Strip undefined values so Supabase uses column defaults (allow_* all default TRUE)
  const insertPayload = Object.fromEntries(
    Object.entries({
      institute_id: instituteId,
      created_by: createdBy,
      ...payload,
    }).filter(([, v]) => v !== undefined),
  );

  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .insert(insertPayload)
    .select()
    .single();

  if (assignmentError)
    return { data: null, error: getErrorMessage(assignmentError), success: false };

  if (resources && resources.length > 0) {
    const resourcePayload = resources.map((res) => ({
      ...res,
      assignment_id: assignment.id,
      institute_id: instituteId,
      uploaded_by: createdBy,
    }));

    const { error: resourceError } = await supabase
      .from("assignment_resources")
      .insert(resourcePayload);

    if (resourceError) {
      logAssignmentSupabaseError("assignment_resources insert failed", resourceError, {
        assignmentId: assignment.id,
        instituteId,
      });
      return {
        data: null,
        error: assignmentUploadErrorMessage(resourceError),
        success: false,
      };
    }
  }

  return { data: assignment as Assignment, error: null, success: true };
}

/**
 * Update an assignment
 */
export async function updateAssignment(
  assignmentId: string,
  payload: Partial<CreateAssignmentPayload>,
): Promise<ApiResponse<Assignment>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("assignments")
    .update(payload)
    .eq("id", assignmentId)
    .select()
    .single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as Assignment, error: null, success: true };
}

/**
 * Delete an assignment
 */
export async function deleteAssignment(assignmentId: string): Promise<ApiResponse<void>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // RLS and ON DELETE CASCADE will handle resources and assignees
  const { error } = await supabase.from("assignments").delete().eq("id", assignmentId);

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: undefined, error: null, success: true };
}

/**
 * List submissions for an assignment
 */
export async function listSubmissions(
  assignmentId: string,
): Promise<ApiResponse<AssignmentSubmission[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("assignment_submissions")
    .select(
      `
      *,
      student:students(id, admission_no, user:users(id, name, avatar_url, email)),
      files:submission_files(*)
    `,
    )
    .eq("assignment_id", assignmentId)
    .order("submitted_at", { ascending: false });

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as any[], error: null, success: true };
}

/**
 * Assign an assignment to multiple students
 */
export async function assignToStudents(
  assignmentId: string,
  instituteId: string,
  studentIds: string[],
): Promise<ApiResponse<void>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // First delete existing assignees to avoid duplicates if needed or just use upsert
  const payload = studentIds.map((sid) => ({
    assignment_id: assignmentId,
    student_id: sid,
    institute_id: instituteId,
  }));

  const { error } = await supabase.from("assignment_assignees").upsert(payload, {
    onConflict: "assignment_id,student_id",
  });

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: undefined, error: null, success: true };
}

/**
 * Get assignees for an assignment
 */
export async function getAssignees(assignmentId: string): Promise<ApiResponse<string[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("assignment_assignees")
    .select("student_id")
    .eq("assignment_id", assignmentId);

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data.map((d) => d.student_id), error: null, success: true };
}

/**
 * Grade a student submission
 */
export async function gradeSubmission(
  submissionId: string,
  grade: number,
  feedback: string,
  gradedBy: string,
): Promise<ApiResponse<AssignmentSubmission>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // Perform update without chaining .select().single() to avoid the
  // PGRST116 "could not coerce result in single JSON object" error that
  // occurs when RLS prevents the teacher from SELECTing the updated row.
  const { error } = await supabase
    .from("assignment_submissions")
    .update({
      grade,
      feedback,
      status: "graded",
      graded_at: new Date().toISOString(),
      graded_by: gradedBy,
    })
    .eq("id", submissionId);

  if (error) return { data: null, error: getErrorMessage(error), success: false };

  // Return a minimal object — the caller invalidates the query cache so the UI
  // always refetches fresh data; the actual row content is not needed here.
  return {
    data: { id: submissionId, grade, feedback, status: "graded" } as AssignmentSubmission,
    error: null,
    success: true,
  };
}

/**
 * Request a student to resubmit their assignment.
 * This clears the submission content, files, grade and feedback,
 * and sets the status to "resubmit_requested" so the student can submit again.
 *
 * Uses the `request_assignment_resubmit` RPC (SECURITY DEFINER) so that
 * staff/admin bypass the student-only RLS on assignment_submissions UPDATE.
 * Falls back to a direct update if the RPC doesn't exist yet (older DBs).
 */
export async function requestResubmit(
  submissionId: string,
): Promise<ApiResponse<AssignmentSubmission>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // Try the RPC first (bypasses RLS, safe for staff/admin)
  const { data: rpcData, error: rpcError } = await supabase
    .rpc("request_assignment_resubmit", { p_submission_id: submissionId });

  if (!rpcError) {
    // RPC succeeded — re-fetch the updated row for the caller
    const { data: updated } = await supabase
      .from("assignment_submissions")
      .select("*")
      .eq("id", submissionId)
      .single();
    return {
      data: (updated ?? rpcData) as AssignmentSubmission,
      error: null,
      success: true,
    };
  }

  // RPC not found (schema not yet applied) — fall back to direct update.
  // If this also fails it's an RLS problem; surface the real error.
  if (!rpcError.message?.includes("request_assignment_resubmit")) {
    return { data: null, error: getErrorMessage(rpcError), success: false };
  }

  // 1. Delete submission files from storage and database
  const { data: files } = await supabase
    .from("submission_files")
    .select("storage_path")
    .eq("submission_id", submissionId);

  if (files && files.length > 0) {
    const storagePaths = files.map((f) => f.storage_path).filter(Boolean);
    if (storagePaths.length > 0) {
      await supabase.storage.from("assignment-submissions").remove(storagePaths);
    }
    await supabase.from("submission_files").delete().eq("submission_id", submissionId);
  }

  // 2. Update the submission — do NOT null out submitted_at (NOT NULL column).
  // Keep the original timestamp; the status change to resubmit_requested is
  // enough to let the student resubmit.
  const { data, error } = await supabase
    .from("assignment_submissions")
    .update({
      status: "resubmit_requested",
      content: null,
      grade: null,
      feedback: null,
      graded_at: null,
      graded_by: null,
      is_late: false,
    })
    .eq("id", submissionId)
    .select()
    .single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as AssignmentSubmission, error: null, success: true };
}

// ── Student Services ────────────────────────────────────────────────────────

/**
 * List all assignments assigned to the current student
 */
export async function getStudentAssignments(userId: string): Promise<ApiResponse<Assignment[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // First, get the student record for this user
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (studentError || !student) {
    return { data: null, error: "Student record not found", success: false };
  }

  const { data, error } = await supabase
    .from("assignments")
    .select(
      `
      *,
      assignment_assignees!inner(student_id),
      submissions:assignment_submissions(id, status, grade, submitted_at, feedback, student_id)
    `,
    )
    .eq("assignment_assignees.student_id", student.id)
    .eq("status", "published")
    .order("due_date", { ascending: true });

  if (error) return { data: null, error: getErrorMessage(error), success: false };

  const formattedData = (data as any[]).map((item) => {
    // CRITICAL: the submissions join doesn't filter by student_id (PostgREST
    // can't apply that filter inside a nested relation when the parent is
    // assignments). So `item.submissions` may contain submissions from
    // OTHER students. Filter to this student before picking one.
    const studentSubs: Array<{
      id: string;
      status: string;
      grade: number | null;
      submitted_at: string | null;
      feedback: string | null;
      student_id?: string;
    }> = (item.submissions ?? []).filter(
      (s: any) => s.student_id === student.id,
    );

    // Sort: graded > submitted > pending; within same status, newest first
    const statusPriority: Record<string, number> = {
      graded: 0,
      reviewed: 1,
      submitted: 2,
      late: 3,
      pending: 4,
      resubmit_requested: 5,
    };
    studentSubs.sort((a, b) => {
      const pDiff = (statusPriority[a.status] ?? 9) - (statusPriority[b.status] ?? 9);
      if (pDiff !== 0) return pDiff;
      // Same status — newest first
      return (
        new Date(b.submitted_at ?? 0).getTime() -
        new Date(a.submitted_at ?? 0).getTime()
      );
    });

    return {
      ...item,
      submission: studentSubs[0] ?? null,
    };
  });

  return { data: formattedData as any[], error: null, success: true };
}

/**
 * Get student assignment details with submission.
 *
 * Returns `student_id` (the `students.id` PK) alongside the assignment so
 * downstream offline-aware mutations can target the row without an extra
 * round-trip while online (Phase C — `useSubmitAssignmentOffline`).
 */
export async function getStudentAssignmentDetail(
  assignmentId: string,
  userId: string,
): Promise<
  ApiResponse<
    Assignment & { submission: AssignmentSubmission | null; student_id: string }
  >
> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // First, get the student record for this user
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (studentError || !student) {
    return { data: null, error: "Student record not found", success: false };
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select(
      `
      *,
      resources:assignment_resources(*)
    `,
    )
    .eq("id", assignmentId)
    .single();

  if (assignmentError)
    return { data: null, error: getErrorMessage(assignmentError), success: false };

  const resources = await resolveStudentResourceDownloadUrls((assignment as Assignment).resources);

  // Fetch ALL submissions for this student on this assignment, then pick
  // the most relevant one. maybeSingle() would crash when a student has
  // multiple submissions (e.g. after a resubmit_requested cycle).
  const { data: subs } = await supabase
    .from("assignment_submissions")
    .select(
      `
      *,
      files:submission_files(*)
    `,
    )
    .eq("assignment_id", assignmentId)
    .eq("student_id", student.id);

  let chosenSubmission: AssignmentSubmission | null = null;
  if (subs && subs.length > 0) {
    const statusPriority: Record<string, number> = {
      graded: 0,
      reviewed: 1,
      submitted: 2,
      late: 3,
      pending: 4,
      resubmit_requested: 5,
    };
    const sorted = [...(subs as AssignmentSubmission[])].sort((a, b) => {
      const pDiff =
        (statusPriority[a.status] ?? 9) - (statusPriority[b.status] ?? 9);
      if (pDiff !== 0) return pDiff;
      return (
        new Date(b.submitted_at ?? 0).getTime() -
        new Date(a.submitted_at ?? 0).getTime()
      );
    });
    chosenSubmission = sorted[0] ?? null;
  }

  return {
    data: {
      ...(assignment as Assignment),
      resources,
      submission: chosenSubmission,
      student_id: student.id,
    },
    error: null,
    success: true,
  };
}

/**
 * Submit work for an assignment
 */
export async function submitAssignment(
  assignmentId: string,
  userId: string,
  instituteId: string,
  content?: string,
  files?: {
    file_name: string;
    file_url: string;
    storage_path: string;
    file_type?: string;
    file_size?: number;
  }[],
): Promise<ApiResponse<AssignmentSubmission>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // Get student_id from user_id
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!student) return { data: null, error: "Student profile not found", success: false };

  const { data: assignment } = await supabase
    .from("assignments")
    .select("due_date")
    .eq("id", assignmentId)
    .single();

  const isLate = assignment?.due_date ? new Date() > new Date(assignment.due_date) : false;

  const { data: submission, error: submissionError } = await supabase
    .from("assignment_submissions")
    .upsert(
      {
        assignment_id: assignmentId,
        student_id: student.id,
        institute_id: instituteId,
        content,
        status: isLate ? "late" : "submitted",
        submitted_at: new Date().toISOString(),
        is_late: isLate,
      },
      { onConflict: "assignment_id,student_id" },
    )
    .select()
    .single();

  if (submissionError)
    return { data: null, error: getErrorMessage(submissionError), success: false };

  if (files && files.length > 0) {
    const filePayload = files.map((f) => ({
      ...f,
      submission_id: submission.id,
      institute_id: instituteId,
    }));

    const { error: fileError } = await supabase.from("submission_files").insert(filePayload);

    if (fileError) {
      logAssignmentSupabaseError("submission_files insert failed", fileError, {
        assignmentId,
        submissionId: submission.id,
        instituteId,
      });
      return {
        data: null,
        error: assignmentUploadErrorMessage(fileError),
        success: false,
      };
    }
  }

  return { data: submission as AssignmentSubmission, error: null, success: true };
}
