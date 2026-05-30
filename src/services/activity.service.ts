// ---------------------------------------------------------------------------
// EliteClass — Activity Tracking Service
//
// Logs user sessions (login/logout), actions (CRUD), and GPS locations.
// All functions are fire-and-forget — they never block the UI.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { ApiResponse } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface UserSession {
  id: string;
  user_id: string;
  institute_id: string;
  event_type: "login" | "logout" | "token_refresh";
  ip_address: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  institute_id: string;
  action: string;
  category: string;
  description: string | null;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  ip_address: string | null;
  page_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface UserLocation {
  id: string;
  user_id: string;
  institute_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  address: string | null;
  city: string | null;
  is_online: boolean;
  last_seen_at: string;
  updated_at: string;
}

export type ActivityCategory =
  | "auth"
  | "student"
  | "attendance"
  | "fee"
  | "exam"
  | "course"
  | "chat"
  | "settings"
  | "general";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDeviceInfo() {
  const ua = navigator.userAgent;
  let deviceType = "desktop";
  if (/Mobile|Android|iPhone/i.test(ua)) deviceType = "mobile";
  else if (/Tablet|iPad/i.test(ua)) deviceType = "tablet";

  let browser = "Unknown";
  if (/Chrome/i.test(ua) && !/Edge/i.test(ua)) browser = "Chrome";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Edge/i.test(ua)) browser = "Edge";

  let os = "Unknown";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iOS|iPhone|iPad/i.test(ua)) os = "iOS";

  return { deviceType, browser, os, userAgent: ua };
}

async function getIPInfo(): Promise<{ ip: string; city?: string; region?: string; country?: string; lat?: number; lon?: number }> {
  try {
    const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ip: "" };
    const data = await res.json();
    return {
      ip: data.ip ?? "",
      city: data.city,
      region: data.region,
      country: data.country_name,
      lat: data.latitude,
      lon: data.longitude,
    };
  } catch {
    return { ip: "" };
  }
}

// ── Session Logging ──────────────────────────────────────────────────────────

/**
 * Logs a login/logout event. Called automatically on auth state changes.
 * Fire-and-forget — never blocks UI.
 */
export async function logSession(eventType: "login" | "logout"): Promise<void> {
  if (!supabase) return;
  const user = useAuthStore.getState().user;
  if (!user) return;

  try {
    const [device, ipInfo] = await Promise.all([
      Promise.resolve(getDeviceInfo()),
      getIPInfo(),
    ]);

    await supabase.from("user_sessions").insert({
      user_id: user.id,
      institute_id: user.institute_id,
      event_type: eventType,
      ip_address: ipInfo.ip || null,
      user_agent: device.userAgent,
      device_type: device.deviceType,
      browser: device.browser,
      os: device.os,
      city: ipInfo.city || null,
      region: ipInfo.region || null,
      country: ipInfo.country || null,
      latitude: ipInfo.lat || null,
      longitude: ipInfo.lon || null,
    });
  } catch {
    // Silently ignore — tracking should never break the app
  }
}

// ── Activity Logging ─────────────────────────────────────────────────────────

/**
 * Logs a user action. Call this from anywhere in the app.
 * Fire-and-forget — never blocks UI.
 */
export async function logActivity(params: {
  action: string;
  category?: ActivityCategory;
  description?: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!supabase) return;
  const user = useAuthStore.getState().user;
  if (!user) return;

  try {
    await supabase.from("user_activity_logs").insert({
      user_id: user.id,
      institute_id: user.institute_id,
      action: params.action,
      category: params.category || "general",
      description: params.description || null,
      target_type: params.targetType || null,
      target_id: params.targetId || null,
      target_name: params.targetName || null,
      page_url: typeof window !== "undefined" ? window.location.pathname : null,
      metadata: params.metadata || null,
    });
  } catch {
    // Silently ignore
  }
}

// ── Location Tracking ────────────────────────────────────────────────────────

/**
 * Updates the user's current GPS location. Called periodically from the location hook.
 * Uses upsert (one row per user) for the live location table.
 */
export async function updateLocation(coords: {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
}): Promise<void> {
  if (!supabase) return;
  const user = useAuthStore.getState().user;
  if (!user) return;

  try {
    await supabase.from("user_locations").upsert(
      {
        user_id: user.id,
        institute_id: user.institute_id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy ?? null,
        altitude: coords.altitude ?? null,
        speed: coords.speed ?? null,
        heading: coords.heading ?? null,
        is_online: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    // Also log to history (for route tracking)
    await supabase.from("user_location_history").insert({
      user_id: user.id,
      institute_id: user.institute_id,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy ?? null,
    });
  } catch {
    // Silently ignore
  }
}

/**
 * Marks the user as offline (called on logout or app close).
 */
export async function markOffline(): Promise<void> {
  if (!supabase) return;
  const user = useAuthStore.getState().user;
  if (!user) return;

  try {
    await supabase
      .from("user_locations")
      .update({ is_online: false, last_seen_at: new Date().toISOString() })
      .eq("user_id", user.id);
  } catch {
    // Silently ignore
  }
}

// ── Fetching Logs (Admin) ────────────────────────────────────────────────────

export async function getSessionLogs(
  instituteId: string,
  options?: { limit?: number; userId?: string },
): Promise<ApiResponse<UserSession[]>> {
  if (!supabase) return { data: null, error: "Not configured", success: false };

  let query = supabase
    .from("user_sessions")
    .select("*")
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 100);

  if (options?.userId) {
    query = query.eq("user_id", options.userId);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message, success: false };
  return { data: data as UserSession[], error: null, success: true };
}

export async function getActivityLogs(
  instituteId: string,
  options?: { limit?: number; userId?: string; category?: string },
): Promise<ApiResponse<ActivityLog[]>> {
  if (!supabase) return { data: null, error: "Not configured", success: false };

  let query = supabase
    .from("user_activity_logs")
    .select("*")
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 100);

  if (options?.userId) query = query.eq("user_id", options.userId);
  if (options?.category) query = query.eq("category", options.category);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message, success: false };
  return { data: data as ActivityLog[], error: null, success: true };
}

export async function getLiveLocations(
  instituteId: string,
): Promise<ApiResponse<UserLocation[]>> {
  if (!supabase) return { data: null, error: "Not configured", success: false };

  const { data, error } = await supabase
    .from("user_locations")
    .select("*")
    .eq("institute_id", instituteId)
    .eq("is_online", true)
    .order("last_seen_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as UserLocation[], error: null, success: true };
}
