// ---------------------------------------------------------------------------
// EduOS — Security Service
//
// Activity logging and session validation utilities.
//
// Key responsibilities:
//   - Log user actions to the `activity_logs` table via a Postgres RPC
//   - Query activity logs for admin-facing audit views
//   - Validate whether a Supabase session is currently active
//
// SUPABASE NULL SAFETY
//   Every public function guards against a null Supabase client before use.
//   `logActivity` is fire-and-forget — it never throws or blocks the caller.
//   `getActivityLogs` returns a structured error response.
//   `validateSession` returns `false` (same as "no session").
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type { ActivityLog, ApiResponse } from "@/types";

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Log a user action to the `activity_logs` table via the `log_activity` RPC.
 *
 * This function is **fire-and-forget** — it never throws and silently discards
 * any errors so audit logging never blocks or breaks the primary operation
 * that called it.
 *
 * @param params.action       The action being logged (e.g. `'student.admitted'`)
 * @param params.entity_type  The type of entity affected (e.g. `'student'`)
 * @param params.entity_id    The UUID of the affected entity
 * @param params.metadata     Arbitrary key-value context about the event
 */
export async function logActivity(params: {
  action: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!supabase) return;

  try {
    await supabase.rpc("log_activity", {
      p_action: params.action,
      p_entity_type: params.entity_type ?? null,
      p_entity_id: params.entity_id ?? null,
      p_metadata: params.metadata ?? null,
    });
  } catch {
    // Silently discard — audit logging must never interrupt the main flow.
  }
}

/**
 * Return the most recent activity log entries for a given institute.
 *
 * Each row includes a partial join on the acting user's profile (`id`, `name`,
 * `role`) so the audit table can display who triggered each event without
 * fetching the full `users` row.
 *
 * @param instituteId  Filter entries to a single institute.
 * @param limit        Maximum number of rows to return (default 50).
 */
export async function getActivityLogs(
  instituteId: string,
  limit = 50,
): Promise<ApiResponse<ActivityLog[]>> {
  if (!supabase) return { data: null, error: "Supabase not configured", success: false };

  const { data, error } = await supabase
    .from("activity_logs")
    .select("*, user:users(id, name, role)")
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as ActivityLog[], error: null, success: true };
}

/**
 * Check whether the current Supabase session is valid and has not expired.
 *
 * Returns `false` in all unauthenticated or unconfigured states:
 *  - Supabase client is `null` (env vars missing)
 *  - No active session found in storage
 *  - Session has expired and could not be refreshed
 *
 * Callers should treat both `false` states identically as "unauthenticated".
 */
export async function validateSession(): Promise<boolean> {
  if (!supabase) return false;

  const { data } = await supabase.auth.getSession();
  return !!data.session;
}
