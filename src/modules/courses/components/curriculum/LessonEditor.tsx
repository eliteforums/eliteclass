// ---------------------------------------------------------------------------
// EduOS — Lesson Editor
//
// A right-side Sheet drawer for editing all lesson details.
// Adapts its content based on lesson_type:
//   video      → video upload + URL + duration
//   pdf        → PDF file upload
//   text       → large textarea editor
//   quiz       → "Configure Quiz" button → QuizCreator dialog
//   assignment → "Configure Assignment" button → inline form dialog
//   live       → URL + date/time fields
//
// Common fields: title, description, is_preview, is_published
// Attachments section: list + upload new materials for all types
// ---------------------------------------------------------------------------

import { useState, useRef, useCallback, useEffect, type ChangeEvent } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  Video,
  FileText,
  HelpCircle,
  ClipboardList,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Radio,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  updateLesson,
  deleteMaterial,
  createAssignment,
  updateAssignment,
  getAssignmentByLessonId,
  createLessonMaterialFromUpload,
} from "@/modules/courses/services/curriculum.service";
import {
  uploadLessonVideo,
  getLessonMaterialSignedUrl,
  getVideoSignedUrl,
} from "@/modules/courses/services/upload.service";
import { QuizCreator } from "@/modules/courses/components/quiz/QuizCreator";
import { LessonMediaPreview } from "@/modules/courses/components/curriculum/LessonMediaPreview";
import { isYouTubeUrl, parseYouTubeVideoUrl } from "@/modules/courses/utils/youtube";
import { isGoogleDriveUrl, parseGoogleDriveUrl } from "@/modules/courses/utils/gdrive";
import {
  validatePdfFile,
  validateVideoFile,
  MAX_ATTACHMENT_BYTES,
  formatMaxSize,
} from "@/modules/courses/utils/media-limits";
import type { LmsLesson, LmsLessonMaterial, LmsAssignment } from "@/types";

type MaterialUploadSource = "pdf-primary" | "attachment";

// ── Props ─────────────────────────────────────────────────────────────────────

interface LessonEditorProps {
  lesson: LmsLesson;
  courseId: string;
  instituteId: string;
  open: boolean;
  onClose: () => void;
  onUpdate: (lesson: LmsLesson) => void;
  userId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isValidHttpUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ── Material Row ──────────────────────────────────────────────────────────────

function MaterialRow({
  material,
  onDelete,
}: {
  material: LmsLessonMaterial;
  onDelete: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 group">
      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{material.title}</p>
        <p className="text-xs text-muted-foreground">
          {material.file_type} · {formatBytes(material.file_size_bytes)}
        </p>
      </div>
      <a
        href={material.file_url}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded p-1.5 text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
        title="Open file"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <button
        type="button"
        onClick={async () => {
          if (!confirm(`Delete "${material.title}"?`)) return;
          setDeleting(true);
          await onDelete(material.id);
          setDeleting(false);
        }}
        disabled={deleting}
        className="rounded p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-colors"
        title="Delete material"
      >
        {deleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

// ── Assignment Form Dialog ────────────────────────────────────────────────────

interface AssignmentFormDialogProps {
  open: boolean;
  onClose: () => void;
  lessonId: string;
  courseId: string;
  instituteId: string;
  userId: string;
  existingAssignment: LmsAssignment | null;
  onSave: (assignment: LmsAssignment) => void;
}

function AssignmentFormDialog({
  open,
  onClose,
  lessonId,
  courseId,
  instituteId,
  userId,
  existingAssignment,
  onSave,
}: AssignmentFormDialogProps) {
  const [title, setTitle] = useState(existingAssignment?.title ?? "");
  const [description, setDescription] = useState(existingAssignment?.description ?? "");
  const [instructions, setInstructions] = useState(existingAssignment?.instructions ?? "");
  const [maxScore, setMaxScore] = useState(existingAssignment?.max_score ?? 100);
  const [allowLate, setAllowLate] = useState(existingAssignment?.allow_late ?? false);
  const [dueDate, setDueDate] = useState(existingAssignment?.due_date?.slice(0, 16) ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Assignment title is required");
      return;
    }
    setSaving(true);
    try {
      if (existingAssignment) {
        const res = await updateAssignment(existingAssignment.id, {
          title: title.trim(),
          description: description || null,
          instructions: instructions || null,
          max_score: maxScore,
          allow_late: allowLate,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
        });
        if (!res.success) {
          toast.error(res.error ?? "Failed to update");
          return;
        }
        onSave(res.data!);
      } else {
        const res = await createAssignment({
          course_id: courseId,
          lesson_id: lessonId,
          institute_id: instituteId,
          created_by: userId,
          title: title.trim(),
          description: description || null,
          instructions: instructions || null,
          attachment_urls: [],
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          max_score: maxScore,
          allow_late: allowLate,
          is_published: false,
          accepted_file_types: [],
        });
        if (!res.success) {
          toast.error(res.error ?? "Failed to create");
          return;
        }
        onSave(res.data!);
      }
      toast.success("Assignment saved");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existingAssignment ? "Edit Assignment" : "Configure Assignment"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Week 1 Homework"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description for students"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Instructions</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Detailed instructions on what to submit and how..."
              rows={4}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Max Score</Label>
              <Input
                type="number"
                min={1}
                value={maxScore}
                onChange={(e) => setMaxScore(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Due Date (Optional)</Label>
              <Input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Allow Late Submissions</p>
              <p className="text-xs text-muted-foreground">
                Students can submit after the due date
              </p>
            </div>
            <Switch checked={allowLate} onCheckedChange={setAllowLate} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save Assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function LessonEditor({
  lesson: initialLesson,
  courseId,
  instituteId,
  open,
  onClose,
  onUpdate,
  userId,
}: LessonEditorProps) {
  const [lesson, setLesson] = useState<LmsLesson>(initialLesson);
  const [materials, setMaterials] = useState<LmsLessonMaterial[]>(initialLesson.materials ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    videoUrl?: string;
    duration?: string;
    content?: string;
    liveUrl?: string;
    materials?: string;
  }>({});

  // Field state (mirror of lesson, editable)
  const [title, setTitle] = useState(lesson.title);
  const [description, setDescription] = useState(lesson.description ?? "");
  const [content, setContent] = useState(lesson.content ?? "");
  const [isPreview, setIsPreview] = useState(lesson.is_preview);
  const [isPublished, setIsPublished] = useState(lesson.is_published ?? true);
  const [videoUrl, setVideoUrl] = useState(lesson.video_url ?? "");
  const [videoDurationSecs, setVideoDurationSecs] = useState(lesson.video_duration_secs ?? 0);
  const [videoStoragePath, setVideoStoragePath] = useState<string | null>(
    lesson.video_storage_path ?? null,
  );

  // Video upload state
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Material upload state
  const [isUploadingMaterial, setIsUploadingMaterial] = useState(false);
  const [materialUploadProgress, setMaterialUploadProgress] = useState(0);
  const [materialUploadSource, setMaterialUploadSource] = useState<MaterialUploadSource | null>(
    null,
  );
  const materialInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Sub-dialogs
  const [showQuizCreator, setShowQuizCreator] = useState(false);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [existingAssignment, setExistingAssignment] = useState<LmsAssignment | null>(null);

  useEffect(() => {
    setLesson(initialLesson);
    setMaterials(initialLesson.materials ?? []);
    setTitle(initialLesson.title);
    setDescription(initialLesson.description ?? "");
    setContent(initialLesson.content ?? "");
    setIsPreview(initialLesson.is_preview);
    setIsPublished(initialLesson.is_published);
    setVideoUrl(initialLesson.video_url ?? "");
    setVideoDurationSecs(initialLesson.video_duration_secs ?? 0);
    setVideoStoragePath(initialLesson.video_storage_path ?? null);
    setFieldErrors({});
  }, [initialLesson]);

  useEffect(() => {
    const loadMaterialUrls = async () => {
      const baseMaterials = initialLesson.materials ?? [];
      if (baseMaterials.length === 0) return;
      const updated = await Promise.all(
        baseMaterials.map(async (mat) => {
          if (mat.file_url) return mat;
          const signed = await getLessonMaterialSignedUrl(mat.storage_path);
          if (signed.success && signed.data) {
            return { ...mat, file_url: signed.data };
          }
          return mat;
        }),
      );
      setMaterials(updated);
    };
    void loadMaterialUrls();
  }, [initialLesson.materials]);

  useEffect(() => {
    if (lesson.lesson_type !== "video") return;
    if (lesson.video_url && isYouTubeUrl(lesson.video_url)) {
      setVideoUrl(lesson.video_url);
      return;
    }
    if (!lesson.video_storage_path) return;
    getVideoSignedUrl(lesson.video_storage_path).then((res) => {
      if (res.success && res.data) setVideoUrl(res.data);
    });
  }, [lesson.video_storage_path, lesson.video_url, lesson.lesson_type]);

  // ── Save lesson core fields ───────────────────────────────────────────────

  const handleSave = async () => {
    const nextErrors: typeof fieldErrors = {};
    if (!title.trim()) nextErrors.title = "Title is required";

    let normalizedYouTubeUrl: string | null = null;

    if (lesson.lesson_type === "video") {
      const hasUpload = !!videoStoragePath;
      const hasUrl = !!videoUrl.trim();
      if (!hasUpload && !hasUrl) {
        nextErrors.videoUrl = "Provide a YouTube URL or upload a video file";
      }
      if (hasUrl && isYouTubeUrl(videoUrl)) {
        const parsed = parseYouTubeVideoUrl(videoUrl.trim());
        if (!parsed.ok) {
          nextErrors.videoUrl = parsed.error;
        } else {
          normalizedYouTubeUrl = parsed.watchUrl;
        }
      } else if (hasUrl && !isValidHttpUrl(videoUrl)) {
        nextErrors.videoUrl = "Enter a valid http(s) URL";
      } else if (hasUrl) {
        normalizedYouTubeUrl = videoUrl.trim();
      }
      if (videoDurationSecs < 0 || Number.isNaN(videoDurationSecs)) {
        nextErrors.duration = "Duration must be 0 or more";
      }
    }

    if (lesson.lesson_type === "text") {
      if (!content.trim() || content.trim().length < 10) {
        nextErrors.content = "Text content must be at least 10 characters";
      }
    }

    if (lesson.lesson_type === "live") {
      if (!videoUrl.trim()) {
        nextErrors.liveUrl = "Meeting URL is required";
      } else if (!isValidHttpUrl(videoUrl)) {
        nextErrors.liveUrl = "Enter a valid http(s) URL";
      }
    }

    if (lesson.lesson_type === "pdf") {
      const hasPdf = materials.some(
        (m) => m.file_type.includes("pdf") || m.title.toLowerCase().endsWith(".pdf"),
      );
      const hasGdrive = !!videoUrl.trim();
      if (!hasPdf && !hasGdrive) {
        nextErrors.materials = "Upload a PDF file or provide a Google Drive link";
      }
      if (hasGdrive) {
        if (!isGoogleDriveUrl(videoUrl)) {
          nextErrors.videoUrl = "Must be a valid Google Drive link";
        } else {
          const parsed = parseGoogleDriveUrl(videoUrl.trim());
          if (!parsed.ok) {
            nextErrors.videoUrl = parsed.error;
          } else {
            normalizedYouTubeUrl = parsed.embedUrl!;
          }
        }
      }
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error("Please fix the highlighted fields");
      return;
    }

    setIsSaving(true);
    const updates: Partial<LmsLesson> = {
      title: title.trim(),
      description: description.trim() || null,
      is_preview: isPreview,
      is_published: isPublished,
      ...(lesson.lesson_type === "text" ? { content: content || null } : {}),
      ...(lesson.lesson_type === "video"
        ? {
            video_url: videoStoragePath ? null : normalizedYouTubeUrl,
            video_storage_path: videoStoragePath,
            video_duration_secs: videoDurationSecs,
          }
        : {}),
      ...(lesson.lesson_type === "live"
        ? {
            video_url: videoUrl.trim() || null,
            video_storage_path: null,
          }
        : {}),
      ...(lesson.lesson_type === "pdf"
        ? {
            video_url: normalizedYouTubeUrl || null,
          }
        : {}),
    };

    const result = await updateLesson(lesson.id, updates);
    setIsSaving(false);

    if (!result.success) {
      toast.error(result.error ?? "Failed to save lesson");
      return;
    }

    const updated = { ...lesson, ...updates, materials } as LmsLesson;
    setLesson(updated);
    if (
      updates.video_url &&
      (isYouTubeUrl(updates.video_url) || isGoogleDriveUrl(updates.video_url))
    ) {
      setVideoUrl(updates.video_url);
    }
    onUpdate(updated);
    toast.success("Lesson saved");
  };

  // ── Video upload ──────────────────────────────────────────────────────────

  const handleVideoFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      if (!isSupabaseConfigured) {
        toast.error("Supabase is not configured.");
        return;
      }
      if (!instituteId) {
        toast.error("Your account is missing an institute. Cannot upload files.");
        return;
      }

      const videoErr = validateVideoFile(file);
      if (videoErr) {
        toast.error(videoErr);
        return;
      }

      setIsUploadingVideo(true);
      setVideoUploadProgress(0);

      try {
        const result = await uploadLessonVideo(
          lesson.id,
          courseId,
          instituteId,
          file,
          setVideoUploadProgress,
        );

        if (result.success && result.data) {
          setVideoStoragePath(result.data.storagePath);
          const signed = await getVideoSignedUrl(result.data.storagePath);
          if (signed.success && signed.data) {
            setVideoUrl(signed.data);
          } else {
            setVideoUrl("");
          }
          const updateRes = await updateLesson(lesson.id, {
            video_url: null,
            video_storage_path: result.data.storagePath,
          });
          if (!updateRes.success) {
            toast.error(updateRes.error ?? "Video uploaded but failed to save lesson");
            return;
          }
          toast.success("Video uploaded");
        } else {
          toast.error(result.error ?? "Video upload failed");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Video upload failed");
      } finally {
        setIsUploadingVideo(false);
        setVideoUploadProgress(0);
      }
    },
    [lesson.id, courseId, instituteId],
  );

  // ── Material upload ───────────────────────────────────────────────────────

  const handleMaterialFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>, source: MaterialUploadSource) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      if (!isSupabaseConfigured) {
        toast.error("Supabase is not configured.");
        return;
      }
      if (!instituteId) {
        toast.error("Your account is missing an institute. Cannot upload files.");
        return;
      }
      if (!userId) {
        toast.error("You must be signed in to upload files.");
        return;
      }

      if (source === "pdf-primary") {
        const pdfErr = validatePdfFile(file);
        if (pdfErr) {
          toast.error(pdfErr);
          return;
        }
      } else if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`File must be smaller than ${formatMaxSize(MAX_ATTACHMENT_BYTES)}.`);
        return;
      }

      setIsUploadingMaterial(true);
      setMaterialUploadSource(source);
      setMaterialUploadProgress(0);

      try {
        const materialResult = await createLessonMaterialFromUpload(
          lesson.id,
          courseId,
          instituteId,
          userId,
          file,
          setMaterialUploadProgress,
        );

        if (!materialResult.success || !materialResult.data) {
          toast.error(materialResult.error ?? "Upload failed");
          return;
        }

        const newMat = materialResult.data;
        const nextMaterials = [...materials, newMat];
        setMaterials(nextMaterials);
        setFieldErrors((prev) => ({ ...prev, materials: undefined }));

        const updatedLesson = { ...lesson, materials: nextMaterials } as LmsLesson;
        setLesson(updatedLesson);
        onUpdate(updatedLesson);

        toast.success(
          source === "pdf-primary"
            ? "PDF uploaded — click Save Lesson to confirm details"
            : "File attached",
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsUploadingMaterial(false);
        setMaterialUploadSource(null);
        setMaterialUploadProgress(0);
      }
    },
    [lesson, materials, courseId, instituteId, userId, onUpdate],
  );

  const materialAccept =
    lesson.lesson_type === "pdf"
      ? "application/pdf,.pdf"
      : lesson.lesson_type === "video"
        ? "video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.mov"
        : "application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.zip";

  const handleDeleteMaterial = useCallback(async (materialId: string) => {
    const result = await deleteMaterial(materialId);
    if (!result.success) {
      toast.error(result.error ?? "Failed to delete material");
      return;
    }
    setMaterials((prev) => prev.filter((m) => m.id !== materialId));
    toast.success("Material removed");
  }, []);

  // ── Open assignment form ──────────────────────────────────────────────────

  const handleOpenAssignment = async () => {
    // Try to load existing
    const res = await getAssignmentByLessonId(lesson.id);
    if (res.success) setExistingAssignment(res.data);
    setShowAssignmentForm(true);
  };

  // ── Render type-specific content ──────────────────────────────────────────

  const renderTypeContent = () => {
    switch (lesson.lesson_type) {
      case "video":
        return (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Video Content</h4>

            <LessonMediaPreview
              lessonType="video"
              videoUrl={videoUrl}
              videoStoragePath={videoStoragePath}
              materials={materials}
            />

            {/* Upload */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Upload Video</Label>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime"
                className="sr-only"
                onChange={handleVideoFileChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => videoInputRef.current?.click()}
                disabled={isUploadingVideo}
                className="w-full"
              >
                {isUploadingVideo ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Video className="h-4 w-4 mr-2" />
                )}
                {isUploadingVideo ? `Uploading… ${videoUploadProgress}%` : "Choose Video File"}
              </Button>
              {isUploadingVideo && <Progress value={videoUploadProgress} className="h-1.5" />}
            </div>

            {/* External URL */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Or Video URL</Label>
              <Input
                type="url"
                value={videoUrl}
                onChange={(e) => {
                  const v = e.target.value;
                  setVideoUrl(v);
                  setVideoStoragePath(null);
                  if (v.trim() && isYouTubeUrl(v)) {
                    const parsed = parseYouTubeVideoUrl(v.trim());
                    setFieldErrors((prev) => ({
                      ...prev,
                      videoUrl: parsed.ok ? undefined : parsed.error,
                    }));
                  } else {
                    setFieldErrors((prev) => ({ ...prev, videoUrl: undefined }));
                  }
                }}
                placeholder="https://www.youtube.com/watch?v=VIDEO_ID"
                className={cn(fieldErrors.videoUrl && "border-destructive")}
              />
              {fieldErrors.videoUrl && (
                <p className="text-xs text-destructive">{fieldErrors.videoUrl}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Paste a single YouTube video link (not a playlist). Supports youtube.com and
                youtu.be.
              </p>
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Duration (seconds)</Label>
              <Input
                type="number"
                min={0}
                value={videoDurationSecs}
                onChange={(e) => {
                  setVideoDurationSecs(Number(e.target.value));
                  setFieldErrors((prev) => ({ ...prev, duration: undefined }));
                }}
                placeholder="0"
                className={cn(fieldErrors.duration && "border-destructive")}
              />
              {fieldErrors.duration && (
                <p className="text-xs text-destructive">{fieldErrors.duration}</p>
              )}
            </div>
          </div>
        );

      case "pdf":
        return (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">PDF Document</h4>
            <p className="text-xs text-muted-foreground">
              Upload the main PDF for this lesson. Students can view it after enrolling.
            </p>
            <LessonMediaPreview
              lessonType="pdf"
              videoUrl=""
              videoStoragePath={null}
              materials={materials}
            />
            {materials.some(
              (m) => m.file_type.includes("pdf") || m.title.toLowerCase().endsWith(".pdf"),
            ) ? (
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 px-3 py-2.5 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-800 dark:text-green-300">
                  PDF uploaded — add more files in Attachments below if needed.
                </p>
              </div>
            ) : (
              <>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(e) => void handleMaterialFileChange(e, "pdf-primary")}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={isUploadingMaterial}
                  className="w-full gap-2"
                >
                  {isUploadingMaterial && materialUploadSource === "pdf-primary" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  {isUploadingMaterial && materialUploadSource === "pdf-primary"
                    ? `Uploading PDF… ${materialUploadProgress}%`
                    : "Upload PDF File"}
                </Button>
                {isUploadingMaterial && materialUploadSource === "pdf-primary" && (
                  <Progress value={materialUploadProgress} className="h-1.5" />
                )}
              </>
            )}
            {fieldErrors.materials && (
              <p className="text-xs text-destructive">{fieldErrors.materials}</p>
            )}

            <div className="space-y-1.5 mt-4">
              <Label className="text-sm font-medium">Or Google Drive Link</Label>
              <Input
                type="url"
                value={videoUrl}
                onChange={(e) => {
                  const v = e.target.value;
                  setVideoUrl(v);
                  if (v.trim() && isGoogleDriveUrl(v)) {
                    const parsed = parseGoogleDriveUrl(v.trim());
                    setFieldErrors((prev) => ({
                      ...prev,
                      videoUrl: parsed.ok ? undefined : parsed.error,
                    }));
                  } else if (v.trim()) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      videoUrl: "Must be a valid Google Drive link",
                    }));
                  } else {
                    setFieldErrors((prev) => ({ ...prev, videoUrl: undefined }));
                  }
                }}
                placeholder="https://drive.google.com/file/d/..."
                className={cn(fieldErrors.videoUrl && "border-destructive")}
              />
              {fieldErrors.videoUrl && (
                <p className="text-xs text-destructive">{fieldErrors.videoUrl}</p>
              )}
            </div>
          </div>
        );

      case "text":
        return (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Text Content</h4>
            <Textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setFieldErrors((prev) => ({ ...prev, content: undefined }));
              }}
              placeholder="Write your lesson content here. Supports plain text and Markdown..."
              rows={12}
              className={cn(
                "font-mono text-sm resize-y",
                fieldErrors.content && "border-destructive",
              )}
            />
            {fieldErrors.content && (
              <p className="text-xs text-destructive">{fieldErrors.content}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Tip: Use Markdown formatting — **bold**, *italic*, `code`, # headings, etc.
            </p>
          </div>
        );

      case "quiz":
        return (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Quiz</h4>
            <p className="text-xs text-muted-foreground">
              Build an interactive quiz for this lesson. Students complete it after watching the
              content.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowQuizCreator(true)}
              className="w-full gap-2"
            >
              <HelpCircle className="h-4 w-4" />
              Configure Quiz
            </Button>
          </div>
        );

      case "assignment":
        return (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Assignment</h4>
            <p className="text-xs text-muted-foreground">
              Set up a submission-based assignment. Students upload their work and you grade it.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenAssignment}
              className="w-full gap-2"
            >
              <ClipboardList className="h-4 w-4" />
              Configure Assignment
            </Button>
            {existingAssignment && (
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 px-3 py-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">
                    Assignment configured
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-400">
                    {existingAssignment.title} · Max score: {existingAssignment.max_score}
                  </p>
                </div>
              </div>
            )}
          </div>
        );

      case "live":
        return (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Live Session</h4>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Meeting URL</Label>
              <Input
                type="url"
                value={videoUrl}
                onChange={(e) => {
                  setVideoUrl(e.target.value);
                  setVideoStoragePath(null);
                  setFieldErrors((prev) => ({ ...prev, liveUrl: undefined }));
                }}
                placeholder="https://meet.google.com/... or Zoom link"
                className={cn(fieldErrors.liveUrl && "border-destructive")}
              />
              {fieldErrors.liveUrl && (
                <p className="text-xs text-destructive">{fieldErrors.liveUrl}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Radio className="h-3.5 w-3.5 text-red-500" />
              Students will see this link when the session is live
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 overflow-hidden flex flex-col"
        >
          {/* Header */}
          <SheetHeader className="px-6 py-4 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className="text-xs flex-shrink-0 capitalize">
                  {lesson.lesson_type}
                </Badge>
                <SheetTitle className="text-base truncate">{lesson.title}</SheetTitle>
              </div>
            </div>
          </SheetHeader>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* ── Common fields ── */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, title: undefined }));
                  }}
                  className={cn(fieldErrors.title && "border-destructive")}
                />
                {fieldErrors.title && (
                  <p className="text-xs text-destructive">{fieldErrors.title}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief summary of what this lesson covers..."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">Free Preview</p>
                    <p className="text-xs text-muted-foreground">Non-enrolled access</p>
                  </div>
                  <Switch
                    checked={isPreview}
                    onCheckedChange={setIsPreview}
                    aria-label="Free preview"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">Published</p>
                    <p className="text-xs text-muted-foreground">Visible to students</p>
                  </div>
                  <Switch
                    checked={isPublished}
                    onCheckedChange={setIsPublished}
                    aria-label="Published status"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* ── Type-specific content ── */}
            {renderTypeContent()}

            <Separator />

            {/* ── Attachments ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">
                  Attachments
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    ({materials.length})
                  </span>
                </h4>
                <div>
                  <input
                    ref={materialInputRef}
                    type="file"
                    accept={materialAccept}
                    className="sr-only"
                    onChange={(e) => void handleMaterialFileChange(e, "attachment")}
                    multiple={false}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => materialInputRef.current?.click()}
                    disabled={isUploadingMaterial}
                    className="gap-1.5"
                  >
                    {isUploadingMaterial ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    Attach File
                  </Button>
                </div>
              </div>

              {isUploadingMaterial && materialUploadSource === "attachment" && (
                <div className="space-y-1.5">
                  <Progress value={materialUploadProgress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    Uploading attachment… {materialUploadProgress}%
                  </p>
                </div>
              )}

              {materials.length === 0 && !isUploadingMaterial ? (
                <p className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
                  No attachments yet. Click "Attach File" to add downloadable resources.
                </p>
              ) : (
                <div className="space-y-2">
                  {materials.map((mat) => (
                    <MaterialRow key={mat.id} material={mat} onDelete={handleDeleteMaterial} />
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Attachments are downloadable resources (PDFs, worksheets, code files, etc.)
              </p>
            </div>
          </div>

          {/* Footer with save button */}
          <div className="flex-shrink-0 border-t border-border px-6 py-4 flex items-center justify-between bg-background">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  isPublished ? "bg-green-500" : "bg-muted-foreground/30",
                )}
              />
              <span className="text-xs text-muted-foreground">
                {isPublished ? "Published" : "Draft"}
              </span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Save Lesson
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Quiz Creator Dialog */}
      {showQuizCreator && (
        <Dialog
          open={showQuizCreator}
          onOpenChange={(o) => {
            if (!o) setShowQuizCreator(false);
          }}
        >
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Quiz Builder — {lesson.title}</DialogTitle>
            </DialogHeader>
            <QuizCreator
              courseId={courseId}
              lessonId={lesson.id}
              instituteId={instituteId}
              createdBy={userId}
              onSave={(quizId) => {
                setShowQuizCreator(false);
                toast.success(`Quiz saved (ID: ${quizId})`);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Assignment Form Dialog */}
      {showAssignmentForm && (
        <AssignmentFormDialog
          open={showAssignmentForm}
          onClose={() => setShowAssignmentForm(false)}
          lessonId={lesson.id}
          courseId={courseId}
          instituteId={instituteId}
          userId={userId}
          existingAssignment={existingAssignment}
          onSave={(a) => setExistingAssignment(a)}
        />
      )}
    </>
  );
}
