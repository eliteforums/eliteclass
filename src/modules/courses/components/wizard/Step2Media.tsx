// ---------------------------------------------------------------------------
// EduOS — LMS Wizard Step 2: Media & Intro
//
// Thumbnail upload with drag-and-drop + preview.
// Intro video: two-tab approach (file upload | external URL).
// Uses FileReader API for instant local preview before upload.
// ---------------------------------------------------------------------------

import { useState, useRef, useCallback, useEffect, DragEvent, ChangeEvent } from "react";
import {
  Upload,
  X,
  Image,
  Video,
  Link2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { introVideoUrlSchema } from "@/modules/courses/validations/course.schema";
import {
  uploadCourseThumbnail,
  uploadIntroVideo,
  getVideoSignedUrl,
} from "@/modules/courses/services/upload.service";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Step2Props {
  courseId: string;
  existingThumbnailUrl?: string | null;
  existingIntroVideoUrl?: string | null;
  existingIntroVideoStoragePath?: string | null;
  onThumbnailUpload: (url: string, storagePath: string) => void;
  onThumbnailRemove: () => void;
  onIntroVideoSet: (value: { externalUrl?: string; storagePath?: string }) => void;
  onIntroVideoRemove: () => void;
  instituteId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isYouTubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/.test(url);
}

function isVimeoUrl(url: string): boolean {
  return /vimeo\.com/.test(url);
}

function getYouTubeEmbedUrl(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
  if (!match) return null;
  return `https://www.youtube.com/embed/${match[1]}`;
}

function getVimeoEmbedUrl(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/);
  if (!match) return null;
  return `https://player.vimeo.com/video/${match[1]}`;
}

function isAllowedFileType(file: File, accept: string): boolean {
  if (!accept) return true;
  const acceptParts = accept.split(",").map((p) => p.trim());
  return acceptParts.some((part) => {
    if (part.endsWith("/*")) {
      const prefix = part.replace("/*", "");
      return file.type.startsWith(prefix);
    }
    if (part.startsWith(".")) {
      return file.name.toLowerCase().endsWith(part.toLowerCase());
    }
    return file.type === part;
  });
}

// ── Drag-and-Drop Upload Zone ─────────────────────────────────────────────────

interface DropZoneProps {
  accept: string;
  maxSizeMB: number;
  label: string;
  hint: string;
  icon: React.ReactNode;
  onFile: (file: File) => void;
  isUploading?: boolean;
  uploadProgress?: number;
  disabled?: boolean;
}

function DropZone({
  accept,
  maxSizeMB,
  label,
  hint,
  icon,
  onFile,
  isUploading,
  uploadProgress = 0,
  disabled,
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      if (!isAllowedFileType(file, accept)) {
        toast.error("Unsupported file type.");
        return;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        toast.error(`File too large. Maximum size is ${maxSizeMB} MB.`);
        return;
      }
      onFile(file);
    },
    [maxSizeMB, onFile, accept],
  );

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading) return;
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input value so same file can be re-selected
    e.target.value = "";
  };

  return (
    <div
      className={cn(
        "relative rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer",
        isDragging
          ? "border-primary bg-primary/5 scale-[1.01]"
          : "border-border hover:border-primary/50 hover:bg-muted/30",
        (disabled || isUploading) && "pointer-events-none opacity-60",
      )}
      onDragEnter={() => setIsDragging(true)}
      onDragLeave={() => setIsDragging(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => !isUploading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={handleChange}
        disabled={disabled || isUploading}
      />

      <div className="flex flex-col items-center gap-3">
        <div className="rounded-full bg-muted p-3 text-muted-foreground">{icon}</div>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={disabled || isUploading}>
          {isUploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Browse file
            </>
          )}
        </Button>
      </div>

      {isUploading && (
        <div className="mt-4 space-y-1.5">
          <Progress value={uploadProgress} className="h-1.5" />
          <p className="text-xs text-muted-foreground">{uploadProgress}% uploaded</p>
        </div>
      )}
    </div>
  );
}

// ── Thumbnail Section ─────────────────────────────────────────────────────────

interface ThumbnailSectionProps {
  courseId: string;
  instituteId: string;
  existingUrl?: string | null;
  onUpload: (url: string, storagePath: string) => void;
  onRemove: () => void;
}

function ThumbnailSection({
  courseId,
  instituteId,
  existingUrl,
  onUpload,
  onRemove,
}: ThumbnailSectionProps) {
  const [preview, setPreview] = useState<string | null>(existingUrl ?? null);
  const [showDropZone, setShowDropZone] = useState(!existingUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);

  useEffect(() => {
    setPreview(existingUrl ?? null);
    setShowDropZone(!existingUrl);
  }, [existingUrl]);

  const handleFile = useCallback(
    async (file: File) => {
      // Show local preview immediately
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);

      setUploadedFile({ name: file.name, size: file.size });
      setIsUploading(true);
      setUploadProgress(0);

      try {
        const result = await uploadCourseThumbnail(courseId, instituteId, file, setUploadProgress);
        if (result.success && result.data) {
          onUpload(result.data.url, result.data.storagePath);
          toast.success("Thumbnail uploaded successfully");
        } else {
          toast.error(result.error ?? "Upload failed");
          // Keep local preview even on error
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "An unexpected error occurred during upload",
        );
      } finally {
        setIsUploading(false);
      }
    },
    [courseId, instituteId, onUpload],
  );

  const handleRemove = () => {
    setPreview(null);
    setUploadedFile(null);
    setUploadProgress(0);
    setShowDropZone(true);
    onRemove();
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-1">Course Thumbnail</h4>
        <p className="text-xs text-muted-foreground">
          This image appears on course cards and the course page. Recommended: 1280×720 px (16:9),
          JPG or PNG, max 5 MB.
        </p>
      </div>

      {preview && !showDropZone ? (
        <div className="relative rounded-xl overflow-hidden border border-border group">
          <img
            src={preview}
            alt="Course thumbnail preview"
            className="w-full aspect-video object-cover"
          />
          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setShowDropZone(true)}
              >
                <Image className="h-4 w-4 mr-1.5" />
                Change
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={handleRemove}>
                <X className="h-4 w-4 mr-1.5" />
                Remove
              </Button>
            </div>
          </div>

          {/* Upload overlay when uploading */}
          {isUploading && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 text-white animate-spin" />
              <div className="w-48 space-y-1">
                <Progress value={uploadProgress} className="h-2 bg-white/20" />
                <p className="text-xs text-white text-center">{uploadProgress}%</p>
              </div>
            </div>
          )}

          {/* File info badge */}
          {uploadedFile && !isUploading && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-1 text-xs text-white">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              {uploadedFile.name} ({formatBytes(uploadedFile.size)})
            </div>
          )}
        </div>
      ) : (
        <DropZone
          accept="image/jpeg,image/png,image/webp,image/gif"
          maxSizeMB={5}
          label="Drop your thumbnail here"
          hint="JPG, PNG, WebP, or GIF • Max 5 MB • 1280×720 recommended"
          icon={<Image className="h-6 w-6" />}
          onFile={handleFile}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
        />
      )}
    </div>
  );
}

// ── Intro Video Section ───────────────────────────────────────────────────────

interface IntroVideoSectionProps {
  courseId: string;
  instituteId: string;
  existingVideoUrl?: string | null;
  existingVideoStoragePath?: string | null;
  onVideoSet: (value: { externalUrl?: string; storagePath?: string }) => void;
  onVideoRemove: () => void;
}

function IntroVideoSection({
  courseId,
  instituteId,
  existingVideoUrl,
  existingVideoStoragePath,
  onVideoSet,
  onVideoRemove,
}: IntroVideoSectionProps) {
  const [activeTab, setActiveTab] = useState<"upload" | "url">("url");
  const [externalUrl, setExternalUrl] = useState(existingVideoUrl ?? "");
  const [urlSaved, setUrlSaved] = useState(!!existingVideoUrl);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [uploadedVideoName, setUploadedVideoName] = useState<string | null>(null);

  useEffect(() => {
    if (existingVideoUrl) {
      setExternalUrl(existingVideoUrl);
      setUrlSaved(true);
      setActiveTab("url");
    }
  }, [existingVideoUrl]);

  useEffect(() => {
    if (!existingVideoStoragePath) return;
    setActiveTab("upload");
    getVideoSignedUrl(existingVideoStoragePath).then((res) => {
      if (res.success && res.data) {
        setUploadedVideoUrl(res.data);
        setUploadedVideoName("Uploaded intro video");
      }
    });
  }, [existingVideoStoragePath]);

  const handleVideoFile = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setUploadProgress(0);
      setUploadedVideoName(file.name);

      try {
        const result = await uploadIntroVideo(courseId, instituteId, file, setUploadProgress);
        if (result.success && result.data) {
          const signed = await getVideoSignedUrl(result.data.storagePath);
          if (signed.success && signed.data) {
            setUploadedVideoUrl(signed.data);
          }
          onVideoSet({ storagePath: result.data.storagePath });
          toast.success("Intro video uploaded successfully");
        } else {
          toast.error(result.error ?? "Video upload failed");
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "An unexpected error occurred during upload",
        );
      } finally {
        setIsUploading(false);
      }
    },
    [courseId, instituteId, onVideoSet],
  );

  const handleUrlSave = () => {
    const trimmed = externalUrl.trim();
    const parsed = introVideoUrlSchema.safeParse(trimmed);
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "Please enter a valid video URL";
      setUrlError(message);
      toast.error(message);
      return;
    }
    setUrlError(null);
    onVideoSet({ externalUrl: parsed.data });
    setUrlSaved(true);
    toast.success("Intro video URL saved");
  };

  const getEmbedUrl = (url: string): string | null => {
    if (isYouTubeUrl(url)) return getYouTubeEmbedUrl(url);
    if (isVimeoUrl(url)) return getVimeoEmbedUrl(url);
    return null;
  };

  const currentVideoUrl = activeTab === "upload" ? uploadedVideoUrl : urlSaved ? externalUrl : null;
  const embedUrl = currentVideoUrl ? getEmbedUrl(currentVideoUrl) : null;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
          Intro Video
          <span className="text-xs font-normal text-muted-foreground">(Optional)</span>
        </h4>
        <p className="text-xs text-muted-foreground">
          A short preview video (1–3 minutes) that entices students to enroll. Supports YouTube,
          Vimeo, or direct upload.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "upload" | "url")}>
        <TabsList className="h-9">
          <TabsTrigger value="upload" className="gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" />
            Upload Video
          </TabsTrigger>
          <TabsTrigger value="url" className="gap-1.5 text-xs">
            <Link2 className="h-3.5 w-3.5" />
            External URL
          </TabsTrigger>
        </TabsList>

        {/* Upload tab */}
        <TabsContent value="upload" className="mt-4 space-y-4">
          {uploadedVideoUrl ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 px-3 py-2.5">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">
                    Video uploaded
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-400 truncate">
                    {uploadedVideoName}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setUploadedVideoUrl(null);
                    setUploadedVideoName(null);
                  }}
                  className="text-muted-foreground hover:text-destructive flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <video
                src={uploadedVideoUrl}
                controls
                className="w-full rounded-lg border border-border aspect-video bg-black"
              />
            </div>
          ) : (
            <DropZone
              accept="video/mp4,video/webm,video/ogg,video/quicktime"
              maxSizeMB={500}
              label="Drop your intro video here"
              hint="MP4, WebM, MOV • Max 500 MB • Keep it under 5 minutes"
              icon={<Video className="h-6 w-6" />}
              onFile={handleVideoFile}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
            />
          )}

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-xs">Upload tips:</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>MP4 (H.264) is recommended for best compatibility</li>
              <li>Keep the resolution at 1080p or 720p</li>
              <li>Include captions for accessibility</li>
            </ul>
          </div>
        </TabsContent>

        {/* External URL tab */}
        <TabsContent value="url" className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">YouTube or Vimeo URL</Label>
            <p className="text-xs text-muted-foreground">
              Paste a public YouTube or Vimeo link. Students can watch it without leaving the
              platform.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="url"
                  value={externalUrl}
                  onChange={(e) => {
                    setExternalUrl(e.target.value);
                    setUrlSaved(false);
                    setUrlError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleUrlSave()}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="pl-9"
                />
              </div>
              <Button
                type="button"
                onClick={handleUrlSave}
                disabled={!externalUrl.trim() || urlSaved}
                variant={urlSaved ? "outline" : "default"}
              >
                {urlSaved ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-1.5 text-green-600" />
                    Saved
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
            {urlError && <p className="text-xs text-destructive">{urlError}</p>}
          </div>

          {/* Video preview */}
          {externalUrl && urlSaved && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Preview:</p>
              {embedUrl ? (
                <div className="relative rounded-xl overflow-hidden border border-border aspect-video bg-black">
                  <iframe
                    src={embedUrl}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="Intro video preview"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <Play className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Custom Video URL</p>
                    <p className="text-xs text-muted-foreground truncate">{externalUrl}</p>
                    <p className="text-xs text-yellow-600 mt-0.5 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Preview only available for YouTube and Vimeo links
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {(uploadedVideoUrl || urlSaved) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setUploadedVideoUrl(null);
            setUploadedVideoName(null);
            setExternalUrl("");
            setUrlSaved(false);
            onVideoRemove();
          }}
          className="w-full text-muted-foreground hover:text-destructive"
        >
          Remove Intro Video
        </Button>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function Step2Media({
  courseId,
  existingThumbnailUrl,
  existingIntroVideoUrl,
  existingIntroVideoStoragePath,
  onThumbnailUpload,
  onThumbnailRemove,
  onIntroVideoSet,
  onIntroVideoRemove,
  instituteId,
}: Step2Props) {
  return (
    <div className="space-y-8">
      {/* Thumbnail */}
      <ThumbnailSection
        courseId={courseId}
        instituteId={instituteId}
        existingUrl={existingThumbnailUrl}
        onUpload={onThumbnailUpload}
        onRemove={onThumbnailRemove}
      />

      <Separator />

      {/* Intro Video */}
      <IntroVideoSection
        courseId={courseId}
        instituteId={instituteId}
        existingVideoUrl={existingIntroVideoUrl}
        existingVideoStoragePath={existingIntroVideoStoragePath}
        onVideoSet={onIntroVideoSet}
        onVideoRemove={onIntroVideoRemove}
      />

      {/* Tips section */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
        <h4 className="text-xs font-semibold text-foreground">📸 Media best practices</h4>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>
            Use a high-quality, relevant thumbnail — it significantly impacts click-through rate
          </li>
          <li>The intro video should focus on what students will achieve, not the syllabus</li>
          <li>Keep the intro video under 3 minutes for best retention</li>
          <li>Ensure the thumbnail text (if any) is readable at small sizes</li>
        </ul>
      </div>
    </div>
  );
}
