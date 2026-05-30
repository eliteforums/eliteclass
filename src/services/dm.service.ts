// ---------------------------------------------------------------------------
// EliteClass — Direct Message Service
//
// DM conversation and message CRUD used by:
//   - DirectMessageList (conversation list)
//   - DirectMessageRoom (1:1 chat view)
//   - useDirectMessages hook (realtime messaging)
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

export type DMMessageType = "text" | "gif" | "emoji";

export interface DMConversation {
  id: string;
  institute_id: string;
  participant_1_id: string;
  participant_2_id: string;
  created_at: string;
  last_message_at: string | null;
  other_participant?: { id: string; name: string; avatar_url: string | null };
  unread_count?: number;
  last_message?: DMMessage;
}

export interface DMMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type: DMMessageType;
  gif_url: string | null;
  created_at: string;
  sender_name?: string;
}

// ── getConversations ─────────────────────────────────────────────────────────
/**
 * Lists DM conversations for a user, including the other participant's info,
 * the last message, and unread count.
 * Ordered by last_message_at descending (most recent activity first).
 */
export async function getConversations(
  userId: string,
): Promise<ApiResponse<DMConversation[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    // Fetch conversations where the user is a participant
    const { data, error } = await supabase
      .from("dm_conversations")
      .select(
        `id, institute_id, participant_1_id, participant_2_id, created_at, last_message_at,
         participant_1:users!dm_conversations_participant_1_id_fkey(id, name, avatar_url),
         participant_2:users!dm_conversations_participant_2_id_fkey(id, name, avatar_url)`
      )
      .or(`participant_1_id.eq.${userId},participant_2_id.eq.${userId}`)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) return { data: null, error: error.message, success: false };

    if (!data || data.length === 0) {
      return { data: [], error: null, success: true };
    }

    // Build conversation list with other participant info
    const conversations: DMConversation[] = [];

    for (const row of data) {
      const r = row as Record<string, unknown>;
      const participant1 = r.participant_1 as { id: string; name: string; avatar_url: string | null } | null;
      const participant2 = r.participant_2 as { id: string; name: string; avatar_url: string | null } | null;

      const otherParticipant =
        (r.participant_1_id as string) === userId ? participant2 : participant1;

      const conversation: DMConversation = {
        id: r.id as string,
        institute_id: r.institute_id as string,
        participant_1_id: r.participant_1_id as string,
        participant_2_id: r.participant_2_id as string,
        created_at: r.created_at as string,
        last_message_at: (r.last_message_at as string) ?? null,
        other_participant: otherParticipant ?? undefined,
      };

      conversations.push(conversation);
    }

    // Fetch last message for each conversation
    const conversationIds = conversations.map((c) => c.id);
    if (conversationIds.length > 0) {
      for (const conv of conversations) {
        const { data: msgData } = await supabase
          .from("dm_messages")
          .select("id, conversation_id, sender_id, content, message_type, gif_url, created_at, users!dm_messages_sender_id_fkey(name)")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (msgData && msgData.length > 0) {
          const msg = msgData[0] as Record<string, unknown>;
          const sender = msg.users as { name: string } | null;
          conv.last_message = {
            id: msg.id as string,
            conversation_id: msg.conversation_id as string,
            sender_id: msg.sender_id as string,
            content: (msg.content as string) ?? null,
            message_type: msg.message_type as DMMessageType,
            gif_url: (msg.gif_url as string) ?? null,
            created_at: msg.created_at as string,
            sender_name: sender?.name ?? "Unknown",
          };
        }

        // Count unread messages (messages not sent by this user, created after
        // last read — for simplicity, count messages not sent by userId)
        const { count } = await supabase
          .from("dm_messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .neq("sender_id", userId);

        // Note: Without a read-tracking table, we report total messages from
        // the other participant. A future enhancement can add a
        // dm_read_receipts table. For now, unread_count is set to 0 as a
        // placeholder until read-tracking is implemented.
        conv.unread_count = 0;
      }
    }

    return { data: conversations, error: null, success: true };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to fetch conversations",
      success: false,
    };
  }
}

// ── getOrCreateConversation ──────────────────────────────────────────────────
/**
 * Finds an existing conversation between two users or creates a new one.
 * Participants are stored in a consistent order (sorted by UUID) to ensure
 * the UNIQUE constraint works correctly.
 */
export async function getOrCreateConversation(
  userId: string,
  otherUserId: string,
  instituteId: string,
): Promise<ApiResponse<DMConversation>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    // Ensure consistent participant ordering for UNIQUE constraint
    const [p1, p2] = [userId, otherUserId].sort();

    // Try to find existing conversation
    const { data: existing, error: findError } = await supabase
      .from("dm_conversations")
      .select(
        `id, institute_id, participant_1_id, participant_2_id, created_at, last_message_at,
         participant_1:users!dm_conversations_participant_1_id_fkey(id, name, avatar_url),
         participant_2:users!dm_conversations_participant_2_id_fkey(id, name, avatar_url)`
      )
      .eq("participant_1_id", p1)
      .eq("participant_2_id", p2)
      .maybeSingle();

    if (findError) return { data: null, error: findError.message, success: false };

    if (existing) {
      const r = existing as Record<string, unknown>;
      const participant1 = r.participant_1 as { id: string; name: string; avatar_url: string | null } | null;
      const participant2 = r.participant_2 as { id: string; name: string; avatar_url: string | null } | null;
      const otherParticipant =
        (r.participant_1_id as string) === userId ? participant2 : participant1;

      return {
        data: {
          id: r.id as string,
          institute_id: r.institute_id as string,
          participant_1_id: r.participant_1_id as string,
          participant_2_id: r.participant_2_id as string,
          created_at: r.created_at as string,
          last_message_at: (r.last_message_at as string) ?? null,
          other_participant: otherParticipant ?? undefined,
        },
        error: null,
        success: true,
      };
    }

    // Create new conversation
    const { data: created, error: createError } = await supabase
      .from("dm_conversations")
      .insert({
        institute_id: instituteId,
        participant_1_id: p1,
        participant_2_id: p2,
      })
      .select(
        `id, institute_id, participant_1_id, participant_2_id, created_at, last_message_at,
         participant_1:users!dm_conversations_participant_1_id_fkey(id, name, avatar_url),
         participant_2:users!dm_conversations_participant_2_id_fkey(id, name, avatar_url)`
      )
      .single();

    if (createError) return { data: null, error: createError.message, success: false };

    const r = created as Record<string, unknown>;
    const participant1 = r.participant_1 as { id: string; name: string; avatar_url: string | null } | null;
    const participant2 = r.participant_2 as { id: string; name: string; avatar_url: string | null } | null;
    const otherParticipant =
      (r.participant_1_id as string) === userId ? participant2 : participant1;

    return {
      data: {
        id: r.id as string,
        institute_id: r.institute_id as string,
        participant_1_id: r.participant_1_id as string,
        participant_2_id: r.participant_2_id as string,
        created_at: r.created_at as string,
        last_message_at: (r.last_message_at as string) ?? null,
        other_participant: otherParticipant ?? undefined,
      },
      error: null,
      success: true,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to get or create conversation",
      success: false,
    };
  }
}

// ── getMessages ──────────────────────────────────────────────────────────────
/**
 * Fetches messages for a conversation with sender name.
 * Ordered by created_at ASC (oldest first), limited to `limit` messages (max 50).
 */
export async function getMessages(
  conversationId: string,
  limit = 50,
): Promise<ApiResponse<DMMessage[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // Enforce max limit of 50
  const effectiveLimit = Math.min(Math.max(limit, 1), 50);

  try {
    const { data, error } = await supabase
      .from("dm_messages")
      .select("id, conversation_id, sender_id, content, message_type, gif_url, created_at, users!dm_messages_sender_id_fkey(name)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(effectiveLimit);

    if (error) return { data: null, error: error.message, success: false };

    const messages: DMMessage[] = (data ?? []).map((row: Record<string, unknown>) => {
      const sender = row.users as { name: string } | null;
      return {
        id: row.id as string,
        conversation_id: row.conversation_id as string,
        sender_id: row.sender_id as string,
        content: (row.content as string) ?? null,
        message_type: row.message_type as DMMessageType,
        gif_url: (row.gif_url as string) ?? null,
        created_at: row.created_at as string,
        sender_name: sender?.name ?? "Unknown",
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

// ── validateCommonBatch ──────────────────────────────────────────────────────
/**
 * Checks whether two users share at least one common batch.
 * Both users must have an active student record and be assigned to a shared batch.
 *
 * Returns true if they share at least one common batch, false otherwise.
 */
export async function validateCommonBatch(
  userId: string,
  otherUserId: string,
): Promise<ApiResponse<boolean>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    // Get student ID for the first user
    const { data: student1 } = await supabase
      .from("students")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!student1) {
      return { data: false, error: null, success: true };
    }

    // Get student ID for the second user
    const { data: student2 } = await supabase
      .from("students")
      .select("id")
      .eq("user_id", otherUserId)
      .single();

    if (!student2) {
      return { data: false, error: null, success: true };
    }

    // Get active batch assignments for user 1
    const { data: batches1, error: err1 } = await supabase
      .from("student_batch_assignments")
      .select("batch_id")
      .eq("student_id", student1.id)
      .eq("is_active", true);

    if (err1) return { data: null, error: err1.message, success: false };

    if (!batches1 || batches1.length === 0) {
      return { data: false, error: null, success: true };
    }

    const batchIds1 = batches1.map((b) => b.batch_id as string);

    // Check if user 2 shares any of those batches
    const { data: commonBatches, error: err2 } = await supabase
      .from("student_batch_assignments")
      .select("batch_id")
      .eq("student_id", student2.id)
      .eq("is_active", true)
      .in("batch_id", batchIds1);

    if (err2) return { data: null, error: err2.message, success: false };

    const hasCommonBatch = (commonBatches?.length ?? 0) > 0;
    return { data: hasCommonBatch, error: null, success: true };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to validate common batch",
      success: false,
    };
  }
}

// ── sendDirectMessage ─────────────────────────────────────────────────────────
/**
 * Sends a direct message in a conversation.
 * Validates that the sender shares a common batch with the other participant
 * before allowing the message to be sent.
 *
 * Updates the conversation's last_message_at timestamp after sending.
 */
export async function sendDirectMessage(
  conversationId: string,
  senderId: string,
  content: string,
  messageType: DMMessageType = "text",
  gifUrl?: string,
): Promise<ApiResponse<DMMessage>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    // Fetch the conversation to identify the other participant
    const { data: conversation, error: convError } = await supabase
      .from("dm_conversations")
      .select("id, participant_1_id, participant_2_id")
      .eq("id", conversationId)
      .single();

    if (convError) return { data: null, error: convError.message, success: false };
    if (!conversation) return { data: null, error: "Conversation not found.", success: false };

    const otherUserId =
      (conversation.participant_1_id as string) === senderId
        ? (conversation.participant_2_id as string)
        : (conversation.participant_1_id as string);

    // Validate that sender shares a common batch with the other participant
    const validationResult = await validateCommonBatch(senderId, otherUserId);
    if (!validationResult.success) {
      return { data: null, error: validationResult.error, success: false };
    }
    if (validationResult.data === false) {
      return {
        data: null,
        error: "Cannot send message: recipient is not reachable (no common batch).",
        success: false,
      };
    }

    // Insert the message
    const insertPayload: Record<string, unknown> = {
      conversation_id: conversationId,
      sender_id: senderId,
      content: messageType === "gif" ? null : (content?.trim() || null),
      message_type: messageType,
    };

    if (gifUrl) {
      insertPayload.gif_url = gifUrl;
    }

    const { data: msgData, error: insertError } = await supabase
      .from("dm_messages")
      .insert(insertPayload)
      .select("id, conversation_id, sender_id, content, message_type, gif_url, created_at, users!dm_messages_sender_id_fkey(name)")
      .single();

    if (insertError) return { data: null, error: insertError.message, success: false };

    // Update conversation's last_message_at
    await supabase
      .from("dm_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    const sender = (msgData as Record<string, unknown>).users as { name: string } | null;
    const message: DMMessage = {
      id: msgData.id as string,
      conversation_id: msgData.conversation_id as string,
      sender_id: msgData.sender_id as string,
      content: (msgData.content as string) ?? null,
      message_type: msgData.message_type as DMMessageType,
      gif_url: (msgData.gif_url as string) ?? null,
      created_at: msgData.created_at as string,
      sender_name: sender?.name ?? "Unknown",
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
