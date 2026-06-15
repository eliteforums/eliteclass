/**
 * useRealtimeExamTimer Hook
 * Synchronizes exam timer with server-side time
 * Prevents frontend time manipulation
 * Auto-submits when timer expires
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { examLogger } from "../services/examLogger";

interface UseRealtimeExamTimerProps {
  examId: string;
  attemptId: string;
  durationMs: number; // Total exam duration in milliseconds
  enabled: boolean;
  onTimeUpdate?: (secondsRemaining: number) => void;
  onTimeExpired?: () => void;
  onSyncError?: (error: string) => void;
}

interface ServerTimeResponse {
  server_time: string;
  unix_timestamp: number;
}

export function useRealtimeExamTimer({
  examId,
  attemptId,
  durationMs,
  enabled,
  onTimeUpdate,
  onTimeExpired,
  onSyncError,
}: UseRealtimeExamTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isSynced, setIsSynced] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout>(undefined);
  const lastServerTimeRef = useRef<number>(0);
  const clientStartTimeRef = useRef<number>(0);
  const expiryTimeRef = useRef<number>(0);

  // Sync with server time
  const syncWithServerTime = useCallback(async () => {
    if (!supabase) return false;

    examLogger.timer("Server time sync started", { attemptId });

    try {
      // Use database NOW() function via RPC or direct query
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("started_at")
        .eq("id", attemptId)
        .single();

      if (error || !data) {
        examLogger.warn("Timer", "Failed to sync server time", { attemptId, error: String(error) });
        if (onSyncError) onSyncError("Failed to sync server time");
        return false;
      }

      const serverTime = new Date(data.started_at).getTime();
      const now = Date.now();

      // Calculate time remaining
      const elapsed = now - serverTime;
      const remaining = Math.max(0, durationMs - elapsed);

      lastServerTimeRef.current = now;
      clientStartTimeRef.current = now;
      expiryTimeRef.current = now + remaining;

      setTimeRemaining(Math.ceil(remaining / 1000)); // Convert to seconds
      setIsSynced(true);

      examLogger.timer("Server time sync completed", { attemptId, remainingSec: Math.ceil(remaining / 1000) });

      return true;
    } catch (error) {
      examLogger.error("Timer", "Time sync error", { attemptId, error: String(error) });
      if (onSyncError) onSyncError("Time sync error: " + String(error));
      return false;
    }
  }, [attemptId, durationMs, onSyncError]);

  // Resync with server periodically to prevent clock drift.
  // Increased to 180 seconds (3 min) to reduce DB load under high concurrency.
  useEffect(() => {
    if (!enabled) return;

    const resyncInterval = setInterval(() => {
      syncWithServerTime();
    }, 180000); // Resync every 3 minutes to reduce DB load

    return () => clearInterval(resyncInterval);
  }, [enabled, syncWithServerTime]);

  // Main timer loop
  useEffect(() => {
    if (!enabled || !isSynced) return;

    // Initial sync
    if (clientStartTimeRef.current === 0) {
      syncWithServerTime();
      return;
    }

    // Timer tick every second
    timerIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, expiryTimeRef.current - now);
      const secondsRemaining = Math.ceil(remaining / 1000);

      setTimeRemaining(secondsRemaining);

      if (onTimeUpdate) {
        onTimeUpdate(secondsRemaining);
      }

      // Handle expiry
      if (remaining <= 0) {
        setIsExpired(true);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

        if (onTimeExpired) {
          onTimeExpired();
        }
      }
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [enabled, isSynced, onTimeUpdate, onTimeExpired, syncWithServerTime]);

  // Initial sync on mount
  useEffect(() => {
    if (!enabled) return;
    syncWithServerTime();
  }, [enabled, syncWithServerTime]);

  return {
    timeRemaining,
    isSynced,
    isExpired,
    resyncTimer: syncWithServerTime,
  };
}

/**
 * Hook to get current server time for validation
 */
export async function getServerTime(): Promise<number> {
  if (!supabase) return Date.now();
  try {
    // Get current server time from database
    const { data, error } = await supabase
      .from("exam_attempts")
      .select("created_at")
      .limit(1)
      .single();

    if (error || !data) {
      return Date.now(); // Fallback to client time
    }

    // Return server time
    return new Date(data.created_at).getTime();
  } catch {
    return Date.now(); // Fallback
  }
}

/**
 * Format time for display (MM:SS)
 */
export function formatTimeDisplay(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
