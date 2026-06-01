// ---------------------------------------------------------------------------
// EliteClass — Geo-Fenced Attendance Service
//
// Flow:
//   1. Teacher creates an attendance prompt (sends their GPS)
//   2. Students see the prompt via Realtime subscription
//   3. Students respond with their GPS
//   4. Distance is calculated client-side and server validates
//   5. If within 100m → present, else → rejected
//
// Every function returns ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface AttendancePrompt {
  id: string;
  institute_id: string;
  batch_id: string;
  teacher_id: string;
  teacher_latitude: number;
  teacher_longitude: number;
  teacher_accuracy: number | null;
  radius_meters: number;
  duration_minutes: number;
  status: "active" | "expired" | "cancelled";
  created_at: string;
  expires_at: string;
}

export interface AttendanceResponse {
  id: string;
  prompt_id: string;
  student_id: string;
  user_id: string;
  institute_id: string;
  student_latitude: number;
  student_longitude: number;
  student_accuracy: number | null;
  distance_meters: number;
  is_within_radius: boolean;
  status: "present" | "rejected" | "late";
  responded_at: string;
}

// ── Haversine Distance (client-side) ─────────────────────────────────────────

export function calculateDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ── Teacher: Create Attendance Prompt ────────────────────────────────────────

export async function createAttendancePrompt(params: {
  batchId: string;
  teacherId: string;
  instituteId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  radiusMeters?: number;
  durationMinutes?: number;
}): Promise<ApiResponse<AttendancePrompt>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const radius = params.radiusMeters ?? 100;
  const duration = params.durationMinutes ?? 5;
  const expiresAt = new Date(Date.now() + duration * 60 * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from("attendance_prompts")
      .insert({
        institute_id: params.instituteId,
        batch_id: params.batchId,
        teacher_id: params.teacherId,
        teacher_latitude: params.latitude,
        teacher_longitude: params.longitude,
        teacher_accuracy: params.accuracy ?? null,
        radius_meters: radius,
        duration_minutes: duration,
        status: "active",
        expires_at: expiresAt,
      })
      .select("*")
      .single();

    if (error) return { data: null, error: error.message, success: false };
    return { data: data as AttendancePrompt, error: null, success: true };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Failed to create prompt", success: false };
  }
}

// ── Teacher: Cancel Prompt ───────────────────────────────────────────────────

export async function cancelAttendancePrompt(
  promptId: string,
): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase
    .from("attendance_prompts")
    .update({ status: "cancelled" })
    .eq("id", promptId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

// ── Teacher: Get Responses for a Prompt ──────────────────────────────────────

export async function getPromptResponses(
  promptId: string,
): Promise<ApiResponse<AttendanceResponse[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("attendance_responses")
    .select("*")
    .eq("prompt_id", promptId)
    .order("responded_at", { ascending: true });

  if (error) return { data: null, error: error.message, success: false };
  return { data: (data ?? []) as AttendanceResponse[], error: null, success: true };
}

// ── Student: Get Active Prompts for Their Batches ────────────────────────────

export async function getActivePrompts(
  userId: string,
): Promise<ApiResponse<AttendancePrompt[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    // Get student's active batch IDs
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!student) {
      console.log("✗ No student record found for user:", userId);
      return { data: [], error: null, success: true };
    }

    const { data: assignments, error: assignError } = await supabase
      .from("student_batch_assignments")
      .select("batch_id")
      .eq("student_id", student.id)
      .eq("is_active", true);

    if (!assignments || assignments.length === 0) {
      console.log("✗ Student has no active batch assignments:", student.id);
      return { data: [], error: null, success: true };
    }

    const batchIds = assignments.map((a) => a.batch_id as string);
    console.log("✓ Student has active batches:", batchIds);

    // Get active prompts for those batches
    const { data: prompts, error } = await supabase
      .from("attendance_prompts")
      .select("*")
      .in("batch_id", batchIds)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("✗ Error fetching prompts:", error.message);
      return { data: null, error: error.message, success: false };
    }
    console.log("✓ Found active prompts:", prompts?.length ?? 0);
    return { data: (prompts ?? []) as AttendancePrompt[], error: null, success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch prompts";
    console.error("✗ Unexpected error:", errorMsg);
    return { data: null, error: errorMsg, success: false };
  }
}

// ── Student: Respond to Attendance Prompt ────────────────────────────────────

export async function respondToAttendancePrompt(params: {
  promptId: string;
  studentId: string;
  userId: string;
  instituteId: string;
  studentLatitude: number;
  studentLongitude: number;
  studentAccuracy?: number;
  teacherLatitude: number;
  teacherLongitude: number;
  radiusMeters: number;
}): Promise<ApiResponse<AttendanceResponse>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // Calculate distance between student and teacher
  const distance = calculateDistance(
    params.teacherLatitude,
    params.teacherLongitude,
    params.studentLatitude,
    params.studentLongitude,
  );

  const isWithinRadius = distance <= params.radiusMeters;
  const status = isWithinRadius ? "present" : "rejected";

  try {
    const { data, error } = await supabase
      .from("attendance_responses")
      .insert({
        prompt_id: params.promptId,
        student_id: params.studentId,
        user_id: params.userId,
        institute_id: params.instituteId,
        student_latitude: params.studentLatitude,
        student_longitude: params.studentLongitude,
        student_accuracy: params.studentAccuracy ?? null,
        distance_meters: Math.round(distance),
        is_within_radius: isWithinRadius,
        status,
      })
      .select("*")
      .single();

    if (error) {
      // Duplicate response check
      if (error.code === "23505") {
        return { data: null, error: "You have already responded to this attendance prompt.", success: false };
      }
      return { data: null, error: error.message, success: false };
    }

    return { data: data as AttendanceResponse, error: null, success: true };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Failed to respond", success: false };
  }
}

// ── Teacher: Get Prompt History for a Batch ──────────────────────────────────

export async function getPromptHistory(
  batchId: string,
  limit = 20,
): Promise<ApiResponse<AttendancePrompt[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("attendance_prompts")
    .select("*")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { data: null, error: error.message, success: false };
  return { data: (data ?? []) as AttendancePrompt[], error: null, success: true };
}
