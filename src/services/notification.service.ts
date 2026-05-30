// ---------------------------------------------------------------------------
// EliteClass — Notification Service
//
// Notification CRUD and batch-send APIs used by:
//   - NotificationBell + NotificationDropdown (reading notifications)
//   - NotificationCompose (sending notifications)
//   - useNotifications hook (realtime + polling)
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

export interface Notification {
  id: string;
  institute_id: string;
  sender_id: string;
  recipient_id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  sender?: { id: string; name: string; role: string };
}

export interface CreateNotificationPayload {
  institute_id: string;
  sender_id: string;
  title: string; // 1-100 chars
  body: string; // 1-500 chars
  recipient_id: string;
}

export interface SendBatchNotificationResult {
  count: number;
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface ValidationError {
  field: "title" | "body";
  message: string;
}

/**
 * Validates notification title and body fields.
 * Returns an array of validation errors (empty if valid).
 */
export function validateNotificationFields(
  title: string,
  body: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!title || title.length < 1) {
    errors.push({ field: "title", message: "Title is required (1-100 characters)." });
  } else if (title.length > 100) {
    errors.push({
      field: "title",
      message: `Title exceeds maximum length of 100 characters (current: ${title.length}).`,
    });
  }

  if (!body || body.length < 1) {
    errors.push({ field: "body", message: "Body is required (1-500 characters)." });
  } else if (body.length > 500) {
    errors.push({
      field: "body",
      message: `Body exceeds maximum length of 500 characters (current: ${body.length}).`,
    });
  }

  return errors;
}

// ── getNotifications ─────────────────────────────────────────────────────────
/**
 * Fetches the most recent notifications for a user, ordered by creation time
 * descending (newest first). Includes sender info via join.
 */
export async function getNotifications(
  userId: string,
  limit = 20,
): Promise<ApiResponse<Notification[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, institute_id, sender_id, recipient_id, title, body, is_read, created_at, read_at, users!notifications_sender_id_fkey(id, name, role)")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return { data: null, error: error.message, success: false };

    const notifications: Notification[] = (data ?? []).map((row: Record<string, unknown>) => {
      const sender = row.users as { id: string; name: string; role: string } | null;
      return {
        id: row.id as string,
        institute_id: row.institute_id as string,
        sender_id: row.sender_id as string,
        recipient_id: row.recipient_id as string,
        title: row.title as string,
        body: row.body as string,
        is_read: row.is_read as boolean,
        created_at: row.created_at as string,
        read_at: (row.read_at as string) ?? null,
        sender: sender ?? undefined,
      };
    });

    return { data: notifications, error: null, success: true };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to fetch notifications",
      success: false,
    };
  }
}

// ── getUnreadCount ───────────────────────────────────────────────────────────
/**
 * Returns the count of unread notifications for a user.
 * Uses the partial index on (recipient_id, is_read) for efficiency.
 */
export async function getUnreadCount(
  userId: string,
): Promise<ApiResponse<number>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .eq("is_read", false);

    if (error) return { data: null, error: error.message, success: false };

    return { data: count ?? 0, error: null, success: true };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to fetch unread count",
      success: false,
    };
  }
}

// ── markAsRead ───────────────────────────────────────────────────────────────
/**
 * Marks a single notification as read by setting is_read = true and read_at.
 */
export async function markAsRead(
  notificationId: string,
): Promise<ApiResponse<Notification>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .select("id, institute_id, sender_id, recipient_id, title, body, is_read, created_at, read_at")
      .single();

    if (error) return { data: null, error: error.message, success: false };

    const notification: Notification = {
      id: data.id as string,
      institute_id: data.institute_id as string,
      sender_id: data.sender_id as string,
      recipient_id: data.recipient_id as string,
      title: data.title as string,
      body: data.body as string,
      is_read: data.is_read as boolean,
      created_at: data.created_at as string,
      read_at: (data.read_at as string) ?? null,
    };

    return { data: notification, error: null, success: true };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to mark notification as read",
      success: false,
    };
  }
}

// ── markAllAsRead ────────────────────────────────────────────────────────────
/**
 * Marks all unread notifications for a user as read.
 * Returns the count of notifications that were updated.
 */
export async function markAllAsRead(
  userId: string,
): Promise<ApiResponse<{ count: number }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("recipient_id", userId)
      .eq("is_read", false)
      .select("id");

    if (error) return { data: null, error: error.message, success: false };

    return { data: { count: data?.length ?? 0 }, error: null, success: true };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to mark all notifications as read",
      success: false,
    };
  }
}

// ── createNotification ───────────────────────────────────────────────────────
/**
 * Creates a single notification with title/body validation.
 * Returns the created notification record.
 */
export async function createNotification(
  payload: CreateNotificationPayload,
): Promise<ApiResponse<Notification>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // Validate title and body
  const validationErrors = validateNotificationFields(payload.title, payload.body);
  if (validationErrors.length > 0) {
    const errorMessages = validationErrors.map((e) => e.message).join(" ");
    return { data: null, error: errorMessages, success: false };
  }

  try {
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        institute_id: payload.institute_id,
        sender_id: payload.sender_id,
        recipient_id: payload.recipient_id,
        title: payload.title.trim(),
        body: payload.body.trim(),
      })
      .select("id, institute_id, sender_id, recipient_id, title, body, is_read, created_at, read_at")
      .single();

    if (error) return { data: null, error: error.message, success: false };

    const notification: Notification = {
      id: data.id as string,
      institute_id: data.institute_id as string,
      sender_id: data.sender_id as string,
      recipient_id: data.recipient_id as string,
      title: data.title as string,
      body: data.body as string,
      is_read: data.is_read as boolean,
      created_at: data.created_at as string,
      read_at: (data.read_at as string) ?? null,
    };

    return { data: notification, error: null, success: true };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to create notification",
      success: false,
    };
  }
}

// ── sendBatchNotification ────────────────────────────────────────────────────
/**
 * Sends a notification to all students in a batch.
 * Fetches batch members via student_batch_assignments, then inserts one
 * notification record per student.
 *
 * Returns the count of notifications created.
 */
export async function sendBatchNotification(
  batchId: string,
  title: string,
  body: string,
  senderId: string,
  instituteId: string,
): Promise<ApiResponse<SendBatchNotificationResult>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // Validate title and body
  const validationErrors = validateNotificationFields(title, body);
  if (validationErrors.length > 0) {
    const errorMessages = validationErrors.map((e) => e.message).join(" ");
    return { data: null, error: errorMessages, success: false };
  }

  try {
    // Fetch all active students in the batch
    const { data: assignments, error: assignError } = await supabase
      .from("student_batch_assignments")
      .select("students(user_id)")
      .eq("batch_id", batchId)
      .eq("is_active", true);

    if (assignError) return { data: null, error: assignError.message, success: false };

    if (!assignments || assignments.length === 0) {
      return { data: { count: 0 }, error: null, success: true };
    }

    // Extract unique user IDs from the batch members
    const recipientIds: string[] = [];
    for (const assignment of assignments) {
      const student = (assignment as Record<string, unknown>).students as { user_id: string } | null;
      if (student?.user_id) {
        recipientIds.push(student.user_id);
      }
    }

    if (recipientIds.length === 0) {
      return { data: { count: 0 }, error: null, success: true };
    }

    // Create notification records for each recipient
    const notificationRecords = recipientIds.map((recipientId) => ({
      institute_id: instituteId,
      sender_id: senderId,
      recipient_id: recipientId,
      title: title.trim(),
      body: body.trim(),
    }));

    const { error: insertError } = await supabase
      .from("notifications")
      .insert(notificationRecords);

    if (insertError) return { data: null, error: insertError.message, success: false };

    return { data: { count: recipientIds.length }, error: null, success: true };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to send batch notification",
      success: false,
    };
  }
}
