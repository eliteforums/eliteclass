// ---------------------------------------------------------------------------
// EduOS — Staff Service
//
// All database operations for the `staff` table live here.
// "Staff" covers teachers, coordinators, and any other non-student employee
// of an institute.  Role-based access restrictions (e.g. only admin can
// remove staff) are enforced at the route/guard layer, not here.
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
import { cachedQuery, invalidateQueryCache } from "@/lib/query-cache";
import { generateStaffCredentials, generateTempPassword } from "@/utils/staffCredentials";
import { getErrorMessage } from "@/utils/helpers";
import type {
  Staff,
  ApiResponse,
  AdmitStaffPayload,
  AdmitStaffResult,
  UpdateStaffPayload,
  StaffAssignment,
  StaffBatchAssignment,
  StaffBatchOption,
  StaffCourseAssignment,
  StaffCourseOption,
} from "@/types";

// ── Shared "not configured" error response ───────────────────────────────────
// Returned by every service function when the Supabase client is null.

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

const STAFF_BATCH_CACHE_PREFIX = "staff-batches:";
const STAFF_COURSE_CACHE_PREFIX = "staff-courses:";
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_V4_RE.test(value);
}

function cacheKeyForStaffBatchAssignments(staffId: string): string {
  return `${STAFF_BATCH_CACHE_PREFIX}${staffId}`;
}

function cacheKeyForStaffCourseAssignments(staffId: string): string {
  return `${STAFF_COURSE_CACHE_PREFIX}${staffId}`;
}

export function invalidateStaffBatchAssignmentsCache(staffId?: string): void {
  invalidateQueryCache(staffId ? cacheKeyForStaffBatchAssignments(staffId) : STAFF_BATCH_CACHE_PREFIX);
}

export function invalidateStaffCourseAssignmentsCache(staffId?: string): void {
  invalidateQueryCache(staffId ? cacheKeyForStaffCourseAssignments(staffId) : STAFF_COURSE_CACHE_PREFIX);
}

const STAFF_DETAIL_SELECT = `
  id, institute_id, user_id, designation, department, qualification, joining_date,
  is_active, created_at, updated_at,
  user:users(id, name, email, avatar_url, phone),
  assignments:staff_assignments(
    id, institute_id, staff_id, batch_id, course_name, subject_name, assigned_at, assigned_by,
    batch:batches(id, name, academic_year, course_name)
  ),
  assigned_courses:staff_courses(
    id, institute_id, staff_id, course_id, assigned_at, assigned_by,
    course:lms_courses(id, title, status, created_at, updated_at)
  )
`;

async function syncStaffCourseAssignments(
  staffId: string,
  instituteId: string,
  assignedCourseIds: string[] = [],
): Promise<ApiResponse<StaffCourseAssignment[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const uniqueCourseIds = Array.from(new Set(assignedCourseIds.filter(Boolean)));

  const { data: existingRows, error: existingError } = await supabase
    .from("staff_courses")
    .select("id, course_id")
    .eq("staff_id", staffId)
    .eq("institute_id", instituteId);

  if (existingError) {
    return { data: null, error: existingError.message, success: false };
  }

  const existingCourseIds = new Set((existingRows ?? []).map((row) => row.course_id as string));
  const desiredCourseIds = new Set(uniqueCourseIds);
  const courseIdsToAdd = uniqueCourseIds.filter((courseId) => !existingCourseIds.has(courseId));
  const courseIdsToRemove = (existingRows ?? [])
    .map((row) => row.course_id as string)
    .filter((courseId) => !desiredCourseIds.has(courseId));

  if (courseIdsToAdd.length > 0) {
    const { data: validCourses, error: courseError } = await supabase
      .from("lms_courses")
      .select("id")
      .eq("institute_id", instituteId)
      .neq("status", "archived")
      .in("id", courseIdsToAdd);

    if (courseError) {
      return { data: null, error: courseError.message, success: false };
    }

    const validCourseIds = new Set((validCourses ?? []).map((course) => course.id));
    if (validCourseIds.size !== courseIdsToAdd.length) {
      return {
        data: null,
        error: "One or more selected courses are no longer available.",
        success: false,
      };
    }

    const { error: insertError } = await supabase.from("staff_courses").insert(
      courseIdsToAdd.map((courseId) => ({
        institute_id: instituteId,
        staff_id: staffId,
        course_id: courseId,
      })),
    );

    if (insertError) {
      const message = getErrorMessage(insertError);
      if (/duplicate key|unique/i.test(message)) {
        return { data: null, error: "One or more courses are already assigned to this staff member.", success: false };
      }
      return { data: null, error: message, success: false };
    }
  }

  if (courseIdsToRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from("staff_courses")
      .delete()
      .eq("staff_id", staffId)
      .eq("institute_id", instituteId)
      .in("course_id", courseIdsToRemove);

    if (deleteError) {
      return { data: null, error: deleteError.message, success: false };
    }
  }

  invalidateStaffCourseAssignmentsCache(staffId);

  const { data: finalRows, error: finalError } = await supabase
    .from("staff_courses")
    .select(
      "id, institute_id, staff_id, course_id, assigned_at, assigned_by, course:lms_courses(id, title, status, created_at, updated_at)",
    )
    .eq("staff_id", staffId)
    .eq("institute_id", instituteId)
    .order("assigned_at", { ascending: false });

  if (finalError) {
    return { data: null, error: finalError.message, success: false };
  }

  return { data: (finalRows ?? []) as StaffCourseAssignment[], error: null, success: true };
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Return all staff members for a given institute, newest first.
 * The joined `user` relation provides name, email, and avatar_url.
 */
export async function getStaffByInstitute(instituteId: string): Promise<ApiResponse<Staff[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("staff")
    .select(STAFF_DETAIL_SELECT)
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Staff[], error: null, success: true };
}

/**
 * Return the staff record linked to a Supabase auth user.
 * Called immediately after sign-in to hydrate teacher/staff-specific state.
 */
export async function getStaffByUserId(userId: string): Promise<ApiResponse<Staff>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("staff")
    .select(STAFF_DETAIL_SELECT)
    .eq("user_id", userId)
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Staff, error: null, success: true };
}

/**
 * Admit a new staff member.
 * Creates auth user via Admin API, then creates profile via RPC.
 * Now includes protection against duplicate emails and multi-tenant isolation.
 */
export async function admitStaff(
  payload: AdmitStaffPayload,
): Promise<ApiResponse<AdmitStaffResult>> {
  if (!supabase || !supabaseAdmin) return SUPABASE_NOT_CONFIGURED;

  // ── Step 0: Pre-check if email already exists in the system ──────────────
  const { data: existingUser, error: checkError } = await supabase
    .from("users")
    .select("id, institute_id, role")
    .eq("email", payload.email)
    .maybeSingle();

  if (checkError) {
    console.error("[admitStaff] Pre-check failed:", checkError.message);
  }

  let userId: string | null = null;
  let isExistingUser = false;

  if (existingUser) {
    // Check if the user belongs to the same institute
    if (existingUser.institute_id !== payload.institute_id) {
      return {
        data: null,
        error: "This email is already registered with another institute. Please use a unique email address.",
        success: false,
      };
    }

    // Check if they are already staff in this institute
    const { data: existingStaff } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", existingUser.id)
      .maybeSingle();

    if (existingStaff) {
      return {
        data: null,
        error: "This person is already admitted as a staff member in your institute.",
        success: false,
      };
    }

    // Reuse existing user ID
    userId = existingUser.id;
    isExistingUser = true;
  }

  // ── Step 1: Generate temporary password ──────────────────────────────────
  const { temporaryPassword } = generateStaffCredentials(payload.name);

  // ── Step 2: Create Auth User (only if they don't exist yet) ──────────────
  if (!isExistingUser) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: payload.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        name: payload.name,
        role: "staff",
        institute_id: payload.institute_id,
        force_password_change: true,
      },
    });

    if (authError || !authData.user) {
      return {
        data: null,
        error: authError?.message ?? "Failed to create staff auth account.",
        success: false,
      };
    }
    userId = authData.user.id;
  }

  // ── Step 3: Create Profile via RPC ───────────────────────────────────────
  const { data: rpcData, error: rpcError } = await supabase.rpc("create_staff_profile", {
    p_user_id: userId,
    p_institute_id: payload.institute_id,
    p_name: payload.name,
    p_email: payload.email,
    p_phone: payload.phone,
    p_designation: payload.designation,
    p_department: payload.department,
    p_qualification: payload.qualification,
    p_joining_date: payload.joining_date,
    p_role_name: payload.role_name,
  });

  if (rpcError) {
    console.error("[admitStaff] Profile creation failed:", rpcError.message);
    return { data: null, error: rpcError.message, success: false };
  }

  const result = rpcData as { staff_id: string };

  // ── Step 4: Handle Assignments ───────────────────────────────────────────
  if (payload.assignments && payload.assignments.length > 0) {
    const assignmentRows = payload.assignments.map((a) => ({
      institute_id: payload.institute_id,
      staff_id: result.staff_id,
      batch_id: a.batch_id,
      course_name: a.course_name,
      subject_name: a.subject_name,
    }));

    await supabase.from("staff_assignments").insert(assignmentRows);
  }

  const courseSyncResult = await syncStaffCourseAssignments(
    result.staff_id,
    payload.institute_id,
    payload.assigned_course_ids ?? [],
  );

  if (!courseSyncResult.success) {
    return {
      data: null,
      error: courseSyncResult.error ?? "Failed to save assigned courses.",
      success: false,
    };
  }

  return {
    data: {
      staff_id: result.staff_id,
      user_id: userId!,
      email: payload.email,
      temporary_password: isExistingUser ? "REUSED_EXISTING_ACCOUNT" : temporaryPassword,
      name: payload.name,
      role_name: payload.role_name,
      assigned_course_ids: payload.assigned_course_ids ?? [],
      assignments: payload.assignments,
    },
    error: null,
    success: true,
  };
}

/**
 * Return all assignments for a staff member.
 */
export async function getStaffAssignments(staffId: string): Promise<ApiResponse<StaffAssignment[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("staff_assignments")
    .select("*, batch:batches(*)")
    .eq("staff_id", staffId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StaffAssignment[], error: null, success: true };
}

/**
 * Return explicit batch-only assignments for a staff member.
 * Batch-only rows are modeled as staff_assignments with NULL course + subject.
 */
export async function getStaffBatchAssignments(
  staffId: string,
): Promise<ApiResponse<StaffBatchAssignment[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  if (!isValidUuid(staffId)) {
    return { data: null, error: "Invalid staff id.", success: false };
  }

  const cacheKey = cacheKeyForStaffBatchAssignments(staffId);

  try {
    const data = await cachedQuery(cacheKey, 30_000, async () => {
      const { data: rows, error } = await supabase
        .from("staff_assignments")
        .select(
          "id, institute_id, staff_id, batch_id, assigned_at, assigned_by, batch:batches(id, institute_id, name, academic_year, batch_code, course_name, start_date, end_date, capacity, is_active, status, archived_at, created_at, updated_at)",
        )
        .eq("staff_id", staffId)
        .not("batch_id", "is", null)
        .is("course_name", null)
        .is("subject_name", null)
        .order("assigned_at", { ascending: false });

      if (error) throw error;
      return (rows ?? []) as StaffBatchAssignment[];
    });

    return { data, error: null, success: true };
  } catch (err) {
    return { data: null, error: getErrorMessage(err), success: false };
  }
}

/**
 * Return active batches that can be assigned to staff.
 */
export async function getAssignableBatchOptions(
  instituteId: string,
): Promise<ApiResponse<StaffBatchOption[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  if (!isValidUuid(instituteId)) {
    return { data: null, error: "Invalid institute id.", success: false };
  }

  const { data, error } = await supabase
    .from("batches")
    .select("id, name, academic_year, course_name, is_active, status")
    .eq("institute_id", instituteId)
    .eq("is_active", true)
    .or("status.eq.active,status.is.null")
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message, success: false };

  const options = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    academic_year: row.academic_year,
    course_name: row.course_name,
    label: row.course_name
      ? `${row.name} (${row.academic_year}) • ${row.course_name}`
      : `${row.name} (${row.academic_year})`,
  })) as StaffBatchOption[];

  return { data: options, error: null, success: true };
}

/**
 * Add a new explicit batch assignment row for a staff member.
 */
export async function assignBatchToStaff(payload: {
  institute_id: string;
  staff_id: string;
  batch_id: string;
  assigned_by?: string | null;
}): Promise<ApiResponse<StaffBatchAssignment>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  if (!isValidUuid(payload.institute_id) || !isValidUuid(payload.staff_id) || !isValidUuid(payload.batch_id)) {
    return { data: null, error: "Invalid assignment payload.", success: false };
  }

  const { data: activeBatch, error: batchError } = await supabase
    .from("batches")
    .select("id")
    .eq("id", payload.batch_id)
    .eq("institute_id", payload.institute_id)
    .eq("is_active", true)
    .or("status.eq.active,status.is.null")
    .maybeSingle();

  if (batchError) return { data: null, error: batchError.message, success: false };
  if (!activeBatch) {
    return {
      data: null,
      error: "Selected batch is invalid, inactive, or does not belong to this institute.",
      success: false,
    };
  }

  const { data, error } = await supabase
    .from("staff_assignments")
    .insert({
      institute_id: payload.institute_id,
      staff_id: payload.staff_id,
      batch_id: payload.batch_id,
      course_name: null,
      subject_name: null,
      assigned_by: payload.assigned_by ?? null,
    })
    .select(
      "id, institute_id, staff_id, batch_id, assigned_at, assigned_by, batch:batches(id, institute_id, name, academic_year, batch_code, course_name, start_date, end_date, capacity, is_active, status, archived_at, created_at, updated_at)",
    )
    .single();

  if (error) {
    const message = getErrorMessage(error);
    if (/duplicate key|unique/i.test(message)) {
      return { data: null, error: "Batch already assigned to this staff member.", success: false };
    }
    return { data: null, error: message, success: false };
  }

  invalidateStaffBatchAssignmentsCache(payload.staff_id);
  return { data: data as StaffBatchAssignment, error: null, success: true };
}

/**
 * Remove a batch-only assignment row.
 */
export async function removeStaffBatchAssignment(payload: {
  assignment_id: string;
  staff_id: string;
}): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  if (!isValidUuid(payload.assignment_id) || !isValidUuid(payload.staff_id)) {
    return { data: null, error: "Invalid assignment id.", success: false };
  }

  const { error } = await supabase
    .from("staff_assignments")
    .delete()
    .eq("id", payload.assignment_id)
    .eq("staff_id", payload.staff_id)
    .is("course_name", null)
    .is("subject_name", null);

  if (error) return { data: null, error: error.message, success: false };

  invalidateStaffBatchAssignmentsCache(payload.staff_id);
  return { data: null, error: null, success: true };
}

/**
 * Return explicit staff_courses rows for a staff member.
 */
export async function getStaffCourses(staffId: string): Promise<ApiResponse<StaffCourseAssignment[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  if (!isValidUuid(staffId)) {
    return { data: null, error: "Invalid staff id.", success: false };
  }

  const cacheKey = cacheKeyForStaffCourseAssignments(staffId);

  try {
    const data = await cachedQuery(cacheKey, 30_000, async () => {
      const { data: rows, error } = await supabase
        .from("staff_courses")
        .select(
          "id, institute_id, staff_id, course_id, assigned_at, assigned_by, course:lms_courses(id, title, status, created_at, updated_at)",
        )
        .eq("staff_id", staffId)
        .order("assigned_at", { ascending: false });

      if (error) throw error;
      return (rows ?? []) as StaffCourseAssignment[];
    });

    return { data, error: null, success: true };
  } catch (err) {
    return { data: null, error: getErrorMessage(err), success: false };
  }
}

/**
 * Return LMS courses that can be assigned to staff.
 */
export async function getAssignableCourseOptions(
  instituteId: string,
): Promise<ApiResponse<StaffCourseOption[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  if (!isValidUuid(instituteId)) {
    return { data: null, error: "Invalid institute id.", success: false };
  }

  const { data, error } = await supabase
    .from("lms_courses")
    .select("id, title, status")
    .eq("institute_id", instituteId)
    .neq("status", "archived")
    .order("title", { ascending: true });

  if (error) return { data: null, error: error.message, success: false };

  const options = (data ?? []).map((row) => ({
    id: row.id,
    name: row.title,
    code: null,
    status: row.status,
    label: row.title,
  })) as StaffCourseOption[];

  return { data: options, error: null, success: true };
}

/**
 * Assign a single course to a staff member via staff_courses.
 */
export async function assignCourseToStaff(payload: {
  institute_id: string;
  staff_id: string;
  course_id: string;
  assigned_by?: string | null;
}): Promise<ApiResponse<StaffCourseAssignment>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  if (
    !isValidUuid(payload.institute_id) ||
    !isValidUuid(payload.staff_id) ||
    !isValidUuid(payload.course_id)
  ) {
    return { data: null, error: "Invalid assignment payload.", success: false };
  }

  const { data: staffRow, error: staffError } = await supabase
    .from("staff")
    .select("id")
    .eq("id", payload.staff_id)
    .eq("institute_id", payload.institute_id)
    .maybeSingle();

  if (staffError) return { data: null, error: staffError.message, success: false };
  if (!staffRow) {
    return { data: null, error: "Staff member not found for this institute.", success: false };
  }

  const { data: linkedCourse, error: courseError } = await supabase
    .from("lms_courses")
    .select("id, status")
    .eq("id", payload.course_id)
    .eq("institute_id", payload.institute_id)
    .neq("status", "archived")
    .maybeSingle();

  if (courseError) return { data: null, error: courseError.message, success: false };
  if (!linkedCourse) {
    return {
      data: null,
      error: "Selected course is invalid or does not belong to this institute.",
      success: false,
    };
  }

  const { data: existingAssignment, error: existingError } = await supabase
    .from("staff_courses")
    .select("id")
    .eq("staff_id", payload.staff_id)
    .eq("course_id", payload.course_id)
    .maybeSingle();

  if (existingError) return { data: null, error: existingError.message, success: false };
  if (existingAssignment) {
    return { data: null, error: "Course already assigned to this staff member.", success: false };
  }

  const { data, error } = await supabase
    .from("staff_courses")
    .insert({
      institute_id: payload.institute_id,
      staff_id: payload.staff_id,
      course_id: payload.course_id,
      assigned_by: payload.assigned_by ?? null,
    })
    .select(
      "id, institute_id, staff_id, course_id, assigned_at, assigned_by, course:lms_courses(id, title, status, created_at, updated_at)",
    )
    .single();

  if (error) {
    const message = getErrorMessage(error);
    if (/duplicate key|unique/i.test(message)) {
      return { data: null, error: "Course already assigned to this staff member.", success: false };
    }
    return { data: null, error: message, success: false };
  }

  invalidateStaffCourseAssignmentsCache(payload.staff_id);
  return { data: data as StaffCourseAssignment, error: null, success: true };
}

/**
 * Remove a staff_courses assignment row.
 */
export async function removeStaffCourse(payload: {
  assignment_id: string;
  staff_id: string;
}): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  if (!isValidUuid(payload.assignment_id) || !isValidUuid(payload.staff_id)) {
    return { data: null, error: "Invalid assignment id.", success: false };
  }

  const { error } = await supabase
    .from("staff_courses")
    .delete()
    .eq("id", payload.assignment_id)
    .eq("staff_id", payload.staff_id);

  if (error) return { data: null, error: error.message, success: false };

  invalidateStaffCourseAssignmentsCache(payload.staff_id);
  return { data: null, error: null, success: true };
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Add a new staff member to an institute.
 *
 * The `user_id` must already exist in `auth.users` (and therefore in `users`)
 * before calling this function.  One user can only hold one staff record per
 * institute — duplicates are rejected by the database's unique constraint.
 */
export async function createStaff(
  payload: Pick<Staff, "institute_id" | "user_id" | "designation" | "department">,
): Promise<ApiResponse<Staff>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.from("staff").insert(payload).select().single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Staff, error: null, success: true };
}

/**
 * Update a staff member's designation and/or department.
 *
 * `institute_id` and `user_id` are intentionally excluded from the payload —
 * those are immutable after creation and must only be changed via a migration.
 */
export async function updateStaff(
  id: string,
  payload: UpdateStaffPayload,
): Promise<ApiResponse<Staff>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { assigned_course_ids, fullName, email, phone, ...staffPayload } = payload;

  const { data: existingStaff, error: staffLookupError } = await supabase
    .from("staff")
    .select("id, user_id, institute_id")
    .eq("id", id)
    .single();

  if (staffLookupError || !existingStaff) {
    return { data: null, error: staffLookupError?.message ?? "Staff record not found.", success: false };
  }

  const authUpdate = await supabaseAdmin.auth.admin.updateUserById(existingStaff.user_id, {
    email,
    user_metadata: { name: fullName },
  });

  if (authUpdate.error) {
    return { data: null, error: authUpdate.error.message, success: false };
  }

  const { error: userUpdateError } = await supabase
    .from("users")
    .update({ name: fullName, email, phone })
    .eq("id", existingStaff.user_id);

  if (userUpdateError) {
    return { data: null, error: userUpdateError.message, success: false };
  }

  const { data, error } = await supabase
    .from("staff")
    .update(staffPayload)
    .eq("id", id)
    .select(STAFF_DETAIL_SELECT)
    .single();

  if (error) return { data: null, error: error.message, success: false };

  if (assigned_course_ids) {
    const syncResult = await syncStaffCourseAssignments(
      id,
      existingStaff.institute_id,
      assigned_course_ids,
    );

    if (!syncResult.success) {
      return {
        data: null,
        error: syncResult.error ?? "Failed to update assigned courses.",
        success: false,
      };
    }

    (data as Staff).assigned_courses = syncResult.data ?? [];
  }

  return { data: data as Staff, error: null, success: true };
}

/**
 * Permanently remove a staff record from an institute.
 *
 * This does NOT delete the linked `users` row — the person's auth account
 * remains intact.  To fully offboard a user, also call `signOut()` and
 * deactivate the user via the admin API if required.
 */
export async function removeStaff(id: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.from("staff").delete().eq("id", id);

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

/**
 * Reset a staff member's password to a new auto-generated temporary password.
 */
export async function resetStaffPassword(
  userId: string,
): Promise<ApiResponse<{ temporary_password: string }>> {
  if (!supabase || !supabaseAdmin) return SUPABASE_NOT_CONFIGURED;

  const newPassword = generateTempPassword();

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) {
    return { data: null, error: error.message, success: false };
  }

  return {
    data: { temporary_password: newPassword },
    error: null,
    success: true,
  };
}
