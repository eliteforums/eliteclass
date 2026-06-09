import React, { useEffect, useState } from "react";
import { Camera, Monitor, Loader2, ImageOff, X, ZoomIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { getAttemptCaptures } from "../../services/exam.service";
import type { ProctoringCapture } from "../../types";

interface ProctoringCapturesGalleryProps {
  attemptId: string;
  studentName?: string;
}

export function ProctoringCapturesGallery({
  attemptId,
  studentName,
}: ProctoringCapturesGalleryProps) {
  const [captures, setCaptures] = useState<ProctoringCapture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lightbox, setLightbox] = useState<ProctoringCapture | null>(null);

  useEffect(() => {
    setIsLoading(true);
    getAttemptCaptures(attemptId).then(({ data, success }) => {
      if (success && data) setCaptures(data);
      setIsLoading(false);
    });
  }, [attemptId]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading captures…
      </div>
    );
  }

  if (captures.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 text-muted-foreground text-sm gap-2">
        <ImageOff className="h-8 w-8 opacity-30" />
        <p>No captures recorded for this attempt.</p>
        <p className="text-xs">
          Captures are taken only when Camera or Screen Capture monitoring is enabled on the exam.
        </p>
      </div>
    );
  }

  return (
    <>
      {studentName && (
        <p className="text-sm font-medium mb-3">
          Proctoring captures for <strong>{studentName}</strong>
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {captures.map((cap) => (
          <div
            key={cap.id}
            className="group relative cursor-pointer rounded-lg border border-border overflow-hidden hover:border-primary/50 hover:shadow-sm transition-all"
            onClick={() => setLightbox(cap)}
          >
            {cap.signed_url ? (
              <img
                src={cap.signed_url}
                alt={`${cap.capture_type} capture`}
                className="w-full aspect-video object-cover bg-muted"
                loading="lazy"
              />
            ) : (
              <div className="w-full aspect-video bg-muted flex items-center justify-center">
                <ImageOff className="h-6 w-6 text-muted-foreground/30" />
              </div>
            )}

            {/* Zoom icon on hover */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <ZoomIn className="h-6 w-6 text-white drop-shadow" />
            </div>

            <div className="p-2 space-y-1 bg-card">
              <div className="flex items-center gap-1.5">
                {cap.capture_type === "webcam" ? (
                  <Camera className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <Monitor className="h-3 w-3 text-muted-foreground" />
                )}
                <Badge
                  variant="outline"
                  className={`text-[10px] h-4 px-1.5 ${
                    cap.capture_type === "screenshot"
                      ? "border-violet-300 text-violet-600"
                      : "border-blue-300 text-blue-600"
                  }`}
                >
                  {cap.capture_type === "webcam" ? "Webcam" : "Screen"}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {format(new Date(cap.captured_at), "h:mm:ss a")}
              </p>
              {cap.metadata?.time_remaining !== undefined && (
                <p className="text-[10px] text-muted-foreground">
                  {Math.floor(cap.metadata.time_remaining / 60)}m left
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setLightbox(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <div
            className="max-w-3xl w-full space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            {lightbox.signed_url ? (
              <img
                src={lightbox.signed_url}
                alt="Proctoring capture"
                className="w-full rounded-xl shadow-2xl"
              />
            ) : (
              <div className="w-full aspect-video bg-zinc-800 rounded-xl flex items-center justify-center">
                <ImageOff className="h-12 w-12 text-zinc-600" />
              </div>
            )}
            <div className="flex items-center gap-3 text-sm text-white/70">
              <Badge
                variant="outline"
                className={`border-white/30 text-white text-xs ${
                  lightbox.capture_type === "screenshot"
                    ? "bg-violet-900/40"
                    : "bg-blue-900/40"
                }`}
              >
                {lightbox.capture_type === "webcam" ? "📷 Webcam" : "🖥️ Screen"}
              </Badge>
              <span>{format(new Date(lightbox.captured_at), "MMM d, yyyy · h:mm:ss a")}</span>
              {lightbox.metadata?.time_remaining !== undefined && (
                <span>
                  {Math.floor(lightbox.metadata.time_remaining / 60)}m{" "}
                  {lightbox.metadata.time_remaining % 60}s remaining
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
