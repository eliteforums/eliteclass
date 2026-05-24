// ---------------------------------------------------------------------------
// EduOS — Register Institute Service (auth module)
//
// ARCHITECTURE NOTE — Why this uses supabase.rpc() instead of direct inserts
// ---------------------------------------------------------------------------
//
// The original implementation called supabase.auth.signUp() then did manual
// INSERT statements against `institutes` and `users`. This had 4 fatal flaws:
//
//  1. TRIGGER RACE: The on_auth_user_created trigger fires synchronously
//     inside the auth.signUp() transaction BEFORE the institute row exists.
//     institute_id NOT NULL constraint → the entire signUp() rolls back.
//
//  2. DUPLICATE KEY: Even if the trigger survived, the manual users INSERT
//     would collide with the trigger-created row (no ON CONFLICT handling).
//
//  3. RLS BLOCKED: The anon key has no INSERT policy on `institutes` or
//     `users`, so both table writes fail silently or with 403.
//
//  4. NO ATOMICITY: A crash between steps leaves orphaned auth.users rows
//     with no matching profile, causing broken login states forever.
//
// FIX: A single SECURITY DEFINER Postgres function (register_institute)
// handles steps 2–3 atomically inside the DB, bypassing RLS safely.
// The trigger (handle_new_user) now skips when no institute_id is in
// metadata — self-registration always goes through the RPC path.
//
// FLOW:
//   signUp()  →  no trigger action (institute_id absent from metadata)
//             →  supabase.rpc('register_institute', { ...params })
//             →  [DB] validate auth user  →  insert institute
//                                         →  insert user (admin role)
//             →  return { userId, instituteId, requiresEmailConfirmation }
//
// ---------------------------------------------------------------------------

import { supabase, supabaseAdmin } from "@/lib/supabase";
import type { ApiResponse } from "@/types";

// ── Parameter type ───────────────────────────────────────────────────────────

/**
 * Payload for `registerInstitute()`.
 * `confirmPassword` is intentionally absent — strip it in the calling component
 * before passing the rest of the form values here.
 */
export interface RegisterInstituteParams {
  instituteName: string;
  adminName: string;
  email: string;
  phone: string;
  password: string;
}

// ── Response type ────────────────────────────────────────────────────────────

export interface RegisterInstituteResult {
  userId: string;
  instituteId: string;
  /**
   * `true` when Supabase email confirmation is ENABLED.
   * In this case auth.signUp() returns no session and the user must verify
   * their email before they can log in. The UI should show a "check your
   * inbox" screen instead of redirecting to the dashboard.
   *
   * `false` when email confirmation is disabled — the session is live and
   * the caller may navigate directly to the admin dashboard.
   */
  requiresEmailConfirmation: boolean;
}

// ── RPC response shape (from Postgres register_institute function) ─────────

interface RegisterInstituteRpcResult {
  user_id: string;
  institute_id: string;
  already_exists: boolean;
}

interface SupabaseAuthUserSummary {
  id: string;
  email?: string | null;
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  if (!supabaseAdmin) return null;

  const targetEmail = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });

    if (error || !data?.users?.length) {
      return null;
    }

    const match = data.users.find(
      (user: SupabaseAuthUserSummary) => user.email?.trim().toLowerCase() === targetEmail,
    );

    if (match) return match.id;

    if (data.users.length < perPage) return null;
    page += 1;
  }

  return null;
}

// ── Service function ─────────────────────────────────────────────────────────

/**
 * Registers a new institute and provisions its first admin account.
 *
 * Two-step flow:
 *  1. `supabaseAdmin.auth.admin.createUser` — creates the Supabase Auth
 *     identity directly, avoiding browser sign-up placeholder responses.
 *  2. `supabase.rpc('register_institute')` — single atomic DB transaction
 *     that validates the auth user, creates the institute row, and creates
 *     the admin profile row. Runs as SECURITY DEFINER, bypasses RLS.
 *
 * Never throws — all errors are returned as structured `ApiResponse` values.
 */
export async function registerInstitute(
  params: RegisterInstituteParams,
): Promise<ApiResponse<RegisterInstituteResult>> {
  const { instituteName, adminName, email, phone, password } = params;

  // ── Guard: Supabase not configured ──────────────────────────────────────────
  // Return a structured error so the form can display a helpful message instead
  // of crashing. After this return, TypeScript narrows `supabase` to SupabaseClient.
  if (!supabase) {
    return {
      data: null,
      error:
        "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file, then restart the dev server.",
      success: false,
    };
  }

  // ── Step 1: Create the Supabase Auth user ──────────────────────────────────
  //
  // Prefer the admin API when available so new registrations do not depend on
  // browser-side confirmation/session state.
  const authClient = supabaseAdmin?.auth.admin ? supabaseAdmin.auth.admin : null;

  if (!authClient) {
    return {
      data: null,
      error:
        "Supabase admin credentials are not configured. Add the service role key to the server environment, then restart the app.",
      success: false,
    };
  }

  let userId = await findAuthUserIdByEmail(email);

  if (!userId) {
    const { data: authData, error: authError } = await authClient.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: adminName,
        role: "admin",
      },
    });

    if (authError) {
      const alreadyRegistered = authError.message.toLowerCase().includes("already registered");
      if (alreadyRegistered) {
        userId = await findAuthUserIdByEmail(email);
      }

      if (!userId) {
        return {
          data: null,
          error: authError.message,
          success: false,
        };
      }
    } else if (authData.user) {
      userId = authData.user.id;
    }
  } else {
    const { error: passwordUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
      user_metadata: {
        name: adminName,
        role: "admin",
      },
    });

    if (passwordUpdateError) {
      return {
        data: null,
        error: passwordUpdateError.message,
        success: false,
      };
    }
  }

  if (!userId) {
    return {
      data: null,
      error: "Sign-up succeeded but no user was returned. Please try again.",
      success: false,
    };
  }

  // Admin-created users are confirmed immediately so the dashboard can open
  // without waiting for a browser auth session or email link.
  const requiresEmailConfirmation = false;

  // ── Step 2: Atomic institute + profile creation via SECURITY DEFINER RPC ──
  //
  // This single Postgres function call:
  //   a) Validates userId exists in auth.users (created within 10 minutes)
  //   b) Creates the `institutes` row
  //   c) Creates the `users` row with role = 'admin' (hardcoded in DB)
  //   d) Handles duplicate submissions idempotently (page refresh safe)
  // All three DB operations run inside a single transaction — if any fail,
  // all are rolled back. The RLS bypass is safe because the role is DB-assigned.

  // Call the register_institute RPC with a short retry/backoff loop to
  // tolerate possible auth propagation delays between admin.createUser()
  // and visibility from the DB-function's perspective.
  let rpcData: any = null;
  let rpcError: any = null;
  const maxRpcAttempts = 5;

  for (let attempt = 1; attempt <= maxRpcAttempts; attempt += 1) {
    const res = await supabase.rpc("register_institute", {
      p_institute_name: instituteName,
      p_admin_name: adminName,
      p_email: email,
      p_phone: phone,
      p_user_id: userId,
    });

    rpcData = res.data;
    rpcError = res.error;

    if (!rpcError) break; // success

    // If the DB reports invalid user, try re-resolving the auth user id
    // (in case of eventual consistency) and retry after a small backoff.
    const msg = String(rpcError?.message || "");
    if (msg.includes("REGISTRATION_INVALID_USER") && attempt < maxRpcAttempts) {
      // Try to find the auth user by email again; if found, use that id.
      const found = await findAuthUserIdByEmail(email);
      if (found) userId = found;

      // backoff delay (ms)
      await new Promise((r) => setTimeout(r, attempt * 300));
      continue;
    }

    // For other errors or after exhausting retries, stop retrying.
    break;
  }

  if (rpcError) {
    // Log raw RPC error for debugging and return a mapped message.
    // (Console logging helps during local development; in production
    // the logging can be routed to your error capture system.)
    // eslint-disable-next-line no-console
    console.error("register_institute RPC error:", rpcError);

    const message = mapRpcError(String(rpcError.message || rpcError));
    return {
      data: null,
      error: message,
      success: false,
    };
  }

  if (!rpcData) {
    return {
      data: null,
      error: "Registration completed but no confirmation was returned. Please contact support.",
      success: false,
    };
  }

  const result = rpcData as RegisterInstituteRpcResult;

  return {
    data: {
      userId: result.user_id,
      instituteId: result.institute_id,
      requiresEmailConfirmation,
    },
    error: null,
    success: true,
  };
}

// ── Error message mapping ────────────────────────────────────────────────────

/**
 * Maps PostgreSQL RAISE EXCEPTION messages from register_institute()
 * to user-friendly strings. Falls back to the raw message for unknown errors.
 */
function mapRpcError(raw: string): string {
  if (raw.includes("REGISTRATION_EMAIL_ALREADY_REGISTERED")) {
    return "An account with this email already exists. Please sign in or reset your password.";
  }
  if (raw.includes("REGISTRATION_INVALID_USER")) {
    return "Registration session is invalid. Please refresh the page and try again.";
  }
  if (raw.includes("REGISTRATION_SESSION_EXPIRED")) {
    return "Your registration could not be completed with this email. If you already tried signing up before, use Login or Password Reset, or retry registration with a different email.";
  }
  if (raw.includes("REGISTRATION_INVALID_USER_EMAIL")) {
    return "Registration identity mismatch detected. Please refresh the page and try again.";
  }
  if (raw.includes("duplicate key") && raw.includes("users_email_key")) {
    return "An account with this email already exists. Please sign in instead.";
  }
  if (raw.includes("duplicate key") && raw.includes("institutes")) {
    return "An institute with this name may already exist. Please contact support.";
  }
  // Return the raw Supabase/Postgres message for unexpected errors
  return raw;
}
