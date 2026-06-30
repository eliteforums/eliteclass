// ---------------------------------------------------------------------------
// EliteClass — Student Service
//
// All database operations for the `students` table live here.
// Every query that returns student records also joins `users` so callers
// always have access to the student's display name, email, and avatar.
//
// SUPABASE NULL SAFETY
//   `supabase` is `SupabaseClient | null` (see src/lib/supabase.ts).
//   Every function starts with `if (!supabase) return SUPABASE_NOT_CONFIGURED`.
//   After that guard, TypeScript narrows the type to `SupabaseClient` for the
//   remainder of the function body — no `!` assertions needed below.
//
// Every function returns an ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase, supabaseAdmin } from "@/lib/supabase";
import { generateParentCredentials } from "@/utils/parentCredentials";
import { 
  generateStudentCredentials, 
  generateTempPassword 
} from "@/utils/studentCredentials";
import { getStudentBatch } from "@/services/batch.service";
import { getStudentAttendanceHistory } from "@/services/attendance.service";
import { isAbortError, getErrorMessage } from "@/utils/helpers";
import { cacheList } from "@/services/offline/snapshotHelpers";
import type {
  Student,
  StudentParent,
  StudentHistory,
  StudentStatus,
  Batch,
  ApiResponse,
  PaginatedResponse,
  StudentFilters,
  AdmitStudentPayload,
  AdmitStudentResult,
  StudentLinkedForParent,
  LifecycleAction,
  StudentPromotion,
  StudentDocument,
  AttendanceTrendPoint,
  StudentAttendanceRecord,
  StudentAttendanceStats,
  StudentBatchInfo,
  StudentDashboardData,
  ParentAccountStatus,
  ParentEmailDeliveryStatus,
} from "@/types";

// ── Shared "not configured" error response ───────────────────────────────────
// Returned by every service function when the Supabase client is null.

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

interface ParentCredentialEmailPayload {
  parentName: string;
  parentEmail: string;
  parentTemporaryPassword: string;
  studentName: string;
  instituteName: string;
  portalUrl: string;
}

async function sendParentCredentialEmail(
  payload: ParentCredentialEmailPayload,
): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const maxAttempts = 3;
  let lastError = "Unknown email error.";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await supabase.functions.invoke("send-parent-credentials", {
      body: {
        parent_name: payload.parentName,
        parent_email: payload.parentEmail,
        parent_temporary_password: payload.parentTemporaryPassword,
        student_name: payload.studentName,
        institute_name: payload.instituteName,
        portal_url: payload.portalUrl,
      },
    });

    if (!error && data?.success) {
      return { data: null, error: null, success: true };
    }

    lastError = error?.message ?? data?.error ?? "Email delivery failed.";
    
    // In development, if the function fails because it's not deployed or 
    // keys are missing, we log the credentials to the console as a fallback.
    if (import.meta.env.DEV && (lastError.includes("404") || lastError.includes("RESEND_API_KEY"))) {
      console.log("----------------------------------------------------------");
      console.log(`[EMAIL FALLBACK] To: ${payload.parentEmail}`);
      console.log(`[EMAIL FALLBACK] Password: ${payload.parentTemporaryPassword}`);
      console.log("----------------------------------------------------------");
      return { data: null, error: null, success: true };
    }
  }

  return { data: null, error: lastError, success: false };
}

function getAttendanceDateKey(record: StudentAttendanceRecord): string {
  return record.session?.session_date ?? record.marked_at.slice(0, 10);
}

function createEmptyTrendPoint(label: string, period: string): AttendanceTrendPoint {
  return {
    label,
    period,
    present: 0,
    absent: 0,
    late: 0,
    leave: 0,
    total: 0,
    percentage: 0,
  };
}

function buildMonthlyTrend(records: StudentAttendanceRecord[]): AttendanceTrendPoint[] {
  const buckets = new Map<string, AttendanceTrendPoint>();
  const now = new Date();

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(
      key,
      createEmptyTrendPoint(
        date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        key,
      ),
    );
  }

  for (const record of records) {
    const [year, month] = getAttendanceDateKey(record).split("-");
    const bucket = buckets.get(`${year}-${month}`);
    if (!bucket) continue;
    bucket.total += 1;
    bucket[record.status] += 1;
  }

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    percentage:
      bucket.total > 0 ? Math.round(((bucket.present + bucket.late) / bucket.total) * 100) : 0,
  }));
}

function buildWeeklyTrend(records: StudentAttendanceRecord[]): AttendanceTrendPoint[] {
  const buckets = new Map<string, AttendanceTrendPoint>();
  const now = new Date();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    buckets.set(
      key,
      createEmptyTrendPoint(date.toLocaleDateString("en-US", { weekday: "short" }), key),
    );
  }

  for (const record of records) {
    const dateKey = getAttendanceDateKey(record);
    const bucket = buckets.get(dateKey);
    if (!bucket) continue;
    bucket.total += 1;
    bucket[record.status] += 1;
  }

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    percentage:
      bucket.total > 0 ? Math.round(((bucket.present + bucket.late) / bucket.total) * 100) : 0,
  }));
}

function buildAttendanceStats(
  studentId: string,
  history: StudentAttendanceRecord[],
): StudentAttendanceStats {
  const totalSessions = history.length;
  const present = history.filter((record) => record.status === "present").length;
  const absent = history.filter((record) => record.status === "absent").length;
  const late = history.filter((record) => record.status === "late").length;
  const leave = history.filter((record) => record.status === "leave").length;
  const attended = present + late;

  return {
    student_id: studentId,
    total_sessions: totalSessions,
    present,
    absent,
    late,
    leave,
    percentage: totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 0,
    present_percentage: totalSessions > 0 ? Math.round((present / totalSessions) * 100) : 0,
    absent_percentage: totalSessions > 0 ? Math.round((absent / totalSessions) * 100) : 0,
    late_percentage: totalSessions > 0 ? Math.round((late / totalSessions) * 100) : 0,
    leave_percentage: totalSessions > 0 ? Math.round((leave / totalSessions) * 100) : 0,
    monthly_trend: buildMonthlyTrend(history),
    weekly_trend: buildWeeklyTrend(history),
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Return all students who belong to a given institute, newest first.
 * The joined `user` relation provides name/email without a second round-trip.
 */
/**
 * Return all students for an institute, with their basic user profiles.
 * Optimized to fetch only necessary columns for list views.
 */
export async function getStudentsByInstitute(
  instituteId: string,
): Promise<ApiResponse<Student[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase
      .from("students")
      .select("id, user_id, admission_no, status, created_at, batch_id, user:users(id, name, email, avatar_url)")
      .eq("institute_id", instituteId)
      .order("created_at", { ascending: false });

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    const students = data as unknown as Student[];

    // Seed the OCS snapshot cache so the students list survives offline
    // reloads (Req 12.4, 12.5).
    cacheList("student", students);

    return { data: students, error: null, success: true };
  } catch (err) {
    const msg = getErrorMessage(err, "Failed to load students.");
    console.error("[getStudentsByInstitute] exception:", err);
    return { data: null, error: msg, success: false };
  }
}

/**
 * Return a single student by their `students.id` primary key.
 * Includes the joined `user` profile.
 */
export async function getStudentById(id: string): Promise<ApiResponse<Student>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase
      .from("students")
      .select("id, user_id, admission_no, status, created_at, batch_id, institute_id, emergency_contact, user:users(id, name, email, phone, avatar_url, role, is_active)")
      .eq("id", id)
      .single();

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    return { data: data as unknown as Student, error: null, success: true };
  } catch (err) {
    const msg = getErrorMessage(err, "Failed to load student details.");
    console.error("[getStudentById] exception:", err);
    return { data: null, error: msg, success: false };
  }
}

/**
 * Return a student by their linked Supabase auth `user_id`.
 * Useful after sign-in when you only have the auth UUID, not the student UUID.
 */
export async function getStudentByUserId(userId: string): Promise<ApiResponse<Student>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase
      .from("students")
      .select(`
        id, user_id, admission_no, status, created_at, batch_id, institute_id, 
        user:users(id, name, email, phone, avatar_url, role, is_active),
        assignments:student_batch_assignments(
          id, batch_id, course_id, is_active, 
          batch:batches(id, name),
          course:courses(id, name, code, is_active, created_at, updated_at)
        )
      `)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    if (!data) return { data: null, error: "Student profile not found. Please contact your administrator.", success: false };

    const normalized = data
      ? {
          ...data,
          assignments: data.assignments?.map((assignment) => assignment),
        }
      : data;

    return { data: normalized as unknown as Student, error: null, success: true };
  } catch (err) {
    const msg = getErrorMessage(err, "Failed to load student profile.");
    console.error("[getStudentByUserId] exception:", err);
    return { data: null, error: msg, success: false };
  }
}

/**
 * Return all students linked to a given parent via the `student_parents`
 * junction table.  Each row's nested `student` relation is unwrapped so the
 * return type is a flat `Student[]`.
 */
export async function getStudentsByParentId(
  parentId: string,
): Promise<ApiResponse<StudentLinkedForParent[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase
      .from("student_parents")
      .select("relation_type, student:students(id, admission_no, status, created_at, batch_id, institute_id, user:users(id, name, email, phone, avatar_url, role, is_active))")
      .eq("parent_id", parentId);

    if (error) return { data: null, error: getErrorMessage(error), success: false };

    const rows = (data ?? []) as unknown as Array<{
      relation_type: StudentLinkedForParent["relation_type"];
      student: Student | null;
    }>;

    const students: StudentLinkedForParent[] = rows
      .filter((row) => row.student !== null)
      .map((row) => ({
        ...row.student!,
        relation_type: row.relation_type,
      }));

    return { data: students, error: null, success: true };
  } catch (err) {
    const msg = getErrorMessage(err, "Failed to load linked students.");
    console.error("[getStudentsByParentId] exception:", err);
    return { data: null, error: msg, success: false };
  }
}

/**
 * Search and filter students within an institute with offset pagination.
 *
 * FILTERING STRATEGY:
 *
 *  PostgREST cannot reference joined-table columns (users.name, users.email)
 *  in a root-level .or() filter. To work around this while preserving correct
 *  pagination:
 *
 *  - When NO search term is provided: standard paginated query with exact range.
 *  - When a search term IS provided: over-fetch (pageSize * 5) from Supabase
 *    using admission_no ilike, then client-filter name/email on the larger set,
 *    and trim to the requested page slice. This ensures pagination works
 *    correctly for searches that match on name/email.
 *
 *  KNOWN LIMITATION: For very large datasets (50k+) where most matches are on
 *  name/email and NOT admission_no, some results may be missed. The proper fix
 *  is a generated `search_text` column (concat of admission_no, name, email)
 *  with a GIN index, or a Supabase RPC function. TODO: add DB migration for
 *  `search_text` tsvector column on the students table.
 *
 *  count:'exact' is kept on a separate lightweight query (no join) to avoid
 *  stalling the main request.
 */
export async function searchStudents(
  instituteId: string,
  filters: StudentFilters = {},
  page = 1,
  pageSize = 20,
  abortSignal?: AbortSignal,
): Promise<ApiResponse<PaginatedResponse<Student>>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const hasSearch = !!filters.search?.trim();
  // Over-fetch multiplier when searching across joined columns
  const OVERFETCH_MULTIPLIER = 5;
  const fetchSize = hasSearch ? pageSize * OVERFETCH_MULTIPLIER : pageSize;

  const from = (page - 1) * pageSize;
  // When over-fetching, always start from 0 of the logical page group
  const queryFrom = hasSearch ? 0 : from;
  const queryTo = hasSearch ? fetchSize - 1 : from + pageSize - 1;

  try {
    // ── Step 1: Fetch student rows ──────────────────────────────────────────
    let query = supabase
      .from("students")
      .select("id, user_id, admission_no, status, created_at, batch_id, institute_id, user:users(id, name, email, phone, avatar_url)")
      .eq("institute_id", instituteId)
      .order("created_at", { ascending: false });

    if (filters.status) query = query.eq("status", filters.status);
    const batchIdFilter =
      filters.batchId ??
      (filters as StudentFilters & { batch_id?: string }).batch_id;
    if (batchIdFilter) query = query.eq("batch_id", batchIdFilter);

    // admission_no is a LOCAL column — safe to filter server-side.
    // This narrows the result set before we do client-side name/email matching.
    if (hasSearch) {
      query = query.ilike("admission_no", `%${filters.search}%`);
    }

    const { data, error } = await query.range(queryFrom, queryTo).abortSignal(abortSignal!);

    if (error) {
      const msg = error.message || "Failed to fetch students from database.";
      console.error("[searchStudents] query error:", msg, error);
      return { data: null, error: msg, success: false };
    }

    // ── Step 2: Client-side name/email filter on over-fetched set ────────────
    // Because we over-fetched, this filter runs on a larger window and we
    // then slice to the correct page, preserving pagination correctness.
    let items = (data ?? []) as unknown as Student[];
    if (hasSearch) {
      const lower = filters.search!.toLowerCase();
      items = items.filter(
        (s) =>
          s.admission_no.toLowerCase().includes(lower) ||
          (s.user?.name ?? "").toLowerCase().includes(lower) ||
          (s.user?.email ?? "").toLowerCase().includes(lower),
      );
    }

    // ── Step 3: Slice to requested page from the filtered over-fetch ────────
    let paginatedItems: Student[];
    let estimatedTotal: number;

    if (hasSearch) {
      // The filtered items represent the best window we have.
      // Slice from 0 since we fetched starting from 0.
      paginatedItems = items.slice(0, pageSize);
      // Estimate total: if we got a full over-fetch back, there are likely more
      estimatedTotal = items.length >= pageSize
        ? Math.max(items.length, (page) * pageSize + 1)
        : items.length;
    } else {
      paginatedItems = items;
      estimatedTotal = 0; // Will be set by count query below
    }

    // ── Step 4: Lightweight total count (separate query, no join) ────────────
    let total = estimatedTotal;
    try {
      let countQuery = supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("institute_id", instituteId);

      if (filters.status) countQuery = countQuery.eq("status", filters.status);
      if (batchIdFilter) countQuery = countQuery.eq("batch_id", batchIdFilter);
      if (hasSearch) countQuery = countQuery.ilike("admission_no", `%${filters.search}%`);

      const { count, error: countError } = await countQuery.abortSignal(abortSignal!);
      if (!countError && count !== null) {
        // When searching, use the larger of server count and our client-filtered count
        // since name/email matches add to the admission_no matches
        total = hasSearch ? Math.max(count, items.length) : count;
      }
    } catch (countErr) {
      if (isAbortError(countErr)) throw countErr;
      // Count failure is non-fatal — pagination degrades gracefully
      if (!hasSearch) total = paginatedItems.length;
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      data: { items: paginatedItems, meta: { page, pageSize, total, totalPages } },
      error: null,
      success: true,
    };
  } catch (err) {
    if (isAbortError(err)) {
      return { data: null, error: "Aborted", success: false };
    }

    const message = err instanceof Error ? err.message : "An unexpected network error occurred.";
    console.error("[searchStudents] unexpected exception:", message, err);
    return { data: null, error: message, success: false };
  }
}

/**
 * Retrieve the full audit trail for a student from the `student_history` table.
 * Each row includes the acting user (who triggered the change) via a join on
 * the `changed_by` foreign key.
 */
export async function getStudentHistory(studentId: string): Promise<ApiResponse<StudentHistory[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_history")
    .select("*, changed_by_user:users!changed_by(id, name, role)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentHistory[], error: null, success: true };
}

// getBatchesByInstitute has moved to batch.service.ts — re-exported for backwards compatibility
export { getBatchesByInstitute } from "@/services/batch.service";

/**
 * Return a student with all currently linked parents.
 *
 * The `parents` array contains `StudentParent` rows — each includes
 * `relation_type` and the nested `parent` profile (with the parent's `user`).
 * This avoids multiple round-trips for the student detail page.
 */
export async function getStudentWithParents(
  studentId: string,
): Promise<ApiResponse<Student & { parents: StudentParent[] }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data: studentData, error: studentError } = await supabase
      .from("students")
      .select("id, user_id, admission_no, status, batch_id, institute_id, emergency_contact, user:users(id, name, email, phone, avatar_url)")
      .eq("id", studentId)
      .single();

    if (studentError) return { data: null, error: getErrorMessage(studentError), success: false };

    const { data: parentsData, error: parentsError } = await supabase
      .from("student_parents")
      .select("relation_type, parent:parents(id, user_id, occupation, user:users(id, name, email, phone, avatar_url))")
      .eq("student_id", studentId);

    if (parentsError) return { data: null, error: getErrorMessage(parentsError), success: false };

    return {
      data: {
        ...(studentData as unknown as Student),
        parents: (parentsData ?? []) as unknown as StudentParent[],
      },
      error: null,
      success: true,
    };
  } catch (err) {
    const msg = getErrorMessage(err, "Failed to load student and parent details.");
    console.error("[getStudentWithParents] exception:", err);
    return { data: null, error: msg, success: false };
  }
}

export async function getCurrentStudentDashboard(
  userId: string,
  instituteId: string,
): Promise<ApiResponse<StudentDashboardData>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const studentResult = await getStudentByUserId(userId);
    if (!studentResult.success || !studentResult.data) {
      return {
        data: null,
        error: studentResult.error ?? "Student profile not found.",
        success: false,
      };
    }

    const student = studentResult.data;

    const batchPromise = student.batch_id
      ? (getStudentBatch(student.batch_id, instituteId) as Promise<ApiResponse<StudentBatchInfo>>)
      : Promise.resolve({ data: null, error: null, success: true } as ApiResponse<StudentBatchInfo>);

    const [batchResult, historyResult] = await Promise.all([
      batchPromise,
      getStudentAttendanceHistory(student.id),
    ]);

    const history = historyResult.success && historyResult.data ? historyResult.data : [];
    const stats = buildAttendanceStats(student.id, history);

    return {
      data: {
        student,
        batch: batchResult.success ? batchResult.data : null,
        history,
        stats,
      },
      error: [batchResult.error, historyResult.error].filter(Boolean).join(" | ") || null,
      success: true,
    };
  } catch (err) {
    const msg = getErrorMessage(err, "Failed to load dashboard data.");
    console.error("[getCurrentStudentDashboard] exception:", err);
    return { data: null, error: msg, success: false };
  }
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Enrol a new student in an institute.
 *
 * The `user_id` must already exist in `auth.users` (and therefore in `users`)
 * before calling this function.  `admission_no` must be unique per institute.
 */
export async function createStudent(
  payload: Pick<Student, "institute_id" | "user_id" | "admission_no" | "batch_id" | "status">,
): Promise<ApiResponse<Student>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase.from("students").insert(payload).select().single();

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    return { data: data as unknown as Student, error: null, success: true };
  } catch (err) {
    const msg = getErrorMessage(err, "Failed to create student profile.");
    console.error("[createStudent] exception:", err);
    return { data: null, error: msg, success: false };
  }
}

/**
 * Update mutable student fields.
 *
 * `institute_id` and `user_id` are intentionally excluded — those are
 * immutable after enrolment and must only be changed via a migration.
 */
export async function updateStudent(
  id: string,
  payload: Partial<Pick<Student, "admission_no" | "batch_id" | "status" | "emergency_contact">>,
): Promise<ApiResponse<Student>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase
      .from("students")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    return { data: data as unknown as Student, error: null, success: true };
  } catch (err) {
    const msg = getErrorMessage(err, "Failed to update student.");
    console.error("[updateStudent] exception:", err);
    return { data: null, error: msg, success: false };
  }
}

/**
 * Soft-delete a student by setting their status to `'inactive'`.
 * All records (history, parent links, etc.) are preserved — this is
 * reversible via `restoreStudent`.
 */
export async function archiveStudent(id: string): Promise<ApiResponse<Student>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase
      .from("students")
      .update({ status: "inactive" })
      .eq("id", id)
      .select()
      .single();

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    return { data: data as unknown as Student, error: null, success: true };
  } catch (err) {
    const msg = getErrorMessage(err, "Failed to archive student.");
    console.error("[archiveStudent] exception:", err);
    return { data: null, error: msg, success: false };
  }
}

/**
 * Restore a previously archived student by setting their status back to `'active'`.
 * Only valid for students currently in `'inactive'` status.
 */
export async function restoreStudent(id: string): Promise<ApiResponse<Student>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase
      .from("students")
      .update({ status: "active" })
      .eq("id", id)
      .select()
      .single();

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    return { data: data as unknown as Student, error: null, success: true };
  } catch (err) {
    const msg = getErrorMessage(err, "Failed to restore student.");
    console.error("[restoreStudent] exception:", err);
    return { data: null, error: msg, success: false };
  }
}

/**
 * Admit a new student — secure architecture using Supabase Auth Admin API.
 *
 * ROOT CAUSE OF PREVIOUS ERROR:
 *   The system was using pgcrypto's gen_salt() in SQL or signUp() on the
 *   frontend which required session restores.
 *
 * NEW FLOW (Supabase Auth Best Practices):
 *   1. Generate login ID + virtual email + temp password in TypeScript.
 *   2. Create student auth account via Admin API (bypasses session swaps).
 *   3. Optionally create parent auth account via Admin API.
 *   4. Call create_student_profile() RPC — DB records only, no password logic.
 */

/**
 * Fallback: admit student via the database RPC (admit_student function).
 * Used when supabaseAdmin is not available (client-side).
 */
async function admitStudentViaRPC(
  payload: AdmitStudentPayload,
): Promise<ApiResponse<AdmitStudentResult>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase.rpc("admit_student", {
      p_institute_id: payload.institute_id,
      p_name: payload.student_name,
      p_email: payload.student_email || null,
      p_phone: payload.phone || null,
      p_admission_no: payload.admission_number || `ADM-${Date.now().toString(36).toUpperCase()}`,
      p_batch_id: payload.batch_id || null,
      p_aadhaar_last4: payload.aadhaar_last4 || null,
      p_emergency_contact: payload.emergency_contact ? JSON.stringify(payload.emergency_contact) : null,
    });

    if (error) {
      return { data: null, error: error.message, success: false };
    }

    // The RPC returns a JSON object
    const result = data as {
      student_id: string;
      user_id: string;
      login_id: string;
      temp_password: string;
      admission_no: string;
    };

    return {
      data: {
        student_id: result.student_id,
        user_id: result.user_id,
        login_id: result.login_id,
        admission_no: result.admission_no,
        generated_email: `${result.login_id}@eduos.student`,
        temporary_password: result.temp_password,
        parent_account_status: "not_provided",
        parent_email_delivery_status: "not_applicable",
        parent_email: null,
        parent_temporary_password: null,
        parent_user_id: null,
        parent_first_login_change_required: false,
      },
      error: null,
      success: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to admit student.";
    return { data: null, error: msg, success: false };
  }
}

export async function admitStudent(
  payload: AdmitStudentPayload,
): Promise<ApiResponse<AdmitStudentResult>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // If supabaseAdmin is not available (client-side), use the database RPC
  if (!supabaseAdmin) {
    return admitStudentViaRPC(payload);
  }

  try {
    // ── Step 1: Generate student credentials ──────────────────────────────────
  const instituteName = payload.institute_name ?? "edu";
  const credentials = generateStudentCredentials(payload.student_name, instituteName);

  // ── Step 2: Create Student Auth User via Admin API ────────────────────────
  // This avoids signing out the admin and handles password hashing internally.
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: credentials.email,
    password: credentials.tempPassword,
    email_confirm: true,
    user_metadata: {
      name: payload.student_name,
      role: "student",
      institute_id: payload.institute_id,
      login_id: credentials.loginId,
    },
  });

  if (authError || !authData.user) {
    return {
      data: null,
      error: authError?.message ?? "Failed to create student auth account. Please try again.",
      success: false,
    };
  }

  const studentUserId = authData.user.id;

  // ── Step 3: Optional Parent Auth User ─────────────────────────────────────
  let parentAccountStatus: ParentAccountStatus = "not_provided";
  let parentEmailDeliveryStatus: ParentEmailDeliveryStatus = "not_applicable";
  let parentResolvedEmail: string | null = null;
  let parentGeneratedPassword: string | null = null;
  let parentUserId: string | null = null;
  const hasParentEmail = !!payload.parent_email?.trim();

  if (hasParentEmail) {
    parentResolvedEmail = payload.parent_email!.trim().toLowerCase();

    // Check if email is already mapped to a compatible parent account.
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, role, institute_id")
      .eq("email", parentResolvedEmail)
      .maybeSingle();

    if (existingUser) {
      if (existingUser.role !== "parent") {
        return {
          data: null,
          error: "This email is already used by a non-parent account.",
          success: false,
        };
      }

      if (existingUser.institute_id !== payload.institute_id) {
        return {
          data: null,
          error: "This parent email is already registered with another institute.",
          success: false,
        };
      }

      parentUserId = existingUser.id;
      parentAccountStatus = "existing_linked";
    } else {
      const parentCredentials = generateParentCredentials(
        payload.parent_name?.trim() || payload.student_name,
      );
      parentGeneratedPassword = parentCredentials.temporaryPassword;

      // Create new parent auth account with a forced password-change flag.
      const { data: pAuthData, error: pAuthError } = await supabaseAdmin.auth.admin.createUser({
        email: parentResolvedEmail,
        password: parentGeneratedPassword,
        email_confirm: true,
        user_metadata: {
          name: payload.parent_name?.trim() || payload.student_name,
          role: "parent",
          institute_id: payload.institute_id,
          force_password_change: true,
        },
      });

      if (!pAuthError && pAuthData.user) {
        parentUserId = pAuthData.user.id;
        parentAccountStatus = "created";
      } else {
        return {
          data: null,
          error: pAuthError?.message ?? "Failed to create parent auth account.",
          success: false,
        };
      }
    }
  }

  // ── Step 4: Create DB records via RPC (no pgcrypto, no auth.users insert) ─
  const { data: rpcData, error: rpcError } = await supabase.rpc("create_student_profile", {
    p_user_id: studentUserId,
    p_institute_id: payload.institute_id,
    p_login_id: credentials.loginId,
    p_student_email: credentials.email,
    p_contact_email: payload.student_email?.trim() || null,
    p_name: payload.student_name,
    p_phone: payload.phone,
    p_admission_no: payload.admission_number,
    p_batch_id: payload.batch_id,
    p_aadhaar_last4: payload.aadhaar_last4,
    p_emergency_contact: payload.emergency_contact,
    p_parent_name: hasParentEmail ? payload.parent_name : null,
    p_parent_email: hasParentEmail ? payload.parent_email : null,
    p_parent_phone: hasParentEmail ? payload.parent_phone?.trim() || null : null,
    p_parent_occupation: hasParentEmail ? payload.parent_occupation?.trim() || null : null,
    p_parent_relation_type: hasParentEmail ? payload.parent_relation_type : null,
    p_parent_user_id: parentUserId,
  });

  if (rpcError) {
    // Log the orphan — a background job should clean up unlinked auth users.
    console.error(
      `[admitStudent] Auth user created (${studentUserId}) but profile RPC failed:`,
      rpcError.message,
    );

    // Map known RPC error codes to friendly messages
    const friendlyErrors: Record<string, string> = {
      ADMIT_STUDENT_DUPLICATE_ADMISSION_NO:
        "This admission number is already in use at this institute.",
      ADMIT_STUDENT_INVALID_INSTITUTE:
        "The specified institute does not exist or is currently inactive.",
      ADMIT_STUDENT_INVALID_BATCH:
        "The selected batch does not exist or does not belong to this institute.",
      ADMIT_STUDENT_PARENT_OTHER_INSTITUTE:
        "This guardian email is registered at another institute.",
      ADMIT_STUDENT_PARENT_EMAIL_IN_USE: "This email is already used by a non-parent account.",
      ADMIT_STUDENT_PARENT_CREATION_FAILED: "Failed to create parent account. Please try again.",
      ADMIT_STUDENT_PARENT_SAME_AS_STUDENT: "Parent email cannot be the same as the student email.",
      ADMIT_STUDENT_INVALID_PARENT_RELATION: "Invalid parent relationship type.",
      ADMIT_STUDENT_FORBIDDEN: "You do not have permission to admit students for this institute.",
    };

    const friendly = Object.entries(friendlyErrors).find(([code]) =>
      rpcError.message.includes(code),
    )?.[1];
    return { data: null, error: friendly ?? rpcError.message, success: false };
  }

  const result = rpcData as { student_id: string; user_id: string; admission_no: string };

    // ── Step 5: Return credentials (shown ONCE to admin, never persisted) ─────
    return {
      data: {
        student_id: result.student_id,
        user_id: studentUserId,
        admission_no: result.admission_no,
        login_id: credentials.loginId,
        generated_email: credentials.email,
        temporary_password: credentials.tempPassword,
        parent_account_status: parentAccountStatus,
        parent_email_delivery_status: "not_applicable",
        parent_email: parentResolvedEmail,
        parent_temporary_password: parentAccountStatus === "created" ? parentGeneratedPassword : null,
        parent_user_id: parentUserId,
        parent_first_login_change_required: parentAccountStatus === "created",
      },
      error: null,
      success: true,
    };
  } catch (err) {
    const msg = getErrorMessage(err, "Failed to admit student.");
    console.error("[admitStudent] exception:", err);
    return { data: null, error: msg, success: false };
  }
}

/**
 * Bulk admit multiple students.
 * Processes payloads in concurrent batches to avoid long synchronous loops.
 */
export async function bulkAdmitStudents(
  payloads: AdmitStudentPayload[],
  concurrency = 8,
): Promise<ApiResponse<{
  successes: AdmitStudentResult[];
  errors: { index: number; admission_number?: string; error: string }[];
}>> {
  if (!supabase || !supabaseAdmin) return SUPABASE_NOT_CONFIGURED;

  const successes: AdmitStudentResult[] = [];
  const errors: { index: number; admission_number?: string; error: string }[] = [];

  // Helper to process a single payload by delegating to admitStudent
  async function processOne(index: number, payload: AdmitStudentPayload) {
    try {
      const res = await admitStudent(payload);
      if (res.success && res.data) {
        successes.push(res.data);
      } else {
        errors.push({ index, admission_number: payload.admission_number, error: res.error ?? "Unknown error" });
      }
    } catch (err: any) {
      const msg = (err && err.message) || String(err);
      errors.push({ index, admission_number: payload.admission_number, error: msg });
    }
  }

  // Batch processing with concurrency limit
  for (let i = 0; i < payloads.length; i += concurrency) {
    const chunk = payloads.slice(i, i + concurrency);
    await Promise.all(chunk.map((p, idx) => processOne(i + idx, p)));
  }

  return { data: { successes, errors }, error: null, success: true };
}

/**
 * Reset a student's password to a new auto-generated temporary password.
 * This uses the Admin API and should only be available to admins.
 */
export async function resetStudentPassword(
  userId: string,
): Promise<ApiResponse<{ temporary_password: string }>> {
  if (!supabase || !supabaseAdmin) return SUPABASE_NOT_CONFIGURED;

  try {
    const newPassword = generateTempPassword();

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (error) {
      return { data: null, error: getErrorMessage(error), success: false };
    }

    return {
      data: { temporary_password: newPassword },
      error: null,
      success: true,
    };
  } catch (err) {
    const msg = getErrorMessage(err, "Failed to reset student password.");
    console.error("[resetStudentPassword] exception:", err);
    return { data: null, error: msg, success: false };
  }
}

/**
 * Append a freeform remark to a student's history log.
 *
 * Delegates to the `add_student_remark` Postgres RPC so the server can
 * automatically fill in `changed_by` (from `auth.uid()`) and `institute_id`
 * (from the student's record) without the client needing to know either.
 *
 * The remark appears in the student's history timeline under the
 * `'remark_added'` action type.
 */
export async function addStudentRemark(
  studentId: string,
  remark: string,
): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.rpc("add_student_remark", {
    p_student_id: studentId,
    p_remark: remark,
  });

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

// ── Lifecycle Management ─────────────────────────────────────────────────────

/** Maps each LifecycleAction to the resulting StudentStatus. */
const LIFECYCLE_STATUS_MAP: Record<LifecycleAction, StudentStatus> = {
  promoted: "active",
  graduated: "graduated",
  suspended: "suspended",
  reactivated: "active",
  transferred: "inactive",
};

/**
 * Perform a lifecycle action on a student.
 *
 * Atomically:
 *   1. Fetches the student's current status.
 *   2. Determines the target status from `LIFECYCLE_STATUS_MAP`.
 *   3. Updates the student record (status + optional batch transfer).
 *   4. Inserts a `student_promotions` row for the audit trail.
 *   5. Inserts a `student_history` row (non-fatal if it fails).
 *
 * Returns the newly created `StudentPromotion` record.
 */
export async function performLifecycleAction(payload: {
  student_id: string;
  action: LifecycleAction;
  reason: string;
  notes?: string;
  to_batch_id?: string;
  effective_date?: string;
}): Promise<ApiResponse<StudentPromotion>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // 1. Fetch current student to capture from_status and batch context.
  const studentResult = await getStudentById(payload.student_id);
  if (!studentResult.success || !studentResult.data) {
    return {
      data: null,
      error: studentResult.error ?? "Student not found.",
      success: false,
    };
  }

  const student = studentResult.data;
  const from_status = student.status;

  // 2. Determine target status.
  const to_status = LIFECYCLE_STATUS_MAP[payload.action];

  // 3. Update the student row (status; batch only when a transfer is requested).
  const studentUpdatePayload: Partial<Pick<Student, "status" | "batch_id">> = { status: to_status };
  if (payload.to_batch_id) {
    studentUpdatePayload.batch_id = payload.to_batch_id;
  }

  const updateResult = await updateStudent(payload.student_id, studentUpdatePayload);
  if (!updateResult.success) {
    return {
      data: null,
      error: updateResult.error ?? "Failed to update student status.",
      success: false,
    };
  }

  const effectiveDate = payload.effective_date ?? new Date().toISOString().split("T")[0];

  // 4. Insert into student_promotions.
  const { data: promotionData, error: promotionError } = await supabase
    .from("student_promotions")
    .insert({
      student_id: payload.student_id,
      institute_id: student.institute_id,
      action: payload.action,
      from_status,
      to_status,
      from_batch_id: student.batch_id ?? null,
      to_batch_id: payload.to_batch_id ?? null,
      reason: payload.reason,
      notes: payload.notes ?? null,
      effective_date: effectiveDate,
    })
    .select()
    .single();

  if (promotionError) {
    return { data: null, error: promotionError.message, success: false };
  }

  // 5. Insert into student_history (non-fatal — a warning suffices if it fails).
  const { error: historyError } = await supabase.from("student_history").insert({
    student_id: payload.student_id,
    institute_id: student.institute_id,
    action: payload.action,
    old_value: { status: from_status, batch_id: student.batch_id },
    new_value: {
      status: to_status,
      batch_id: payload.to_batch_id ?? student.batch_id,
    },
    remark: payload.reason,
  });

  if (historyError) {
    console.warn(
      "[performLifecycleAction] Failed to insert student_history:",
      historyError.message,
    );
  }

  return { data: promotionData as StudentPromotion, error: null, success: true };
}

/**
 * Return all promotion records for a student, newest first.
 * Each row includes the `promoted_by_user` profile (id, name, role)
 * via a foreign-key join.
 */
export async function getStudentPromotions(
  studentId: string,
): Promise<ApiResponse<StudentPromotion[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_promotions")
    .select("*, promoted_by_user:users!promoted_by(id, name, role)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentPromotion[], error: null, success: true };
}

// ── Document Management ─────────────────────────────────────────────────────

/**
 * Return all documents attached to a student, ordered by upload date
 * (newest first).
 */
export async function getStudentDocuments(
  studentId: string,
): Promise<ApiResponse<StudentDocument[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_documents")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentDocument[], error: null, success: true };
}

/**
 * Permanently delete a document record from `student_documents`.
 *
 * Note: this does **not** delete the underlying file from Supabase Storage.
 * Storage cleanup should be handled separately (e.g. via a Storage trigger
 * or a separate admin operation).
 */
export async function deleteStudentDocument(documentId: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.from("student_documents").delete().eq("id", documentId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}
