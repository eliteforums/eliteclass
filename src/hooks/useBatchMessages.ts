// ---------------------------------------------------------------------------
// useBatchMessages — Real-time batch messaging hook
//
// Fetches initial messages on batch selection, subscribes to Supabase Realtime
// for INSERT events, and provides a sendMessage function.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  getMessagesForBatch,
  sendMessage as sendMessageService,
  type ChatMessage,
} from "@/services/message.service";
import { useAuth } from "@/hooks/useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseBatchMessagesReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isConnected: boolean;
  sendMessage: (content: string) => Promise<boolean>;
}

export function useBatchMessages(batchId: string | null): UseBatchMessagesReturn {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
        setMessages(result.data);
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

          const newMessage: ChatMessage = {
            id: newRow.id,
            batch_id: newRow.batch_id,
            sender_id: newRow.sender_id,
            sender_name: senderName,
            content: newRow.content,
            created_at: newRow.created_at,
          };

          setMessages((prev) => {
            // Avoid duplicates (in case we already added it optimistically)
            if (prev.some((m) => m.id === newMessage.id)) return prev;
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
  }, [batchId]);

  // Send message function
  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!batchId || !user?.id || !content.trim()) return false;

      const result = await sendMessageService(batchId, user.id, content);
      return result.success;
    },
    [batchId, user?.id],
  );

  return {
    messages,
    isLoading,
    isConnected,
    sendMessage,
  };
}
