// ---------------------------------------------------------------------------
// LessonMediaPreview — admin preview for video (YouTube / file) and PDF
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { isYouTubeUrl, parseYouTubeVideoUrl } from "@/modules/courses/utils/youtube";
import {
  resolveMaterialUrl,
  findPrimaryPdfMaterial,
} from "@/modules/courses/services/lesson-content.service";
import { isGoogleDriveUrl, parseGoogleDriveUrl } from "@/modules/courses/utils/gdrive";
import type { LmsLesson, LmsLessonMaterial } from "@/types";

interface LessonMediaPreviewProps {
  lessonType: LmsLesson["lesson_type"];
  videoUrl: string;
  videoStoragePath: string | null;
  materials: LmsLessonMaterial[];
  className?: string;
}

export function LessonMediaPreview({
  lessonType,
  videoUrl,
  videoStoragePath,
  materials,
  className,
}: LessonMediaPreviewProps) {
  if (lessonType === "video") {
    return (
      <VideoPreview videoUrl={videoUrl} videoStoragePath={videoStoragePath} className={className} />
    );
  }

  if (lessonType === "pdf") {
    return <PdfPreview materials={materials} videoUrl={videoUrl} className={className} />;
  }

  return null;
}

function VideoPreview({
  videoUrl,
  videoStoragePath,
  className,
}: {
  videoUrl: string;
  videoStoragePath: string | null;
  className?: string;
}) {
  const trimmed = videoUrl.trim();

  if (trimmed && isYouTubeUrl(trimmed)) {
    const parsed = parseYouTubeVideoUrl(trimmed);
    if (parsed.ok) {
      return (
        <div
          className={`overflow-hidden rounded-lg border border-border aspect-video bg-black ${className ?? ""}`}
        >
          <iframe
            src={parsed.embedUrl}
            title="YouTube preview"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="size-full"
          />
        </div>
      );
    }
    return <PreviewError message={parsed.error} className={className} />;
  }

  return (
    <HostedVideoPreview
      videoStoragePath={videoStoragePath}
      directUrl={trimmed}
      className={className}
    />
  );
}

function HostedVideoPreview({
  videoStoragePath,
  directUrl,
  className,
}: {
  videoStoragePath: string | null;
  directUrl: string;
  className?: string;
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (videoStoragePath) {
      setLoading(true);
      void import("@/modules/courses/services/upload.service").then(({ getVideoSignedUrl }) =>
        getVideoSignedUrl(videoStoragePath).then((res) => {
          setResolvedUrl(res.success ? (res.data ?? null) : null);
          setLoading(false);
        }),
      );
      return;
    }
    if (directUrl) {
      setResolvedUrl(directUrl);
      setLoading(false);
      return;
    }
    setResolvedUrl(null);
    setLoading(false);
  }, [videoStoragePath, directUrl]);

  if (loading) {
    return (
      <div
        className={`flex aspect-video items-center justify-center rounded-lg border border-border bg-muted ${className ?? ""}`}
      >
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!resolvedUrl) return null;

  return (
    <div
      className={`overflow-hidden rounded-lg border border-border aspect-video bg-black ${className ?? ""}`}
    >
      <video src={resolvedUrl} controls className="size-full" key={resolvedUrl} />
    </div>
  );
}

function PdfPreview({
  materials,
  videoUrl,
  className,
}: {
  materials: LmsLessonMaterial[];
  videoUrl?: string;
  className?: string;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedUrl = videoUrl?.trim() ?? "";
  const isGdrive = isGoogleDriveUrl(trimmedUrl);

  const pdf = findPrimaryPdfMaterial(materials);

  useEffect(() => {
    if (isGdrive) {
      const parsed = parseGoogleDriveUrl(trimmedUrl);
      if (parsed.ok) {
        setPdfUrl(parsed.embedUrl!);
        setError(null);
      } else {
        setPdfUrl(null);
        setError(parsed.error ?? "Invalid Google Drive link");
      }
      return;
    }

    if (!pdf) {
      setPdfUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void resolveMaterialUrl(pdf).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setPdfUrl(res.data);
        setError(null);
      } else {
        setPdfUrl(null);
        setError(res.error ?? "Could not load PDF preview");
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pdf?.id, pdf?.storage_path, isGdrive, trimmedUrl]);

  if (!pdf && !isGdrive) return null;

  if (loading) {
    return (
      <div
        className={`flex aspect-[4/3] items-center justify-center rounded-lg border border-border bg-muted ${className ?? ""}`}
      >
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !pdfUrl) {
    return <PreviewError message={error ?? "PDF preview unavailable"} className={className} />;
  }

  return (
    <div className={`overflow-hidden rounded-lg border border-border bg-muted ${className ?? ""}`}>
      <iframe src={pdfUrl} title={pdf.title} className="aspect-[4/3] w-full min-h-[280px]" />
    </div>
  );
}

function PreviewError({ message, className }: { message: string; className?: string }) {
  return (
    <div
      className={`flex aspect-video flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center ${className ?? ""}`}
    >
      <AlertCircle className="size-8 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
