// ---------------------------------------------------------------------------
// EliteClass — Profile & Institute Settings Service
//
// Handles profile updates (name, phone, avatar) and institute settings
// (name, logo) for the current authenticated user.
// Every function returns ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type { ApiResponse, User, Institute } from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Profile Updates ──────────────────────────────────────────────────────────

export interface UpdateProfilePayload {
  name?: string;
  phone?: string | null;
  avatar_url?: string | null;
}

/**
 * Updates the current user's profile in the `users` table.
 */
export async function updateProfile(
  userId: string,
  payload: UpdateProfilePayload,
): Promise<ApiResponse<User>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const updates: Record<string, unknown> = {};
  if (payload.name !== undefined) updates.name = payload.name.trim();
  if (payload.phone !== undefined) updates.phone = payload.phone?.trim() || null;
  if (payload.avatar_url !== undefined) updates.avatar_url = payload.avatar_url;

  if (Object.keys(updates).length === 0) {
    return { data: null, error: "No changes to save.", success: false };
  }

  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select("id, institute_id, role, name, email, phone, avatar_url, is_active, created_at, updated_at")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as User, error: null, success: true };
}

// ── Institute Updates (admin only) ───────────────────────────────────────────

export interface UpdateInstitutePayload {
  name?: string;
  logo?: string | null;
}

/**
 * Updates the institute record. Only admins should call this.
 */
export async function updateInstitute(
  instituteId: string,
  payload: UpdateInstitutePayload,
): Promise<ApiResponse<Institute>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const updates: Record<string, unknown> = {};
  if (payload.name !== undefined) updates.name = payload.name.trim();
  if (payload.logo !== undefined) updates.logo = payload.logo;

  if (Object.keys(updates).length === 0) {
    return { data: null, error: "No changes to save.", success: false };
  }

  const { data, error } = await supabase
    .from("institutes")
    .update(updates)
    .eq("id", instituteId)
    .select("id, name, logo, subscription_plan, is_active, created_at, updated_at")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Institute, error: null, success: true };
}

// ── Password Change ──────────────────────────────────────────────────────────

/**
 * Updates the current user's password via Supabase Auth.
 */
export async function changePassword(newPassword: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}
