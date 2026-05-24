// ---------------------------------------------------------------------------
// Lesson content resolution — materials, PDFs, signed URLs for the player
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import {
  getLessonMaterialSignedUrl,
  getVideoSignedUrl,
} from "@/modules/courses/services/upload.service";
import type { ApiResponse, LmsLesson, LmsLessonMaterial } from "@/types";

const NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

export function isPdfMaterial(material: LmsLessonMaterial): boolean {
  const t = material.file_type.toLowerCase();
  return t.includes("pdf") || material.title.toLowerCase().endsWith(".pdf");
}

export function isVideoMaterial(material: LmsLessonMaterial): boolean {
  const t = material.file_type.toLowerCase();
  return t.startsWith("video/") || /\.(mp4|webm|ogg|mov)$/i.test(material.title);
}

/** Resolve a downloadable/viewable URL for a material (always prefer fresh signed URL). */
export async function resolveMaterialUrl(
  material: LmsLessonMaterial,
): Promise<ApiResponse<string>> {
  if (material.storage_path?.trim()) {
    const signed = await getLessonMaterialSignedUrl(material.storage_path.trim());
    if (signed.success && signed.data) {
      return signed;
    }
  }

  const url = material.file_url?.trim();
  if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
    return { data: url, error: null, success: true };
  }

  return {
    data: null,
    error: "Unable to resolve file URL for this resource.",
    success: false,
  };
}

export async function getLessonMaterials(
  lessonId: string,
): Promise<ApiResponse<LmsLessonMaterial[]>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_lesson_materials")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message, success: false };
  return { data: (data ?? []) as LmsLessonMaterial[], error: null, success: true };
}

export function findPrimaryPdfMaterial(materials: LmsLessonMaterial[]): LmsLessonMaterial | null {
  return materials.find(isPdfMaterial) ?? null;
}

export function findPrimaryVideoMaterial(materials: LmsLessonMaterial[]): LmsLessonMaterial | null {
  return materials.find(isVideoMaterial) ?? null;
}

/**
 * Resolve PDF URL for a lesson: legacy lesson fields, then attached PDF materials.
 */
export async function resolveLessonPdfUrl(
  lesson: LmsLesson,
  materials?: LmsLessonMaterial[],
): Promise<ApiResponse<string>> {
  const url = lesson.video_url?.trim();
  if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
    return { data: url, error: null, success: true };
  }

  const legacyPath = lesson.video_storage_path?.trim();
  if (legacyPath) {
    const signed = await getLessonMaterialSignedUrl(legacyPath);
    if (signed.success && signed.data) return signed;
    const videoSigned = await getVideoSignedUrl(legacyPath);
    if (videoSigned.success && videoSigned.data) return videoSigned;
  }

  let mats = materials ?? lesson.materials ?? [];
  if (mats.length === 0) {
    const loaded = await getLessonMaterials(lesson.id);
    if (loaded.success && loaded.data) mats = loaded.data;
  }

  const pdf = findPrimaryPdfMaterial(mats);
  if (pdf) return resolveMaterialUrl(pdf);

  return {
    data: null,
    error: "No PDF attached to this lesson. Ask your instructor to upload a PDF file.",
    success: false,
  };
}

/**
 * Merge lesson row with materials (fetch when nested join omitted them).
 */
export async function hydrateLessonWithMaterials(lesson: LmsLesson): Promise<LmsLesson> {
  if (lesson.materials && lesson.materials.length > 0) return lesson;

  const needsMaterials =
    lesson.lesson_type === "pdf" ||
    lesson.lesson_type === "video" ||
    lesson.lesson_type === "assignment";

  if (!needsMaterials) return lesson;

  const res = await getLessonMaterials(lesson.id);
  if (res.success && res.data?.length) {
    return { ...lesson, materials: res.data };
  }
  return lesson;
}
