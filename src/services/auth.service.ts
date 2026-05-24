// ---------------------------------------------------------------------------
// EduOS — Auth Service
//
// All authentication operations go through this module:
//   - Email/password sign-in & sign-up
//   - Password reset & update
//   - Session retrieval
//   - Profile + institute hydration after auth
//
// Every function returns an ApiResponse<T> — never throws.
//
// SUPABASE NULL SAFETY
//   `supabase` is `SupabaseClient | null` (see src/lib/supabase.ts).
//   Every function starts with `if (!supabase) return SUPABASE_NOT_CONFIGURED`.
//   After that guard, TypeScript narrows the type to `SupabaseClient` for the
//   remainder of the function body, so no `!` assertions are needed below.
//   This ensures the service never crashes when Supabase is not configured —
//   it returns a structured error instead, which the UI displays gracefully.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { runService } from "@/lib/service-runner";
import type { User, Institute, ApiResponse, UserRole } from "@/types";
import { getErrorMessage } from "@/utils/helpers";

let currentUserInFlight: Promise<ApiResponse<{ user: User; institute: Institute } | null>> | null =
  null;

// ── Shared "not configured" error response ───────────────────────────────────
// Returned by every service function when the Supabase client is null.
// Typed as `const` so TypeScript infers the literal types; cast to
// ApiResponse<never> at usage sites — assignable to ApiResponse<T> for any T.

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error:
    "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file, then restart the dev server.",
  success: false,
} as const;

// ── Private helpers ──────────────────────────────────────────────────────────

/**
 * Fetch the EduOS user profile from the `users` table.
 * Called after a successful Supabase auth operation.
 */
async function fetchUserProfile(userId: string): Promise<ApiResponse<User>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  return runService("fetchUserProfile", async () => {
    const { data, error } = await supabase
      .from("users")
      .select("id, institute_id, role, name, email, phone, avatar_url, is_active")
      .eq("id", userId)
      .single();

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    return { data: data as User, error: null, success: true };
  });
}

/**
 * Fetch the institute record that the user belongs to.
 * Called after the user profile is loaded.
 */
async function fetchInstitute(instituteId: string): Promise<ApiResponse<Institute>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  return runService("fetchInstitute", async () => {
    const { data, error } = await supabase
      .from("institutes")
      .select("id, name, logo, subscription_plan, is_active")
      .eq("id", instituteId)
      .single();

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    return { data: data as Institute, error: null, success: true };
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Sign in with email and password.
 *
 * On success returns both the enriched `User` profile and its `Institute`
 * so the calling store can hydrate state in a single round-trip.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<ApiResponse<{ user: User; institute: Institute; passwordChangeRequired: boolean }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // Handle student login ID (e.g. "ocmsarvesh4831") by converting it to virtual email.
  // If the input doesn't contain an '@', we assume it's a student login ID.
  const authEmail = email.includes("@") ? email.trim() : `${email.trim()}@eduos.student`;

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password,
  });

  if (authError || !authData.user) {
    return { data: null, error: authError?.message ?? "Sign in failed", success: false };
  }

  const passwordChangeRequired = !!authData.user.user_metadata?.force_password_change;

  const profileResult = await fetchUserProfile(authData.user.id);
  if (!profileResult.success || !profileResult.data) {
    return {
      data: null,
      error: profileResult.error ?? "Failed to load user profile",
      success: false,
    };
  }

  const instituteResult = await fetchInstitute(profileResult.data.institute_id);
  if (!instituteResult.success || !instituteResult.data) {
    return {
      data: null,
      error: instituteResult.error ?? "Failed to load institute",
      success: false,
    };
  }

  return {
    data: { user: profileResult.data, institute: instituteResult.data, passwordChangeRequired },
    error: null,
    success: true,
  };
}

/**
 * Register a new Supabase auth user.
 *
 * `metadata` is stored in `auth.users.raw_user_meta_data` and used by the
 * `handle_new_user` trigger when institute_id is present (admin-created users).
 * For self-registration, use the `register_institute` RPC instead.
 */
export async function signUp(
  email: string,
  password: string,
  metadata: { name: string; role: UserRole; institute_id?: string },
): Promise<ApiResponse<{ userId: string }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });

  if (error || !data.user) {
    return { data: null, error: error?.message ?? "Sign up failed", success: false };
  }

  return { data: { userId: data.user.id }, error: null, success: true };
}

/**
 * Sign the current user out and clear the local Supabase session.
 */
export async function signOut(): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.auth.signOut();
  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

/**
 * Send a password-reset email.
 *
 * The link redirects to `/auth/update-password` where the user sets a
 * new password via `updatePassword()`.
 */
export async function requestPasswordReset(email: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${import.meta.env.VITE_APP_URL}/auth/update-password`,
  });
  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

/**
 * Update the current user's password.
 * This is used for both forgotten-password recovery and forced first-login change.
 */
export async function updatePassword(password: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // Update password AND clear the force_password_change flag if it exists.
  const { error } = await supabase.auth.updateUser({
    password,
    data: { force_password_change: false },
  });

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

/**
 * Retrieve the current Supabase session from localStorage.
 *
 * Returns `null` when:
 *   - The user is not signed in
 *   - The session has expired and could not be refreshed
 *   - Supabase is not configured (treated the same as "no session")
 */
export async function getCurrentSession() {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    return data.session;
  } catch {
    return null;
  }
}

/**
 * Re-fetch the full authenticated user profile and its institute from the DB.
 *
 * Returns `{ data: null, success: true }` (not an error) when no session
 * exists — the caller treats this as "logged out" rather than a failure.
 * Returns the same when Supabase is not configured.
 */
export async function getCurrentUser(): Promise<
  ApiResponse<{ user: User; institute: Institute } | null>
> {
  if (currentUserInFlight) return currentUserInFlight;

  currentUserInFlight = runService("getCurrentUser", async () => {
    if (!supabase) return { data: null, error: null, success: true };

    const session = await getCurrentSession();
    if (!session) return { data: null, error: null, success: true };

    const profileResult = await fetchUserProfile(session.user.id);
    if (!profileResult.success || !profileResult.data) {
      return { data: null, error: profileResult.error, success: false };
    }

    const instituteResult = await fetchInstitute(profileResult.data.institute_id);
    if (!instituteResult.success || !instituteResult.data) {
      return { data: null, error: instituteResult.error, success: false };
    }

    return {
      data: { user: profileResult.data, institute: instituteResult.data },
      error: null,
      success: true,
    };
  });

  try {
    return await currentUserInFlight;
  } finally {
    currentUserInFlight = null;
  }
}
