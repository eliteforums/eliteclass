// ---------------------------------------------------------------------------
// EliteClass — Message Service
//
// Batch communication APIs used by:
//   - Communication page (batch chat rooms)
//   - useBatchMessages hook (realtime messaging)
//
// Every function returns ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type { ApiResponse, UserRole } from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  batch_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
}

export interface ChatBatch {
  id: string;
  name: string;
  course_name: string | null;
}

// ── getUserBatches ───────────────────────────────────────────────────────────
/**
 * Fetches batches the user belongs to based on their role.
 *
 * - Student: query student_batch_assignments joined with batches
 * - Staff: query staff_assignments joined with batches
 * - Admin: query all batches for the institute
 */
export async function getUserBatches(
  userId: string,
  role: UserRole,
  instituteId: string,
): Promise<ApiResponse<ChatBatch[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    let batches: ChatBatch[] = [];

    if (role === "student") {
      // Student: get batches via student_batch_assignments
      const { data: studentData } = await supabase
        .from("students")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (!studentData) {
        return { data: [], error: null, success: true };
      }

      const { data, error } = await supabase
        .from("student_batch_assignments")
        .select("batch_id, batches(id, name, course_name)")
        .eq("student_id", studentData.id)
        .eq("is_active", true);

      if (error) return { data: null, error: error.message, success: false };

      batches = (data ?? [])
        .filter((row: Record<string, unknown>) => row.batches)
        .map((row: Record<string, unknown>) => {
          const batch = row.batches as { id: string; name: string; course_name: string | null };
          return {
            id: batch.id,
            name: batch.name,
            course_name: batch.course_name,
          };
        });
    } else if (role === "staff") {
      // Staff: get batches via staff_assignments
      const { data: staffData } = await supabase
        .from("staff")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (!staffData) {
        return { data: [], error: null, success: true };
      }

      const { data, error } = await supabase
        .from("staff_assignments")
        .select("batch_id, batches(id, name, course_name)")
        .eq("staff_id", staffData.id)
        .not("batch_id", "is", null);

      if (error) return { data: null, error: error.message, success: false };

      // Deduplicate batches (staff may have multiple assignments to same batch)
      const seen = new Set<string>();
      batches = (data ?? [])
        .filter((row: Record<string, unknown>) => row.batches)
        .map((row: Record<string, unknown>) => {
          const batch = row.batches as { id: string; name: string; course_name: string | null };
          return {
            id: batch.id,
            name: batch.name,
            course_name: batch.course_name,
          };
        })
        .filter((batch) => {
          if (seen.has(batch.id)) return false;
          seen.add(batch.id);
          return true;
        });
    } else if (role === "admin") {
      // Admin: get all batches for the institute
      const { data, error } = await supabase
        .from("batches")
        .select("id, name, course_name")
        .eq("institute_id", instituteId)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) return { data: null, error: error.message, success: false };

      batches = (data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        course_name: (row.course_name as string | null) ?? null,
      }));
    }

    return { data: batches, error: null, success: true };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to fetch batches",
      success: false,
    };
  }
}

// ── getMessagesForBatch ──────────────────────────────────────────────────────
/**
 * Fetches messages for a batch with sender name from users table.
 * Ordered by created_at ASC (oldest first), limited to `limit` messages.
 */
export async function getMessagesForBatch(
  batchId: string,
  limit = 50,
): Promise<ApiResponse<ChatMessage[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase
      .from("messages")
      .select("id, batch_id, sender_id, content, created_at, users(name)")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) return { data: null, error: error.message, success: false };

    const messages: ChatMessage[] = (data ?? []).map((row: Record<string, unknown>) => {
      const user = row.users as { name: string } | null;
      return {
        id: row.id as string,
        batch_id: row.batch_id as string,
        sender_id: row.sender_id as string,
        sender_name: user?.name ?? "Unknown",
        content: row.content as string,
        created_at: row.created_at as string,
      };
    });

    return { data: messages, error: null, success: true };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to fetch messages",
      success: false,
    };
  }
}

// ── sendMessage ──────────────────────────────────────────────────────────────
/**
 * Inserts a new message into the messages table.
 */
export async function sendMessage(
  batchId: string,
  senderId: string,
  content: string,
): Promise<ApiResponse<ChatMessage>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase
      .from("messages")
      .insert({
        batch_id: batchId,
        sender_id: senderId,
        content: content.trim(),
      })
      .select("id, batch_id, sender_id, content, created_at, users(name)")
      .single();

    if (error) return { data: null, error: error.message, success: false };

    const user = (data as Record<string, unknown>).users as { name: string } | null;
    const message: ChatMessage = {
      id: data.id as string,
      batch_id: data.batch_id as string,
      sender_id: data.sender_id as string,
      sender_name: user?.name ?? "Unknown",
      content: data.content as string,
      created_at: data.created_at as string,
    };

    return { data: message, error: null, success: true };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to send message",
      success: false,
    };
  }
}
