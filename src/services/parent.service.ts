// ---------------------------------------------------------------------------
// EduOS — Parent Service
//
// All database operations for the `parents` table and the
// `student_parents` junction table live here.
//
// Key responsibilities:
//   - Look up parent profiles (by user or institute)
//   - Search for parents by email for the "link parent" modal
//   - Manage the many-to-many link between students and parents
//   - Expose relation data for admin dashboards and messaging features
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
import { generateTempPassword } from "@/utils/studentCredentials";
import { getErrorMessage } from "@/utils/helpers";
import type { Parent, StudentParent, ApiResponse } from "@/types";

// ── Shared "not configured" error response ───────────────────────────────────
// Returned by every service function when the Supabase client is null.

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Return the parent profile linked to a Supabase auth user.
 * Optionally filters by institute_id to support multi-tenant parents.
 */
export async function getParentByUserId(
  userId: string,
  instituteId?: string,
): Promise<ApiResponse<Parent>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  let query = supabase.from("parents").select("*, user:users(*)").eq("user_id", userId);

  if (instituteId) {
    query = query.eq("institute_id", instituteId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) return { data: null, error: error.message, success: false };
  if (!data) return { data: null, error: "Parent profile not found.", success: false };
  return { data: data as Parent, error: null, success: true };
}

/**
 * Fetch all parents for an institute.
 */
export async function getParentsByInstitute(instituteId: string): Promise<ApiResponse<Parent[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase
      .from("parents")
      .select("id, user_id, occupation, created_at, user:users(id, name, email, phone, avatar_url)")
      .eq("institute_id", instituteId);

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    return { data: data as Parent[], error: null, success: true };
  } catch (err) {
    const msg = getErrorMessage(err, "Failed to load parents.");
    console.error("[getParentsByInstitute] exception:", err);
    return { data: null, error: msg, success: false };
  }
}

/**
 * Return all student–parent relationships for a given institute,
 * with both the `student` and `parent` records joined inline.
 *
 * Note: Supabase filters on embedded relations use the table column directly
 * in the `.eq()` call (not via the alias), so we filter on `students.institute_id`.
 */
export async function getStudentParentRelations(
  instituteId: string,
): Promise<ApiResponse<StudentParent[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_parents")
    .select("*, student:students!inner(*), parent:parents(*, user:users(*))")
    .eq("student.institute_id", instituteId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentParent[], error: null, success: true };
}

/**
 * Search for parents within an institute by email address.
 *
 * Returns up to 10 partial matches — intended for the "link parent" modal
 * where the admin types incrementally to find an existing parent account
 * before creating a new link.
 */
export async function searchParentsByEmail(
  instituteId: string,
  email: string,
): Promise<ApiResponse<Parent[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const term = `%${email.trim()}%`;

  const { data, error } = await supabase
    .from("parents")
    .select("*, user:users!inner(*)")
    .eq("institute_id", instituteId)
    .filter("user.email", "ilike", term)
    .limit(10);

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Parent[], error: null, success: true };
}

/**
 * Return all parents currently linked to a student.
 *
 * Each row is a `StudentParent` record and includes:
 *  - `relation_type`   — the relationship (father, mother, guardian, etc.)
 *  - `parent`          — the full parent profile with their `user` nested inside
 *
 * Results are ordered by link creation date (oldest first) so the primary
 * guardian appears at the top of the list.
 */
export async function getParentsForStudent(
  studentId: string,
): Promise<ApiResponse<StudentParent[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_parents")
    .select("*, parent:parents(*, user:users(*))")
    .eq("student_id", studentId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentParent[], error: null, success: true };
}

/**
 * Check whether a specific student–parent link already exists in the database.
 *
 * Returns `true` when the link is present, `false` when it is not (or when
 * Supabase is not configured).  Call this before `linkParentToStudent` to
 * surface a friendly duplicate error in the UI instead of relying on a DB
 * constraint violation.
 */
export async function checkParentStudentLink(
  studentId: string,
  parentId: string,
): Promise<boolean> {
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("student_parents")
    .select("id")
    .eq("student_id", studentId)
    .eq("parent_id", parentId)
    .maybeSingle();

  if (error || !data) return false;
  return true;
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a new entry in the `student_parents` junction table.
 *
 * Duplicate inserts (same `student_id` + `parent_id` pair) will be rejected
 * by the database's unique constraint — the error is surfaced via `ApiResponse`.
 * Use `checkParentStudentLink` before calling this to show a nicer message.
 */
export async function linkParentToStudent(
  payload: Pick<StudentParent, "student_id" | "parent_id" | "relation_type">,
): Promise<ApiResponse<StudentParent>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.from("student_parents").insert(payload).select().single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentParent, error: null, success: true };
}

/**
 * Remove the link between a student and a parent.
 *
 * Both IDs are required to avoid accidentally deleting all relationships
 * for either party.  A successful delete returns `{ data: null, success: true }`.
 */
export async function unlinkParentFromStudent(
  studentId: string,
  parentId: string,
): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase
    .from("student_parents")
    .delete()
    .eq("student_id", studentId)
    .eq("parent_id", parentId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

/**
 * Find an existing parent by email within an institute (exact match).
 *
 * Used during admission to check if a parent account already exists
 * before creating a new one. Returns the parent if found, null if not.
 *
 * This enables the "one parent → multiple students" workflow.
 */
export async function findParentByEmail(
  instituteId: string,
  email: string,
): Promise<ApiResponse<Parent | null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const normalized = email.trim().toLowerCase();

  const { data: userRows, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("institute_id", instituteId)
    .eq("role", "parent")
    .ilike("email", normalized)
    .limit(1);

  if (userError) return { data: null, error: userError.message, success: false };
  const userRow = userRows?.[0];
  if (!userRow) return { data: null, error: null, success: true };

  const { data, error } = await supabase
    .from("parents")
    .select("*, user:users(*)")
    .eq("institute_id", instituteId)
    .eq("user_id", userRow.id)
    .maybeSingle();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Parent | null, error: null, success: true };
}

/**
 * Find an existing parent by phone within an institute (exact match).
 * Returns the parent if found, null if not.
 */
export async function findParentByPhone(
  instituteId: string,
  phone: string,
): Promise<ApiResponse<Parent | null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const normalized = phone.trim();

  const { data: userRows, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("institute_id", instituteId)
    .eq("role", "parent")
    .eq("phone", normalized)
    .limit(1);

  if (userError) return { data: null, error: userError.message, success: false };
  const userRow = userRows?.[0];
  if (!userRow) return { data: null, error: null, success: true };

  const { data, error } = await supabase
    .from("parents")
    .select("*, user:users(*)")
    .eq("institute_id", instituteId)
    .eq("user_id", userRow.id)
    .maybeSingle();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Parent | null, error: null, success: true };
}

/**
 * Find an existing parent by email OR phone. Prefer email if provided.
 * Used to avoid duplicate parent creation during admission.
 */
export async function findExistingParent(
  instituteId: string,
  email?: string | null,
  phone?: string | null,
): Promise<ApiResponse<Parent | null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  if (email) {
    const byEmail = await findParentByEmail(instituteId, email);
    if (byEmail.success && byEmail.data) return byEmail;
  }

  if (phone) {
    const byPhone = await findParentByPhone(instituteId, phone);
    if (byPhone.success && byPhone.data) return byPhone;
  }

  return { data: null, error: null, success: true };
}

/**
 * Create a new parent record after their auth user has been created.
 *
 * Call this after the backend creates:
 *   1. Auth user in Supabase Auth
 *   2. `users` profile row (via the `handle_new_user` trigger)
 *
 * Then call this function to create the `parents` record, followed by
 * `linkParentToStudent()` to create the relationship.
 *
 * Used in the admission flow when creating a new parent for a student.
 */
export async function createParent(payload: {
  institute_id: string;
  user_id: string;
  occupation?: string | null;
}): Promise<ApiResponse<Parent>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("parents")
    .insert({
      institute_id: payload.institute_id,
      user_id: payload.user_id,
      occupation: payload.occupation ?? null,
    })
    .select("*, user:users(*)")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Parent, error: null, success: true };
}

/**
 * Fetch a single parent by ID.
 */
export async function getParentById(id: string): Promise<ApiResponse<Parent & { children_count: number }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data: parentData, error: parentError } = await supabase
      .from("parents")
      .select("*, user:users(*)")
      .eq("id", id)
      .single();

    if (parentError) return { data: null, error: getErrorMessage(parentError), success: false };

    const { data: childrenData } = await supabase
      .from("student_parents")
      .select("student_id")
      .eq("parent_id", id);

    return {
      data: {
        ...(parentData as Parent),
        children_count: childrenData?.length ?? 0,
      },
      error: null,
      success: true,
    };
  } catch (err) {
    const msg = getErrorMessage(err, "Failed to load parent details.");
    console.error("[getParentById] exception:", err);
    return { data: null, error: msg, success: false };
  }
}

/**
 * Reset a parent's password to a new auto-generated temporary password.
 */
export async function resetParentPassword(
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
    const msg = getErrorMessage(err, "Failed to reset parent password.");
    console.error("[resetParentPassword] exception:", err);
    return { data: null, error: msg, success: false };
  }
}
