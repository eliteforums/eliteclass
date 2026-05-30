// ---------------------------------------------------------------------------
// StudentAttendancePopup — Shows when teacher sends a geo attendance prompt
//
// Listens via Supabase Realtime for active attendance prompts.
// When one appears, shows a popup with "Mark Present" button.
// Validates GPS proximity before submitting.
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { MapPin, Loader2, CheckCircle, XCircle, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import {
  getActivePrompts,
  respondToAttendancePrompt,
  type AttendancePrompt,
} from "@/services/geoAttendance.service";
import { toast } from "sonner";

type ResponseState = "idle" | "loading" | "present" | "rejected" | "responded";

export function StudentAttendancePopup() {
  const { user } = useAuthStore();
  const [activePrompt, setActivePrompt] = useState<AttendancePrompt | null>(null);
  const [responseState, setResponseState] = useState<ResponseState>("idle");
  const [distance, setDistance] = useState<number | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  // Only show for students
  if (user?.role !== "student") return null;

  // Fetch student record ID
  useEffect(() => {
    if (!user?.id || !supabase) return;
    supabase
      .from("students")
      .select("id")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setStudentId(data.id);
      });
  }, [user?.id]);

  // Poll for active prompts and subscribe to Realtime
  useEffect(() => {
    if (!user?.id || !supabase) return;

    // Initial fetch
    getActivePrompts(user.id).then((res) => {
      if (res.success && res.data && res.data.length > 0) {
        setActivePrompt(res.data[0]); // Show the most recent active prompt
      }
    });

    // Subscribe to new prompts via Realtime
    const channel = supabase
      .channel("attendance-prompts-student")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "attendance_prompts",
        },
        (payload) => {
          const newPrompt = payload.new as AttendancePrompt;
          // Check if this prompt is for one of the student's batches
          // (RLS already filters, but double-check status)
          if (newPrompt.status === "active") {
            setActivePrompt(newPrompt);
            setResponseState("idle");
            setDistance(null);
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
          if (activePrompt?.id === updated.id && updated.status !== "active") {
            setActivePrompt(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
  }, [user?.id]);

  // Countdown timer
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

  async function handleMarkPresent() {
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
          toast.success("Attendance marked! You're within range. ✅");
        } else {
          setResponseState("rejected");
          toast.error(`Too far from class (${Math.round(result.data.distance_meters)}m away). Must be within ${activePrompt.radius_meters}m.`);
        }
      } else {
        setResponseState("idle");
        toast.error(result.error ?? "Failed to mark attendance");
      }
    } catch (err) {
      setResponseState("idle");
      if (err instanceof GeolocationPositionError) {
        toast.error("Could not get your location. Please enable GPS.");
      } else {
        toast.error("Failed to mark attendance. Try again.");
      }
    }
  }

  // No active prompt or already responded — don't show anything
  if (!activePrompt || responseState === "responded") return null;

  const formatTime = (secs: number) => `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`;

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
          <Button onClick={handleMarkPresent} className="w-full gap-2">
            <MapPin className="h-4 w-4" />
            Mark Present
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
              <p className="text-xs text-green-600">{distance ? `${Math.round(distance)}m from teacher` : "Within range"}</p>
            </div>
          </div>
        )}

        {responseState === "rejected" && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 p-3">
            <XCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">Too Far Away</p>
              <p className="text-xs text-destructive/80">
                {distance ? `${Math.round(distance)}m away` : "Outside"} — must be within {activePrompt.radius_meters}m
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
