// ---------------------------------------------------------------------------
// VideoPlayer — HTML5 video + YouTube embed for lesson content
// ---------------------------------------------------------------------------

import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getVideoSignedUrl } from "@/modules/courses/services/upload.service";
import {
  findPrimaryVideoMaterial,
  getLessonMaterials,
  resolveMaterialUrl,
} from "@/modules/courses/services/lesson-content.service";
import { cn } from "@/lib/utils";
import type { LmsLesson, LmsEnrollment } from "@/types";

import {
  isYouTubeUrl,
  getYouTubeEmbedUrl,
  parseYouTubeVideoUrl,
} from "@/modules/courses/utils/youtube";

// ── Time formatting ───────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface VideoPlayerProps {
  lesson: LmsLesson;
  enrollment: LmsEnrollment;
  /** Resume from this position (seconds) */
  savedPosition?: number;
  /** Called every 5 s with (totalWatchedSeconds, currentPosition) */
  onProgress: (watchedSeconds: number, currentPosition: number) => void;
  /** Called when video reaches 90% watched */
  onComplete: () => void;
  instituteId: string;
}

// ── Playback speed options ────────────────────────────────────────────────────

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function VideoPlayer({
  lesson,
  savedPosition = 0,
  onProgress,
  onComplete,
  instituteId,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchSecondsRef = useRef(0);
  const completedFiredRef = useRef(false);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Player UI state
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Resolve video URL ────────────────────────────────────────────────────

  useEffect(() => {
    completedFiredRef.current = false;
    watchSecondsRef.current = 0;
    setLoading(true);
    setError(null);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const videoUrl = lesson.video_url;
    const storagePath = lesson.video_storage_path;

    if (videoUrl && isYouTubeUrl(videoUrl)) {
      // YouTube — no signed URL needed
      setVideoUrl(videoUrl);
      setLoading(false);
      return;
    }

    if (storagePath) {
      // Private storage — fetch a signed URL
      void getVideoSignedUrl(storagePath).then((res) => {
        if (res.success && res.data) {
          setVideoUrl(res.data);
        } else {
          setError(res.error ?? "Failed to load video");
        }
        setLoading(false);
      });
      return;
    }

    if (videoUrl) {
      // Direct external URL (not YouTube)
      setVideoUrl(videoUrl);
      setLoading(false);
      return;
    }

    // Fallback: video uploaded as lesson material attachment
    void (async () => {
      let mats = lesson.materials ?? [];
      if (mats.length === 0) {
        const loaded = await getLessonMaterials(lesson.id);
        if (loaded.success && loaded.data) mats = loaded.data;
      }
      const videoMat = findPrimaryVideoMaterial(mats);
      if (videoMat) {
        const resolved = await resolveMaterialUrl(videoMat);
        if (resolved.success && resolved.data) {
          setVideoUrl(resolved.data);
          setError(null);
        } else {
          setError(resolved.error ?? "Failed to load video file");
        }
      } else {
        setError("No video source found for this lesson.");
      }
      setLoading(false);
    })();
  }, [lesson.id, lesson.video_url, lesson.video_storage_path, lesson.materials]);

  // ── Resume position toast ────────────────────────────────────────────────

  useEffect(() => {
    if (savedPosition > 30 && videoRef.current) {
      toast.info(`Resume from ${formatTime(savedPosition)}`, {
        action: {
          label: "Resume",
          onClick: () => {
            if (videoRef.current) {
              videoRef.current.currentTime = savedPosition;
            }
          },
        },
        duration: 5000,
      });
    }
  }, [videoUrl, savedPosition]);

  // ── Progress interval (fires every 5 s while playing) ───────────────────

  const startProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      const vid = videoRef.current;
      if (!vid) return;
      watchSecondsRef.current += 5;
      onProgress(watchSecondsRef.current, Math.floor(vid.currentTime));
    }, 5000);
  }, [onProgress]);

  const stopProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopProgressInterval();
  }, [stopProgressInterval]);

  // ── Video event handlers ─────────────────────────────────────────────────

  const handleLoadedMetadata = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    setDuration(vid.duration);
    if (savedPosition > 0) {
      vid.currentTime = savedPosition;
    }
  }, [savedPosition]);

  const handleTimeUpdate = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    setCurrentTime(vid.currentTime);

    // Fire onComplete at 90% watch time
    if (!completedFiredRef.current && vid.duration > 0 && vid.currentTime / vid.duration >= 0.9) {
      completedFiredRef.current = true;
      onComplete();
    }
  }, [onComplete]);

  const handlePlay = useCallback(() => {
    setPlaying(true);
    startProgressInterval();
  }, [startProgressInterval]);

  const handlePause = useCallback(() => {
    setPlaying(false);
    stopProgressInterval();
    // Flush progress on pause
    const vid = videoRef.current;
    if (vid) {
      onProgress(watchSecondsRef.current, Math.floor(vid.currentTime));
    }
  }, [stopProgressInterval, onProgress]);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    stopProgressInterval();
    if (!completedFiredRef.current) {
      completedFiredRef.current = true;
      onComplete();
    }
  }, [stopProgressInterval, onComplete]);

  const handleVideoError = useCallback(() => {
    setError("Failed to load the video. Please try again.");
    setLoading(false);
  }, []);

  // ── Custom control actions ───────────────────────────────────────────────

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (playing) {
      void vid.pause();
    } else {
      void vid.play();
    }
  };

  const handleSeek = (value: number[]) => {
    const vid = videoRef.current;
    if (!vid || !duration) return;
    const newTime = (value[0] / 100) * duration;
    vid.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (value: number[]) => {
    const vid = videoRef.current;
    if (!vid) return;
    const v = value[0] / 100;
    vid.volume = v;
    setVolume(v);
    setMuted(v === 0);
  };

  const toggleMute = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !muted;
    setMuted(!muted);
  };

  const handleSpeedChange = (s: number) => {
    const vid = videoRef.current;
    if (vid) vid.playbackRate = s;
    setSpeed(s);
    setShowSpeedMenu(false);
  };

  const handleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen();
    }
  };

  // ── Auto-hide controls ───────────────────────────────────────────────────

  const resetHideTimer = () => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  };

  // ── YouTube embed ────────────────────────────────────────────────────────

  if (videoUrl && isYouTubeUrl(videoUrl)) {
    const parsed = parseYouTubeVideoUrl(videoUrl);
    if (!parsed.ok) {
      return <VideoError message={parsed.error} />;
    }
    const embedUrl = getYouTubeEmbedUrl(parsed.videoId, savedPosition > 30 ? savedPosition : 0);

    return (
      <div className="flex w-full flex-col items-center justify-center bg-muted/20 p-0 md:p-8 overflow-hidden min-h-[50vh]">
        <div className="flex w-full max-w-6xl flex-col bg-black rounded-none md:rounded-3xl overflow-hidden shadow-2xl border-0 md:border border-border/40">
          <div className="relative aspect-video w-full">
            <iframe
              src={embedUrl}
              title={lesson.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              className="absolute inset-0 size-full"
            />
          </div>
          <div className="flex items-center justify-end p-3 bg-slate-950 border-t border-white/5">
            <span className="text-xs font-medium tracking-wide uppercase text-white/40 mr-5">
              Watching an external video?
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={onComplete}
              className="font-semibold shadow-md"
            >
              Mark Video Complete
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex w-full flex-col items-center justify-center bg-muted/20 p-0 md:p-8 min-h-[50vh]">
        <div className="relative aspect-video w-full max-w-6xl bg-black rounded-none md:rounded-3xl overflow-hidden">
          <Skeleton className="absolute inset-0 size-full bg-slate-900" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-lg" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────

  if (error || !videoUrl) {
    return <VideoError message={error ?? "Video not available."} />;
  }

  // ── HTML5 video player ───────────────────────────────────────────────────

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex w-full flex-col items-center justify-center bg-muted/20 p-0 md:p-8 overflow-hidden min-h-[50vh]">
      <div
        ref={containerRef}
        className="group relative aspect-video w-full max-w-6xl overflow-hidden bg-black rounded-none md:rounded-3xl shadow-2xl border-0 md:border border-border/40"
        onMouseMove={resetHideTimer}
        onMouseLeave={() => playing && setShowControls(false)}
      >
        {/* Video element */}
        <video
          ref={videoRef}
          src={videoUrl}
          className="size-full object-contain"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onError={handleVideoError}
          onWaiting={() => setLoading(true)}
          onCanPlay={() => setLoading(false)}
          onClick={togglePlay}
          playsInline
        />

        {/* Buffering spinner */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        {/* Centre play/pause overlay on click */}
        {!playing && !loading && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity hover:bg-black/20"
            aria-label="Play"
          >
            <div className="flex size-16 items-center justify-center rounded-full bg-white/90 shadow-xl transition-transform hover:scale-110">
              <Play className="size-7 translate-x-0.5 text-slate-900" />
            </div>
          </button>
        )}

        {/* Controls overlay */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 transition-opacity duration-300",
            showControls || !playing ? "opacity-100" : "opacity-0",
          )}
        >
          {/* Progress bar */}
          <Slider
            min={0}
            max={100}
            step={0.1}
            value={[progressPct]}
            onValueChange={handleSeek}
            className="mb-3 cursor-pointer [&>span:first-child]:h-1 [&>span:first-child]:bg-white/30 [&_[role=slider]]:size-3 [&_[role=slider]]:border-0 [&_[role=slider]]:bg-primary [&_[role=slider]]:shadow-none"
            aria-label="Video progress"
          />

          <div className="flex items-center gap-2">
            {/* Play / Pause */}
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePlay}
              className="size-8 shrink-0 text-white hover:bg-white/20 hover:text-white"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="size-4 fill-white" />
              ) : (
                <Play className="size-4 fill-white" />
              )}
            </Button>

            {/* Volume */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className="size-8 shrink-0 text-white hover:bg-white/20 hover:text-white"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? (
                <VolumeX className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </Button>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[muted ? 0 : volume * 100]}
              onValueChange={handleVolumeChange}
              className="w-20 [&>span:first-child]:h-1 [&>span:first-child]:bg-white/30 [&_[role=slider]]:size-3 [&_[role=slider]]:border-0 [&_[role=slider]]:bg-white [&_[role=slider]]:shadow-none"
              aria-label="Volume"
            />

            {/* Time */}
            <span className="mx-1 flex-1 text-xs tabular-nums text-white/80">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Speed */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSpeedMenu((v) => !v)}
                className="h-7 px-2 text-xs font-medium text-white hover:bg-white/20 hover:text-white"
              >
                {speed}x
              </Button>
              {showSpeedMenu && (
                <div className="absolute bottom-8 right-0 rounded-md border border-white/10 bg-slate-900 p-1 shadow-lg">
                  {SPEED_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSpeedChange(s)}
                      className={cn(
                        "block w-full rounded px-3 py-1 text-right text-xs text-white hover:bg-white/10",
                        speed === s && "font-bold text-primary",
                      )}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleFullscreen}
              className="size-8 shrink-0 text-white hover:bg-white/20 hover:text-white"
              aria-label="Toggle fullscreen"
            >
              <Maximize className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Error sub-component ───────────────────────────────────────────────────────

function VideoError({ message }: { message: string }) {
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-slate-900 text-white">
      <AlertCircle className="size-10 text-rose-400" />
      <p className="max-w-xs text-center text-sm text-white/70">{message}</p>
    </div>
  );
}
