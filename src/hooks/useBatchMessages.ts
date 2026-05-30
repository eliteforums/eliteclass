// ---------------------------------------------------------------------------
// useBatchMessages — Real-time batch messaging hook
//
// Fetches initial messages on batch selection, subscribes to Supabase Realtime
// for INSERT events, provides sendMessage with optimistic updates & retry.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  getMessagesForBatch,
  sendMessage as sendMessageService,
  type ChatMessage,
  type MessageType,
} from "@/services/message.service";
import { useAuth } from "@/hooks/useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type MessageStatus = "sending" | "sent" | "failed";

export interface OptimisticChatMessage extends ChatMessage {
  status?: MessageStatus;
  _optimisticId?: string;
}

interface UseBatchMessagesReturn {
  messages: OptimisticChatMessage[];
  isLoading: boolean;
  isConnected: boolean;
  sendMessage: (content: string, messageType?: MessageType, gifUrl?: string) => Promise<boolean>;
  retryMessage: (optimisticId: string) => Promise<boolean>;
}

let optimisticIdCounter = 0;
function generateOptimisticId(): string {
  return `optimistic-${Date.now()}-${++optimisticIdCounter}`;
}

export function useBatchMessages(batchId: string | null): UseBatchMessagesReturn {
  const { user } = useAuth();
  const [messages, setMessages] = useState<OptimisticChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Fetch initial messages when batch changes
  useEffect(() => {
    if (!batchId) {
      setMessages([]);
      setIsConnected(false);
      return;
    }

    let cancelled = false;

    async function fetchMessages() {
      setIsLoading(true);
      const result = await getMessagesForBatch(batchId!, 50);
      if (!cancelled && result.success && result.data) {
        // Mark fetched messages as 'sent'
        setMessages(result.data.map((m) => ({ ...m, status: "sent" as MessageStatus })));
      }
      if (!cancelled) {
        setIsLoading(false);
      }
    }

    fetchMessages();

    return () => {
      cancelled = true;
    };
  }, [batchId]);

  // Set up Supabase Realtime subscription
  useEffect(() => {
    if (!batchId || !supabase) {
      setIsConnected(false);
      return;
    }

    const channel = supabase
      .channel(`batch-messages-${batchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `batch_id=eq.${batchId}`,
        },
        async (payload) => {
          const newRow = payload.new as {
            id: string;
            batch_id: string;
            sender_id: string;
            content: string;
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

          const newMessage: OptimisticChatMessage = {
            id: newRow.id,
            batch_id: newRow.batch_id,
            sender_id: newRow.sender_id,
            sender_name: senderName,
            content: newRow.content ?? "",
            message_type: (newRow.message_type as MessageType) ?? "text",
            gif_url: newRow.gif_url ?? null,
            created_at: newRow.created_at,
            status: "sent",
          };

          setMessages((prev) => {
            // Check if we already have this message (e.g. from optimistic update)
            const existingIndex = prev.findIndex((m) => m.id === newMessage.id);
            if (existingIndex !== -1) {
              // Update the existing message status to 'sent'
              const updated = [...prev];
              updated[existingIndex] = { ...updated[existingIndex], status: "sent" };
              return updated;
            }

            // Check if this is from the current user — replace the optimistic entry
            if (newRow.sender_id === user?.id) {
              // Find the oldest 'sending' optimistic message from this user
              const optimisticIndex = prev.findIndex(
                (m) => m._optimisticId && m.status === "sending" && m.sender_id === newRow.sender_id,
              );
              if (optimisticIndex !== -1) {
                const updated = [...prev];
                updated[optimisticIndex] = newMessage;
                return updated;
              }
            }

            return [...prev, newMessage];
          });
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
  }, [batchId, user?.id]);

  // Send message with optimistic update
  const sendMessage = useCallback(
    async (content: string, messageType: MessageType = "text", gifUrl?: string): Promise<boolean> => {
      if (!batchId || !user?.id) return false;
      // For text messages, content must not be empty
      if (messageType === "text" && !content.trim()) return false;
      // Enforce 2000 character limit
      if (messageType === "text" && content.length > 2000) return false;

      const optimisticId = generateOptimisticId();

      // Create optimistic message and append immediately
      const optimisticMessage: OptimisticChatMessage = {
        id: optimisticId,
        batch_id: batchId,
        sender_id: user.id,
        sender_name: user.name ?? "You",
        content: messageType === "text" ? content.trim() : content,
        message_type: messageType,
        gif_url: gifUrl ?? null,
        created_at: new Date().toISOString(),
        status: "sending",
        _optimisticId: optimisticId,
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      // Send to server
      const result = await sendMessageService(batchId, user.id, content, messageType, gifUrl);

      if (result.success && result.data) {
        // Replace optimistic message with real one (realtime may also do this)
        setMessages((prev) =>
          prev.map((m) =>
            m._optimisticId === optimisticId
              ? { ...result.data!, status: "sent" as MessageStatus, _optimisticId: undefined }
              : m,
          ),
        );
        return true;
      } else {
        // Mark as failed
        setMessages((prev) =>
          prev.map((m) =>
            m._optimisticId === optimisticId ? { ...m, status: "failed" as MessageStatus } : m,
          ),
        );
        return false;
      }
    },
    [batchId, user?.id, user?.name],
  );

  // Retry a failed message
  const retryMessage = useCallback(
    async (optimisticId: string): Promise<boolean> => {
      if (!batchId || !user?.id) return false;

      const failedMessage = messages.find((m) => m._optimisticId === optimisticId && m.status === "failed");
      if (!failedMessage) return false;

      // Update status to 'sending'
      setMessages((prev) =>
        prev.map((m) =>
          m._optimisticId === optimisticId ? { ...m, status: "sending" as MessageStatus } : m,
        ),
      );

      // Retry sending
      const result = await sendMessageService(
        batchId,
        user.id,
        failedMessage.content,
        failedMessage.message_type,
        failedMessage.gif_url ?? undefined,
      );

      if (result.success && result.data) {
        setMessages((prev) =>
          prev.map((m) =>
            m._optimisticId === optimisticId
              ? { ...result.data!, status: "sent" as MessageStatus, _optimisticId: undefined }
              : m,
          ),
        );
        return true;
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m._optimisticId === optimisticId ? { ...m, status: "failed" as MessageStatus } : m,
          ),
        );
        return false;
      }
    },
    [batchId, user?.id, messages],
  );

  return {
    messages,
    isLoading,
    isConnected,
    sendMessage,
    retryMessage,
  };
}
