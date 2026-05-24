// ---------------------------------------------------------------------------
// EduOS — Auth Module Types
//
// Types that are specific to the auth module only.
// Shared domain types (User, Institute, UserRole, ApiResponse, etc.) live in
// the global `src/types/index.ts` and should be imported from `@/types`.
// ---------------------------------------------------------------------------

// ── Auth flow step ───────────────────────────────────────────────────────────

/**
 * Represents the current lifecycle state of any async auth operation
 * (sign-in, sign-up, password reset, etc.).
 *
 * - `idle`    — no operation in progress; initial state
 * - `loading` — network request / Supabase call in-flight
 * - `success` — operation completed successfully
 * - `error`   — operation failed; an error message is available
 */
export type AuthStep = "idle" | "loading" | "success" | "error";

// ── Institute registration form ──────────────────────────────────────────────

/**
 * Shape of the data collected during the "Register your Institute" flow.
 *
 * This is the raw form state before validation and before it is split into
 * the separate Supabase `auth.signUp`, `institutes`, and `users` inserts that
 * the `registerInstitute` service function performs.
 */
export interface RegisterInstituteFormData {
  /** Display name of the institution (e.g. "Sunrise Academy"). */
  instituteName: string;
  /** Full name of the administrator creating the account. */
  adminName: string;
  /** Email used for Supabase auth sign-up and the user row. */
  email: string;
  /** Contact phone number stored on the user row. */
  phone: string;
  /** Raw password — never persisted; passed straight to `supabase.auth.signUp`. */
  password: string;
  /** Confirmation field — validated client-side only; never sent to the server. */
  confirmPassword: string;
}
