// ---------------------------------------------------------------------------
// EduOS — LMS Upload / Storage Service
// Signed URL generation and file upload for course content & submissions.
// Bucket names align with migration 011 (lms-course-videos, etc.).
// All functions return ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import {
  LMS_DEFAULT_SIGNED_URL_TTL,
  LMS_STORAGE_BUCKETS,
  LMS_VIDEO_SIGNED_URL_TTL,
} from "@/modules/courses/constants/storage";
import type { ApiResponse } from "@/types";

const NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  mov: "video/quicktime",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

/** Infer MIME type when the browser leaves `file.type` empty (common on Windows). */
export function resolveFileMimeType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? (file.type || "application/octet-stream");
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function formatStorageError(
  error: { message: string; statusCode?: string } | null | undefined,
  bucket?: string,
): string {
  const msg = (error && error.message) || "Upload failed";
  // Log detailed error server-side for debugging (doesn't leak keys)
  try {
    // eslint-disable-next-line no-console
    console.error("Storage error for bucket:", bucket, "message:", msg, "raw:", error);
  } catch (_e) {
    // ignore logging failures
  }

  if (msg.includes("row-level security") || msg.includes("403")) {
    return `Storage permission denied for bucket '${bucket ?? "unknown"}'. Ensure you are signed in and policies allow this operation.`;
  }
  if (msg.includes("Bucket not found") || (msg.toLowerCase && msg.toLowerCase().includes("bucket"))) {
    return `Storage bucket not found: '${bucket ?? "unknown"}'. Run Supabase migrations (011 and 014) or create the bucket.`;
  }
  if (msg.includes("mime") || msg.includes("MIME")) {
    return `File type not allowed: ${msg}`;
  }
  return msg;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function uploadWithProgress(
  bucket: string,
  storagePath: string,
  file: File,
  options: { upsert: boolean; contentType: string },
  onProgress?: (progress: number) => void,
): Promise<ApiResponse<null>> {
  if (!supabase) return NOT_CONFIGURED;

  if (!storagePath || storagePath.startsWith("/")) {
    return {
      data: null,
      error: "Invalid storage path — institute ID may be missing.",
      success: false,
    };
  }

  const contentType = options.contentType || resolveFileMimeType(file);
  let timer: ReturnType<typeof setInterval> | null = null;

  try {
    if (onProgress) {
      onProgress(5);

      // Estimate upload time based on file size (assume 500KB/s upload speed)
      // For a 50MB file, this is 100 seconds.
      const estimatedSeconds = Math.max(file.size / (500 * 1024), 2);

      // We want to reach 90% over the estimated time.
      // Progress to gain = 85 (from 5 to 90).
      const tickMs = 300;
      const totalTicks = (estimatedSeconds * 1000) / tickMs;
      const incrementPerTick = 85 / totalTicks;

      let pct = 5;
      timer = setInterval(() => {
        pct = Math.min(pct + incrementPerTick, 92); // Cap at 92%
        onProgress(Math.floor(pct));
      }, tickMs);
    }

    const uploadPromise = supabase.storage.from(bucket).upload(storagePath, file, {
      upsert: options.upsert,
      contentType,
    });

    const { error } = await withTimeout(
      uploadPromise,
      UPLOAD_TIMEOUT_MS,
      "Upload timed out. Check your connection and try a smaller file.",
    );

    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    if (error) {
      onProgress?.(0);
      return { data: null, error: formatStorageError(error, bucket), success: false };
    }

    onProgress?.(100);
    return { data: null, error: null, success: true };
  } catch (err) {
    if (timer) clearInterval(timer);
    onProgress?.(0);
    const message = err instanceof Error ? err.message : "Upload failed unexpectedly";
    return { data: null, error: message, success: false };
  } finally {
    if (timer) clearInterval(timer);
  }
}

// ── getSignedUrl ──────────────────────────────────────────────────────────────

export async function getSignedUrl(
  bucket: string,
  storagePath: string,
  expiresInSeconds = LMS_DEFAULT_SIGNED_URL_TTL,
): Promise<ApiResponse<string>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) return { data: null, error: error.message, success: false };
  return { data: data.signedUrl, error: null, success: true };
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export function getVideoSignedUrl(storagePath: string): Promise<ApiResponse<string>> {
  return getSignedUrl(LMS_STORAGE_BUCKETS.videos, storagePath, LMS_VIDEO_SIGNED_URL_TTL);
}

export function getLessonMaterialSignedUrl(storagePath: string): Promise<ApiResponse<string>> {
  return getSignedUrl(LMS_STORAGE_BUCKETS.materials, storagePath);
}

export function getAssignmentResourceSignedUrl(storagePath: string): Promise<ApiResponse<string>> {
  return getSignedUrl(LMS_STORAGE_BUCKETS.assignment_resources, storagePath);
}

export function getSubmissionSignedUrl(storagePath: string): Promise<ApiResponse<string>> {
  return getSignedUrl(LMS_STORAGE_BUCKETS.assignment_submissions, storagePath);
}

// ── uploadCourseThumbnail ─────────────────────────────────────────────────────

export async function uploadCourseThumbnail(
  courseId: string,
  instituteId: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<ApiResponse<{ url: string; storagePath: string }>> {
  if (!supabase) return NOT_CONFIGURED;
  if (!instituteId) {
    return { data: null, error: "Institute ID is required for uploads.", success: false };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const storagePath = `${instituteId}/courses/${courseId}/thumbnail.${ext}`;

  const { success, error } = await uploadWithProgress(
    LMS_STORAGE_BUCKETS.thumbnails,
    storagePath,
    file,
    { upsert: true, contentType: resolveFileMimeType(file) },
    onProgress,
  );

  if (!success) return { data: null, error, success: false };

  const {
    data: { publicUrl },
  } = supabase.storage.from(LMS_STORAGE_BUCKETS.thumbnails).getPublicUrl(storagePath);

  return { data: { url: publicUrl, storagePath }, error: null, success: true };
}

// ── uploadIntroVideo ──────────────────────────────────────────────────────────

export async function uploadIntroVideo(
  courseId: string,
  instituteId: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<ApiResponse<{ storagePath: string }>> {
  if (!supabase) return NOT_CONFIGURED;
  if (!instituteId) {
    return { data: null, error: "Institute ID is required for uploads.", success: false };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
  const storagePath = `${instituteId}/courses/${courseId}/intro.${ext}`;

  const { success, error } = await uploadWithProgress(
    LMS_STORAGE_BUCKETS.videos,
    storagePath,
    file,
    { upsert: true, contentType: resolveFileMimeType(file) },
    onProgress,
  );

  if (!success) return { data: null, error, success: false };
  return { data: { storagePath }, error: null, success: true };
}

// ── uploadLessonVideo ─────────────────────────────────────────────────────────

export async function uploadLessonVideo(
  lessonId: string,
  courseId: string,
  instituteId: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<ApiResponse<{ storagePath: string }>> {
  if (!supabase) return NOT_CONFIGURED;
  if (!instituteId) {
    return { data: null, error: "Institute ID is required for uploads.", success: false };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
  const storagePath = `${instituteId}/courses/${courseId}/lessons/${lessonId}/video.${ext}`;

  const { success, error } = await uploadWithProgress(
    LMS_STORAGE_BUCKETS.videos,
    storagePath,
    file,
    { upsert: true, contentType: resolveFileMimeType(file) },
    onProgress,
  );

  if (!success) return { data: null, error, success: false };
  return { data: { storagePath }, error: null, success: true };
}

// ── uploadLessonMaterial ──────────────────────────────────────────────────────

export async function uploadLessonMaterial(
  lessonId: string,
  courseId: string,
  instituteId: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<ApiResponse<{ storagePath: string; mimeType: string }>> {
  if (!supabase) return NOT_CONFIGURED;
  if (!instituteId) {
    return { data: null, error: "Institute ID is required for uploads.", success: false };
  }

  const mimeType = resolveFileMimeType(file);
  const safeName = `${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_").toLowerCase()}`;
  const storagePath = `${instituteId}/courses/${courseId}/lessons/${lessonId}/materials/${safeName}`;

  const { success, error } = await uploadWithProgress(
    LMS_STORAGE_BUCKETS.materials,
    storagePath,
    file,
    { upsert: true, contentType: mimeType },
    onProgress,
  );

  if (!success) return { data: null, error, success: false };
  return { data: { storagePath, mimeType }, error: null, success: true };
}

// ── uploadAssignmentSubmission ────────────────────────────────────────────────

/**
 * Upload an assignment resource (Admin)
 */
export async function uploadAssignmentResource(
  instituteId: string,
  assignmentId: string,
  file: File,
  onProgress?: (p: number) => void,
): Promise<ApiResponse<{ url: string; path: string }>> {
  if (!supabase) return NOT_CONFIGURED;

  const fileExt = file.name.split(".").pop();
  const fileName = `${Math.random().toString(36).slice(2)}.${fileExt}`;
  const storagePath = `${instituteId}/assignments/${assignmentId}/resources/${fileName}`;

  const res = await uploadWithProgress(
    LMS_STORAGE_BUCKETS.assignment_resources,
    storagePath,
    file,
    { upsert: true, contentType: resolveFileMimeType(file) },
    onProgress,
  );

  if (!res.success) return { data: null, error: res.error, success: false };

  const {
    data: { publicUrl },
  } = supabase.storage.from(LMS_STORAGE_BUCKETS.assignment_resources).getPublicUrl(storagePath);

  return { data: { url: publicUrl, path: storagePath }, error: null, success: true };
}

/**
 * Upload a student submission file
 */
export async function uploadSubmissionFile(
  instituteId: string,
  assignmentId: string,
  studentId: string,
  file: File,
  onProgress?: (p: number) => void,
): Promise<ApiResponse<{ url: string; path: string }>> {
  if (!supabase) return NOT_CONFIGURED;

  const fileExt = file.name.split(".").pop();
  const fileName = `${Math.random().toString(36).slice(2)}.${fileExt}`;
  const storagePath = `${instituteId}/assignments/${assignmentId}/submissions/${studentId}/${fileName}`;

  const res = await uploadWithProgress(
    LMS_STORAGE_BUCKETS.assignment_submissions,
    storagePath,
    file,
    { upsert: true, contentType: resolveFileMimeType(file) },
    onProgress,
  );

  if (!res.success) return { data: null, error: res.error, success: false };

  const {
    data: { publicUrl },
  } = supabase.storage.from(LMS_STORAGE_BUCKETS.assignment_submissions).getPublicUrl(storagePath);

  return { data: { url: publicUrl, path: storagePath }, error: null, success: true };
}
