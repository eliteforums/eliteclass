// ---------------------------------------------------------------------------
// StudentAttendancePopup — Shows when teacher sends a geo attendance prompt
//
// Listens via Supabase Realtime for active attendance prompts.
// When one appears, shows a popup with "Mark Present" button.
// Validates GPS proximity before submitting.
//
// FIXED (2026-06-10):
//   1. Hooks order violation — moved role check after all hooks
//   2. Polling no longer resets response state on same prompt
//   3. Response state properly transitions to "responded" after success
//   4. Pre-checks existing responses to prevent duplicate submissions
//   5. Auto-dismisses popup 3s after successful present marking
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Loader2, CheckCircle, XCircle, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import {
  getActivePrompts,
  respondToAttendancePrompt,
  hasStudentResponded,
  type AttendancePrompt,
} from "@/services/geoAttendance.service";
import { toast } from "sonner";

type ResponseState = "idle" | "loading" | "present" | "rejected" | "responded";

// LocalStorage key to persist responded prompt IDs across page refreshes
const RESPONDED_PROMPTS_KEY = "attendance_responded_prompts";

function getRespondedPromptIds(): string[] {
  try {
    const raw = localStorage.getItem(RESPONDED_PROMPTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addRespondedPromptId(promptId: string) {
  try {
    const ids = getRespondedPromptIds();
    if (!ids.includes(promptId)) {
      ids.push(promptId);
      // Keep only last 50 to prevent unbounded growth
      const trimmed = ids.slice(-50);
      localStorage.setItem(RESPONDED_PROMPTS_KEY, JSON.stringify(trimmed));
    }
  } catch {
    // silently fail
  }
}

function removeRespondedPromptId(promptId: string) {
  try {
    const ids = getRespondedPromptIds().filter((id) => id !== promptId);
    localStorage.setItem(RESPONDED_PROMPTS_KEY, JSON.stringify(ids));
  } catch {
    // silently fail
  }
}

export function StudentAttendancePopup() {
  const { user } = useAuthStore();
  const [activePrompt, setActivePrompt] = useState<AttendancePrompt | null>(null);
  const [responseState, setResponseState] = useState<ResponseState>("idle");
  const [distance, setDistance] = useState<number | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPromptIdRef = useRef<string | null>(null);

  // ── Fetch student record ID ────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || !supabase) return;
    if (user.role !== "student") return;

    supabase
      .from("students")
      .select("id")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setStudentId(data.id);
      });
  }, [user?.id, user?.role]);

  // ── Check for existing response when prompt changes ────────────────────────
  useEffect(() => {
    if (!activePrompt || !studentId) return;
    if (user?.role !== "student") return;

    // Skip check if we already know we responded (from state or localStorage)
    if (responseState === "responded") return;
    if (getRespondedPromptIds().includes(activePrompt.id)) {
      setResponseState("responded");
      return;
    }

    // Server-side check for existing response
    setIsCheckingExisting(true);
    hasStudentResponded(activePrompt.id, studentId)
      .then((res) => {
        if (res.success && res.data) {
          console.log("✓ Student already responded to prompt:", activePrompt.id);
          setResponseState("responded");
          addRespondedPromptId(activePrompt.id);
        }
      })
      .catch(() => {
        // ignore check errors — let them try to submit
      })
      .finally(() => {
        setIsCheckingExisting(false);
      });
  }, [activePrompt?.id, studentId, user?.role]);

  // ── Poll for active prompts and subscribe to Realtime ──────────────────────
  useEffect(() => {
    if (!user?.id || !supabase) {
      console.log("✗ Missing user or supabase:", { user: !!user, supabase: !!supabase });
      return;
    }
    if (user.role !== "student") return;

    console.log("📍 Setting up attendance prompt listener for user:", user.id);

    // Initial fetch
    getActivePrompts(user.id).then((res) => {
      console.log("📍 Initial prompt fetch:", res);
      if (res.success && res.data && res.data.length > 0) {
        const prompt = res.data[0];
        setActivePrompt(prompt);
        prevPromptIdRef.current = prompt.id;
        console.log("✓ Active prompt found:", prompt.id);
      }
    });

    // Fallback polling every 3 seconds to catch prompts if Realtime is delayed
    const pollInterval = setInterval(() => {
      getActivePrompts(user.id).then((res) => {
        if (res.success && res.data && res.data.length > 0) {
          const latestPrompt = res.data[0];

          // Only reset state when a NEW prompt is detected
          setActivePrompt((prev) => {
            if (!prev || prev.id !== latestPrompt.id) {
              console.log("✓ Polling found new prompt:", latestPrompt.id);
              prevPromptIdRef.current = latestPrompt.id;

              // Reset state for new prompt
              setResponseState("idle");
              setDistance(null);

              // Clean up dismissed timer for old prompt
              if (dismissTimerRef.current) {
                clearTimeout(dismissTimerRef.current);
                dismissTimerRef.current = null;
              }

              // Remove from localStorage responded list (new prompt)
              removeRespondedPromptId(latestPrompt.id);

              return latestPrompt;
            }
            return prev;
          });
        }
      });
    }, 3000);

    // Subscribe to new prompts via Realtime with proper RLS filtering
    const channel = supabase
      .channel("attendance-prompts-student", { config: { broadcast: { self: true } } })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "attendance_prompts",
        },
        (payload) => {
          const newPrompt = payload.new as AttendancePrompt;
          console.log("📡 Realtime INSERT received:", newPrompt.id, "status:", newPrompt.status);
          // RLS policy already filters by batch_id, but verify status is active
          if (newPrompt.status === "active") {
            prevPromptIdRef.current = newPrompt.id;
            setActivePrompt(newPrompt);
            setResponseState("idle");
            setDistance(null);

            // Clean up dismissed timer
            if (dismissTimerRef.current) {
              clearTimeout(dismissTimerRef.current);
              dismissTimerRef.current = null;
            }

            removeRespondedPromptId(newPrompt.id);
            console.log("✓ New attendance prompt activated:", newPrompt.id);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "attendance_prompts",
        },
        (payload) => {
          const updated = payload.new as AttendancePrompt;
          console.log("📡 Realtime UPDATE received:", updated.id, "status:", updated.status);
          setActivePrompt((prev) => {
            if (prev?.id === updated.id && updated.status !== "active") {
              console.log("✓ Prompt closed:", updated.id);
              return null;
            }
            return prev;
          });
        }
      )
      .subscribe((status) => {
        console.log("📡 Subscription status:", status);
        if (status === "SUBSCRIBED") {
          console.log("✓ Successfully subscribed to attendance prompts");
        } else if (status === "CHANNEL_ERROR") {
          console.error("✗ Subscription error: Failed to subscribe to attendance prompts. Polling fallback active.");
        }
      });

    return () => {
      console.log("🧹 Cleaning up attendance prompt listener");
      clearInterval(pollInterval);
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
      supabase!.removeChannel(channel);
    };
  }, [user?.id, user?.role]);

  // ── Countdown timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activePrompt) return;

    const interval = setInterval(() => {
      const expiresAt = new Date(activePrompt.expires_at).getTime();
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        setActivePrompt(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activePrompt?.id]);

  // ── Handle mark present ────────────────────────────────────────────────────
  const handleMarkPresent = useCallback(async () => {
    if (!activePrompt || !user || !studentId) return;

    setResponseState("loading");

    try {
      // Get student's current GPS
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const result = await respondToAttendancePrompt({
        promptId: activePrompt.id,
        studentId,
        userId: user.id,
        instituteId: user.institute_id,
        studentLatitude: position.coords.latitude,
        studentLongitude: position.coords.longitude,
        studentAccuracy: position.coords.accuracy,
        teacherLatitude: activePrompt.teacher_latitude,
        teacherLongitude: activePrompt.teacher_longitude,
        radiusMeters: activePrompt.radius_meters,
      });

      if (result.success && result.data) {
        setDistance(result.data.distance_meters);

        if (result.data.status === "present") {
          setResponseState("present");
          addRespondedPromptId(activePrompt.id);
          toast.success("Attendance marked! You're within range. ✅");

          // Auto-dismiss popup after 3 seconds for "present"
          dismissTimerRef.current = setTimeout(() => {
            setResponseState("responded");
          }, 3000);
        } else {
          setResponseState("rejected");
          toast.error(
            `Too far from class (${Math.round(result.data.distance_meters)}m away). Must be within ${activePrompt.radius_meters}m.`
          );
          // Keep "rejected" state visible — student may try again after moving closer
        }
      } else {
        // Check for duplicate response error
        if (result.error?.includes("already responded")) {
          setResponseState("responded");
          addRespondedPromptId(activePrompt.id);
          toast.info("You have already responded to this attendance check.");
        } else {
          setResponseState("idle");
          toast.error(result.error ?? "Failed to mark attendance");
        }
      }
    } catch (err) {
      setResponseState("idle");
      if (err instanceof GeolocationPositionError) {
        toast.error("Could not get your location. Please enable GPS.");
      } else {
        toast.error("Failed to mark attendance. Try again.");
      }
    }
  }, [activePrompt, user, studentId]);

  // ── Early return checks (AFTER all hooks) ──────────────────────────────────
  // Not a student — don't render anything
  if (user?.role !== "student") return null;

  // No active prompt or already responded — don't show anything
  if (!activePrompt || responseState === "responded") return null;

  const formatTime = (secs: number) =>
    `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-2xl border border-primary/30 bg-background shadow-lg shadow-primary/10 p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-semibold">Attendance Check</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Timer className="h-3 w-3" />
            <span className="font-mono">{formatTime(timeLeft)}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Your teacher started attendance. Tap below to verify your presence via GPS.
        </p>

        {/* Action area */}
        {responseState === "idle" && (
          <Button onClick={handleMarkPresent} disabled={isCheckingExisting} className="w-full gap-2">
            {isCheckingExisting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4" />
                Mark Present
              </>
            )}
          </Button>
        )}

        {responseState === "loading" && (
          <Button disabled className="w-full gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying your location...
          </Button>
        )}

        {responseState === "present" && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 p-3">
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Marked Present!</p>
              <p className="text-xs text-green-600">
                {distance ? `${Math.round(distance)}m from teacher` : "Within range"}
              </p>
            </div>
          </div>
        )}

        {responseState === "rejected" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 p-3">
              <XCircle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">Too Far Away</p>
                <p className="text-xs text-destructive/80">
                  {distance ? `${Math.round(distance)}m away` : "Outside"} — must be within{" "}
                  {activePrompt.radius_meters}m
                </p>
              </div>
            </div>
            <Button onClick={handleMarkPresent} variant="outline" className="w-full gap-2">
              <MapPin className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
