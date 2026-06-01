// ---------------------------------------------------------------------------
// GeoAttendancePrompt — Teacher sends a GPS-based attendance prompt
//
// Teacher clicks "Start Geo Attendance" → captures GPS → creates prompt
// Shows live response count and allows cancellation.
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2, CheckCircle, XCircle, Users, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import {
  createAttendancePrompt,
  cancelAttendancePrompt,
  getPromptResponses,
  type AttendancePrompt,
  type AttendanceResponse,
} from "@/services/geoAttendance.service";
import { supabase } from "@/lib/supabase";

interface GeoAttendancePromptProps {
  batchId: string;
  batchName: string;
}

export function GeoAttendancePrompt({ batchId, batchName }: GeoAttendancePromptProps) {
  const { user } = useAuthStore();
  const [isCreating, setIsCreating] = useState(false);
  const [activePrompt, setActivePrompt] = useState<AttendancePrompt | null>(null);
  const [responses, setResponses] = useState<AttendanceResponse[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer
  useEffect(() => {
    if (!activePrompt || activePrompt.status !== "active") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    function updateTimer() {
      const expiresAt = new Date(activePrompt!.expires_at).getTime();
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        setActivePrompt((p) => (p ? { ...p, status: "expired" } : null));
      }
    }

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activePrompt?.id, activePrompt?.status]);

  // Subscribe to responses via Realtime
  useEffect(() => {
    if (!activePrompt || !supabase) return;

    // Fetch initial responses
    getPromptResponses(activePrompt.id).then((res) => {
      if (res.success && res.data) setResponses(res.data);
    });

    // Subscribe to new responses
    const channel = supabase
      .channel(`attendance-responses-${activePrompt.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "attendance_responses",
          filter: `prompt_id=eq.${activePrompt.id}`,
        },
        (payload) => {
          const newResponse = payload.new as AttendanceResponse;
          console.log("📡 New attendance response received:", newResponse.id, "status:", newResponse.status);
          setResponses((prev) => {
            if (prev.some((r) => r.id === newResponse.id)) return prev;
            return [...prev, newResponse];
          });
        }
      )
      .subscribe((status) => {
        console.log("📡 Response subscription status:", status);
      });

    return () => {
      console.log("🧹 Cleaning up response listener");
      supabase!.removeChannel(channel);
    };
  }, [activePrompt?.id]);

  async function handleStartPrompt() {
    if (!user) return;

    setIsCreating(true);

    // Get teacher's current GPS
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
        });
      });

      const result = await createAttendancePrompt({
        batchId,
        teacherId: user.id,
        instituteId: user.institute_id,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        radiusMeters: 100,
        durationMinutes: 5,
      });

      if (result.success && result.data) {
        setActivePrompt(result.data);
        setResponses([]);
        toast.success("Attendance prompt sent to all students!");
      } else {
        toast.error(result.error ?? "Failed to create attendance prompt");
      }
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        toast.error("Could not get your location. Please enable GPS.");
      } else {
        toast.error("Failed to start attendance prompt");
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCancel() {
    if (!activePrompt) return;
    const result = await cancelAttendancePrompt(activePrompt.id);
    if (result.success) {
      setActivePrompt((p) => (p ? { ...p, status: "cancelled" } : null));
      toast.success("Attendance prompt cancelled");
    }
  }

  const presentCount = responses.filter((r) => r.status === "present").length;
  const rejectedCount = responses.filter((r) => r.status === "rejected").length;
  const formatTime = (secs: number) => `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`;

  // No active prompt — show start button
  if (!activePrompt || activePrompt.status !== "active") {
    return (
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Geo-Fenced Attendance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Send a GPS-verified attendance prompt to <strong>{batchName}</strong>.
            Students within 100m of your location can mark present.
          </p>

          {activePrompt?.status === "expired" && (
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <p className="text-xs font-medium">Last prompt results:</p>
              <div className="flex gap-3 text-xs">
                <span className="text-green-600">✓ {presentCount} present</span>
                <span className="text-destructive">✗ {rejectedCount} too far</span>
                <span className="text-muted-foreground">{responses.length} total</span>
              </div>
            </div>
          )}

          <Button
            onClick={handleStartPrompt}
            disabled={isCreating}
            className="w-full gap-2"
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Getting your location...
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4" />
                Start Geo Attendance (5 min)
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Active prompt — show live status
  return (
    <Card className="border-green-500/30 bg-green-50/50 dark:bg-green-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2 text-green-700 dark:text-green-400">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Attendance Live — {batchName}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleCancel} className="h-7 text-xs text-destructive">
            <X className="h-3 w-3 mr-1" />
            Cancel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Timer */}
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-mono font-medium">{formatTime(timeLeft)}</span>
          <span className="text-xs text-muted-foreground">remaining</span>
        </div>

        {/* Response counters */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border bg-background p-2.5 text-center">
            <div className="flex items-center justify-center gap-1">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-lg font-bold">{responses.length}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 p-2.5 text-center">
            <div className="flex items-center justify-center gap-1">
              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
              <span className="text-lg font-bold text-green-700 dark:text-green-400">{presentCount}</span>
            </div>
            <p className="text-[10px] text-green-600">Present</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-2.5 text-center">
            <div className="flex items-center justify-center gap-1">
              <XCircle className="h-3.5 w-3.5 text-destructive" />
              <span className="text-lg font-bold text-destructive">{rejectedCount}</span>
            </div>
            <p className="text-[10px] text-destructive">Too Far</p>
          </div>
        </div>

        {/* Response list */}
        {responses.length > 0 && (
          <div className="max-h-32 overflow-y-auto space-y-1">
            {responses.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs bg-background border"
              >
                <span className="font-medium">{r.user_id.slice(0, 8)}...</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{Math.round(r.distance_meters)}m</span>
                  {r.status === "present" ? (
                    <span className="text-green-600 font-medium">✓ Present</span>
                  ) : (
                    <span className="text-destructive font-medium">✗ Too far</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
