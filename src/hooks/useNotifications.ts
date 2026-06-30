// ---------------------------------------------------------------------------
// useNotifications — Real-time notification hook
//
// Fetches initial notifications and unread count on mount, subscribes to
// Supabase Realtime for INSERT events on the notifications table filtered by
// recipient_id, and falls back to polling every 30 seconds if the realtime
// connection is lost. Resumes realtime and stops polling on reconnection.
//
// Requirements: 5.1, 5.5, 5.6
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  getNotifications,
  getUnreadCount,
  markAsRead as markAsReadService,
  markAllAsRead as markAllAsReadService,
  type Notification,
} from "@/services/notification.service";
import { useAuth } from "@/hooks/useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Best-effort browser-native notification. Silently no-ops when:
 *   - the Notification API is missing (Safari iOS, locked-down browsers)
 *   - the user hasn't granted permission yet
 *   - the page is currently focused (sonner toast handles in-app feedback)
 */
function showBrowserNotification(n: Notification) {
  if (typeof window === "undefined") return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const native = new Notification(n.title, {
      body: n.body,
      icon: "/favicon.svg",
      tag: `eliteclass-${n.id}`,
    });
    native.onclick = () => {
      window.focus();
      native.close();
    };
  } catch {
    // Quota / service worker conflict — fall through silently.
  }
}

/** Ask once per session, only if the user is signed in and hasn't decided yet. */
function maybeRequestNotificationPermission() {
  if (typeof window === "undefined") return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    void Notification.requestPermission().catch(() => {
      // ignore; user can re-enable from browser settings
    });
  }
}

const POLLING_INTERVAL_MS = 30_000; // 30 seconds

interface UseNotificationsReturn {
  /** Most recent notifications (up to 20) */
  notifications: Notification[];
  /** Count of unread notifications */
  unreadCount: number;
  /** Whether the realtime connection is active */
  isConnected: boolean;
  /** Mark a single notification as read */
  markAsRead: (notificationId: string) => Promise<boolean>;
  /** Mark all notifications as read */
  markAllAsRead: () => Promise<boolean>;
  /** Whether initial data is loading */
  isLoading: boolean;
}

export function useNotifications(): UseNotificationsReturn {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPollingRef = useRef(false);
  // Tracks IDs that have already been surfaced (initial load + previous polls)
  // so we don't toast the same notification twice when realtime and polling
  // race to deliver the same row.
  const seenIdsRef = useRef<Set<string>>(new Set());
  // First fetch on mount populates the baseline silently — only surface
  // *new* notifications that arrive after this point.
  const baselineLoadedRef = useRef(false);

  // ── Fetch initial data ──────────────────────────────────────────────────────

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;

    const [notifResult, countResult] = await Promise.all([
      getNotifications(userId, 20),
      getUnreadCount(userId),
    ]);

    if (notifResult.success && notifResult.data) {
      const fresh = notifResult.data;

      if (!baselineLoadedRef.current) {
        // First load — record what's already there without firing toasts.
        fresh.forEach((n) => seenIdsRef.current.add(n.id));
        baselineLoadedRef.current = true;
      } else {
        // Subsequent polls — diff to find genuinely new entries.
        const newOnes = fresh.filter((n) => !seenIdsRef.current.has(n.id));
        newOnes.forEach((n) => {
          seenIdsRef.current.add(n.id);
          if (!n.is_read) {
            toast.message(n.title, {
              description: n.body,
              duration: 6000,
            });
            showBrowserNotification(n);
          }
        });
      }

      setNotifications(fresh);
    }
    if (countResult.success && countResult.data !== null) {
      setUnreadCount(countResult.data);
    }
  }, [userId]);

  // ── Polling fallback ────────────────────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (isPollingRef.current) return; // Already polling
    isPollingRef.current = true;

    pollingRef.current = setInterval(() => {
      fetchNotifications();
    }, POLLING_INTERVAL_MS);
  }, [fetchNotifications]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    isPollingRef.current = false;
  }, []);

  // ── Initial fetch on mount / user change ────────────────────────────────────

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setIsConnected(false);
      return;
    }

    let cancelled = false;

    async function loadInitial() {
      setIsLoading(true);
      await fetchNotifications();
      if (!cancelled) {
        setIsLoading(false);
      }
    }

    loadInitial();
    maybeRequestNotificationPermission();

    // Always start polling as a reliable fallback (every 30s)
    const pollingInterval = setInterval(() => {
      fetchNotifications();
    }, POLLING_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollingInterval);
    };
  }, [userId, fetchNotifications]);

  // ── Supabase Realtime subscription ──────────────────────────────────────────

  useEffect(() => {
    if (!userId || !supabase) {
      setIsConnected(false);
      return;
    }

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        async (payload) => {
          const newRow = payload.new as {
            id: string;
            institute_id: string;
            sender_id: string;
            recipient_id: string;
            title: string;
            body: string;
            is_read: boolean;
            created_at: string;
            read_at: string | null;
          };

          // Fetch sender info with error handling
          let sender: Notification["sender"] | undefined;
          try {
            if (supabase && newRow.sender_id) {
              const { data: userData } = await supabase
                .from("users")
                .select("id, name, role")
                .eq("id", newRow.sender_id)
                .single();
              if (userData) {
                sender = userData as { id: string; name: string; role: string };
              }
            }
          } catch {
            // Sender fetch failed — continue without sender info
          }

          const newNotification: Notification = {
            id: newRow.id,
            institute_id: newRow.institute_id,
            sender_id: newRow.sender_id,
            recipient_id: newRow.recipient_id,
            title: newRow.title,
            body: newRow.body,
            is_read: newRow.is_read,
            created_at: newRow.created_at,
            read_at: newRow.read_at,
            sender,
          };

          // Prepend new notification (newest first) and avoid duplicates
          let wasDuplicate = false;
          setNotifications((prev) => {
            if (prev.some((n) => n.id === newNotification.id)) {
              wasDuplicate = true;
              return prev;
            }
            // Keep max 20 notifications in the list
            return [newNotification, ...prev].slice(0, 20);
          });

          if (wasDuplicate) return;

          // Record in the seen-set so a follow-up poll doesn't toast it again.
          seenIdsRef.current.add(newNotification.id);

          // Increment unread count for new unread notifications
          if (!newRow.is_read) {
            setUnreadCount((prev) => prev + 1);
          }

          // In-app toast (always visible) + browser notification (when window
          // is hidden and permission was granted).
          toast.message(newNotification.title, {
            description: newNotification.body,
            duration: 6000,
          });
          showBrowserNotification(newNotification);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
          // Stop polling when realtime is re-established
          stopPolling();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setIsConnected(false);
          // Start polling fallback on connection loss
          startPolling();
        } else if (status === "CLOSED") {
          setIsConnected(false);
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      stopPolling();
      setIsConnected(false);
    };
  }, [userId, startPolling, stopPolling]);

  // ── Mark as read ────────────────────────────────────────────────────────────

  const markAsRead = useCallback(
    async (notificationId: string): Promise<boolean> => {
      const result = await markAsReadService(notificationId);
      if (result.success) {
        // Update local state
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId
              ? { ...n, is_read: true, read_at: new Date().toISOString() }
              : n,
          ),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
        return true;
      }
      return false;
    },
    [],
  );

  // ── Mark all as read ────────────────────────────────────────────────────────

  const markAllAsRead = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;

    const result = await markAllAsReadService(userId);
    if (result.success) {
      // Update local state
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          is_read: true,
          read_at: n.read_at ?? new Date().toISOString(),
        })),
      );
      setUnreadCount(0);
      return true;
    }
    return false;
  }, [userId]);

  return {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    isLoading,
  };
}
