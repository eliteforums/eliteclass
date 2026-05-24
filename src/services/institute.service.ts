// ---------------------------------------------------------------------------
// EduOS — Institute Service
//
// All database operations for the `institutes` table live here.
// Write operations that change subscription_plan should only be called
// by users with the `super_admin` role — enforce this at the route/guard layer.
//
// Every function returns an ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { getErrorMessage } from "@/utils/helpers";
import type { Institute, ApiResponse, SubscriptionPlan } from "@/types";

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Return all institutes, newest first.
 * Intended for the super_admin dashboard only.
 */
export async function getAllInstitutes(): Promise<ApiResponse<Institute[]>> {
  if (!supabase) return { data: null, error: "Supabase is not configured", success: false };

  const { data, error } = await supabase
    .from("institutes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as Institute[], error: null, success: true };
}

/**
 * Return a single institute by its primary key.
 * Used on every page load to refresh tenant context.
 */
export async function getInstituteById(id: string): Promise<ApiResponse<Institute>> {
  if (!supabase) return { data: null, error: "Supabase is not configured", success: false };
  const { data, error } = await supabase.from("institutes").select("*").eq("id", id).single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as Institute, error: null, success: true };
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a new institute record.
 *
 * Typically called during onboarding when a `super_admin` provisions a new
 * tenant. The returned record includes the generated `id` and timestamps.
 */
export async function createInstitute(
  payload: Pick<Institute, "name" | "logo" | "subscription_plan">,
): Promise<ApiResponse<Institute>> {
  if (!supabase) return { data: null, error: "Supabase is not configured", success: false };
  const { data, error } = await supabase.from("institutes").insert(payload).select().single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as Institute, error: null, success: true };
}

/**
 * Update mutable institute fields.
 *
 * Only the fields present in `payload` are changed; all other columns are
 * left untouched (Supabase uses a PATCH-style update under the hood).
 */
export async function updateInstitute(
  id: string,
  payload: Partial<Pick<Institute, "name" | "logo" | "subscription_plan">>,
): Promise<ApiResponse<Institute>> {
  if (!supabase) return { data: null, error: "Supabase is not configured", success: false };
  const { data, error } = await supabase
    .from("institutes")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Institute, error: null, success: true };
}

/**
 * Convenience wrapper to upgrade or downgrade a tenant's subscription plan.
 *
 * Delegates to `updateInstitute` so billing-related hooks (triggers, webhooks)
 * only need to watch a single code path.
 */
export async function updateSubscriptionPlan(
  id: string,
  plan: SubscriptionPlan,
): Promise<ApiResponse<Institute>> {
  return updateInstitute(id, { subscription_plan: plan });
}
