// ---------------------------------------------------------------------------
// useDirectMessages — Real-time direct messaging hook
//
// Fetches initial messages for a DM conversation, subscribes to Supabase
// Realtime for INSERT events on dm_messages, provides optimistic updates,
// retry on failure, and per-conversation unread tracking.
//
// Pattern follows useBatchMessages.ts
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  getMessages,
  sendDirectMessage,
  type DMMessage,
  type DMMessageType,
} from "@/services/dm.service";
import { useAuth } from "@/hooks/useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────────────

/** A message in the local state — extends DMMessage with send status for optimistic updates. */
export interface LocalDMMessage extends DMMessage {
  status: "sending" | "sent" | "failed";
  /** Client-generated temporary id for optimistic messages before server confirmation. */
  _tempId?: string;
}

export interface UseDirectMessagesReturn {
  messages: LocalDMMessage[];
  isLoading: boolean;
  isConnected: boolean;
  unreadCount: number;
  sendMessage: (
    content: string,
    messageType?: DMMessageType,
    gifUrl?: string,
  ) => Promise<boolean>;
  retryMessage: (tempId: string) => Promise<boolean>;
  markAsRead: () => void;
}

// ── Helper ───────────────────────────────────────────────────────────────────

let tempIdCounter = 0;
function generateTempId(): string {
  return `temp-${Date.now()}-${++tempIdCounter}`;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDirectMessages(
  conversationId: string | null,
): UseDirectMessagesReturn {
  const { user } = useAuth();
  const [messages, setMessages] = useState<LocalDMMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Track whether the user is actively viewing this conversation (for unread)
  const isViewingRef = useRef(true);

  // ── Fetch initial messages ─────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setIsConnected(false);
      setUnreadCount(0);
      return;
    }

    let cancelled = false;

    async function fetchMessages() {
      setIsLoading(true);
      const result = await getMessages(conversationId!, 50);
      if (!cancelled && result.success && result.data) {
        setMessages(
          result.data.map((msg) => ({ ...msg, status: "sent" as const })),
        );
      }
      if (!cancelled) {
        setIsLoading(false);
      }
    }

    fetchMessages();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId || !supabase) {
      setIsConnected(false);
      return;
    }

    const channel = supabase
      .channel(`dm-messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newRow = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            content: string | null;
            message_type: string;
            gif_url: string | null;
            created_at: string;
          };

          // Fetch sender name from users table
          let senderName = "Unknown";
          if (supabase) {
            const { data: userData } = await supabase
              .from("users")
              .select("name")
              .eq("id", newRow.sender_id)
              .single();
            if (userData) {
              senderName = userData.name as string;
            }
          }

          const newMessage: LocalDMMessage = {
            id: newRow.id,
            conversation_id: newRow.conversation_id,
            sender_id: newRow.sender_id,
            content: newRow.content ?? null,
            message_type: newRow.message_type as DMMessageType,
            gif_url: newRow.gif_url ?? null,
            created_at: newRow.created_at,
            sender_name: senderName,
            status: "sent",
          };

          setMessages((prev) => {
            // Replace optimistic message if one exists from this sender
            const optimisticIndex = prev.findIndex(
              (m) =>
                m.status === "sending" &&
                m.sender_id === newRow.sender_id &&
                m._tempId,
            );

            if (optimisticIndex !== -1) {
              const updated = [...prev];
              updated[optimisticIndex] = newMessage;
              return updated;
            }

            // Avoid duplicates (message already in list)
            if (prev.some((m) => m.id === newMessage.id)) return prev;

            return [...prev, newMessage];
          });

          // Increment unread if message is from someone else and user isn't viewing
          if (newRow.sender_id !== user?.id && !isViewingRef.current) {
            setUnreadCount((c) => c + 1);
          }
        },
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setIsConnected(false);
    };
  }, [conversationId, user?.id]);

  // ── Send message with optimistic update ────────────────────────────────────
  const sendMessage = useCallback(
    async (
      content: string,
      messageType: DMMessageType = "text",
      gifUrl?: string,
    ): Promise<boolean> => {
      if (!conversationId || !user?.id) return false;
      // For text messages, content must not be empty
      if (messageType === "text" && !content.trim()) return false;

      const tempId = generateTempId();

      // Optimistic message — appears immediately in the UI
      const optimisticMessage: LocalDMMessage = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: messageType === "gif" ? null : content.trim(),
        message_type: messageType,
        gif_url: gifUrl ?? null,
        created_at: new Date().toISOString(),
        sender_name: user.name ?? "You",
        status: "sending",
        _tempId: tempId,
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      // Send to server
      const result = await sendDirectMessage(
        conversationId,
        user.id,
        content,
        messageType,
        gifUrl,
      );

      if (result.success && result.data) {
        // Replace optimistic message with server-confirmed message
        setMessages((prev) =>
          prev.map((m) =>
            m._tempId === tempId
              ? { ...result.data!, status: "sent" as const }
              : m,
          ),
        );
        return true;
      } else {
        // Mark message as failed
        setMessages((prev) =>
          prev.map((m) =>
            m._tempId === tempId ? { ...m, status: "failed" as const } : m,
          ),
        );
        return false;
      }
    },
    [conversationId, user?.id, user?.name],
  );

  // ── Retry failed message ───────────────────────────────────────────────────
  const retryMessage = useCallback(
    async (tempId: string): Promise<boolean> => {
      if (!conversationId || !user?.id) return false;

      const failedMessage = messages.find(
        (m) => m._tempId === tempId && m.status === "failed",
      );
      if (!failedMessage) return false;

      // Mark as sending again
      setMessages((prev) =>
        prev.map((m) =>
          m._tempId === tempId ? { ...m, status: "sending" as const } : m,
        ),
      );

      const result = await sendDirectMessage(
        conversationId,
        user.id,
        failedMessage.content ?? "",
        failedMessage.message_type,
        failedMessage.gif_url ?? undefined,
      );

      if (result.success && result.data) {
        setMessages((prev) =>
          prev.map((m) =>
            m._tempId === tempId
              ? { ...result.data!, status: "sent" as const }
              : m,
          ),
        );
        return true;
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m._tempId === tempId ? { ...m, status: "failed" as const } : m,
          ),
        );
        return false;
      }
    },
    [conversationId, user?.id, messages],
  );

  // ── Mark as read (reset unread count) ──────────────────────────────────────
  const markAsRead = useCallback(() => {
    setUnreadCount(0);
    isViewingRef.current = true;
  }, []);

  return {
    messages,
    isLoading,
    isConnected,
    unreadCount,
    sendMessage,
    retryMessage,
    markAsRead,
  };
}
