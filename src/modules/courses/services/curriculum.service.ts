// ---------------------------------------------------------------------------
// EduOS — LMS Curriculum Service
//
// Database operations for: modules, lessons, lesson materials, and quizzes.
// Every function returns ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import {
  uploadLessonMaterial,
  getLessonMaterialSignedUrl,
} from "@/modules/courses/services/upload.service";
import type {
  ApiResponse,
  LmsModule,
  LmsLesson,
  LmsLessonMaterial,
  LmsQuiz,
  LmsQuizQuestion,
  LmsQuizChoice,
  LmsAssignment,
  CreateModulePayload,
  CreateLessonPayload,
} from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Modules ───────────────────────────────────────────────────────────────────

export async function createModule(
  payload: CreateModulePayload,
  instituteId: string,
): Promise<ApiResponse<LmsModule>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_modules")
    .insert({
      course_id: payload.course_id,
      title: payload.title,
      description: payload.description ?? null,
      position: payload.position,
      institute_id: instituteId,
      is_published: payload.is_published ?? false,
    })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsModule, error: null, success: true };
}

export async function updateModule(
  moduleId: string,
  updates: Partial<Pick<LmsModule, "title" | "description" | "is_published" | "position">>,
): Promise<ApiResponse<LmsModule>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_modules")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", moduleId)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsModule, error: null, success: true };
}

export async function deleteModule(moduleId: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.from("lms_modules").delete().eq("id", moduleId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

export async function reorderModules(
  items: { id: string; position: number }[],
): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    await Promise.all(
      items.map(({ id, position }) =>
        supabase!.from("lms_modules").update({ position }).eq("id", id),
      ),
    );
    return { data: null, error: null, success: true };
  } catch (err) {
    return { data: null, error: String(err), success: false };
  }
}

// ── Lessons ───────────────────────────────────────────────────────────────────

export async function createLesson(
  payload: CreateLessonPayload,
  instituteId: string,
): Promise<ApiResponse<LmsLesson>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_lessons")
    .insert({
      module_id: payload.module_id,
      course_id: payload.course_id,
      institute_id: instituteId,
      title: payload.title,
      description: payload.description ?? null,
      lesson_type: payload.lesson_type,
      position: payload.position,
      is_preview: payload.is_preview ?? false,
      is_published: payload.is_published ?? true,
      content: payload.content ?? null,
      video_url: null,
      video_storage_path: null,
      video_duration_secs: 0,
    })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsLesson, error: null, success: true };
}

export async function updateLesson(
  lessonId: string,
  updates: Partial<LmsLesson>,
): Promise<ApiResponse<LmsLesson>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_lessons")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", lessonId)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsLesson, error: null, success: true };
}

export async function deleteLesson(lessonId: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.from("lms_lessons").delete().eq("id", lessonId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

/** Mark all modules and lessons in a course as published (run when course is published). */
export async function publishCourseCurriculum(courseId: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const now = new Date().toISOString();

  const { error: modErr } = await supabase
    .from("lms_modules")
    .update({ is_published: true, updated_at: now })
    .eq("course_id", courseId);

  if (modErr) return { data: null, error: modErr.message, success: false };

  const { error: lessonErr } = await supabase
    .from("lms_lessons")
    .update({ is_published: true, updated_at: now })
    .eq("course_id", courseId);

  if (lessonErr) return { data: null, error: lessonErr.message, success: false };

  const { error: quizErr } = await supabase
    .from("lms_quizzes")
    .update({ is_published: true, updated_at: now })
    .eq("course_id", courseId);

  if (quizErr) return { data: null, error: quizErr.message, success: false };

  const { error: assignErr } = await supabase
    .from("lms_assignments")
    .update({ is_published: true, updated_at: now })
    .eq("course_id", courseId);

  if (assignErr) return { data: null, error: assignErr.message, success: false };

  return { data: null, error: null, success: true };
}

export async function reorderLessons(
  items: { id: string; position: number }[],
): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    await Promise.all(
      items.map(({ id, position }) =>
        supabase!.from("lms_lessons").update({ position }).eq("id", id),
      ),
    );
    return { data: null, error: null, success: true };
  } catch (err) {
    return { data: null, error: String(err), success: false };
  }
}

// ── Materials ─────────────────────────────────────────────────────────────────

export async function addMaterial(
  materialData: Omit<LmsLessonMaterial, "id" | "created_at">,
): Promise<ApiResponse<LmsLessonMaterial>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const payload = {
    ...materialData,
    file_url: materialData.file_url?.trim() || materialData.storage_path,
  };

  const { data, error } = await supabase
    .from("lms_lesson_materials")
    .insert(payload)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsLessonMaterial, error: null, success: true };
}

/**
 * Upload a file to storage, resolve a signed URL, and persist lms_lesson_materials row.
 */
export async function createLessonMaterialFromUpload(
  lessonId: string,
  courseId: string,
  instituteId: string,
  uploadedBy: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<ApiResponse<LmsLessonMaterial>> {
  if (!instituteId) {
    return { data: null, error: "Institute ID is required for uploads.", success: false };
  }
  if (!uploadedBy) {
    return { data: null, error: "You must be signed in to upload files.", success: false };
  }

  const uploadResult = await uploadLessonMaterial(
    lessonId,
    courseId,
    instituteId,
    file,
    onProgress,
  );

  if (!uploadResult.success || !uploadResult.data) {
    return { data: null, error: uploadResult.error ?? "Upload failed", success: false };
  }

  const signed = await getLessonMaterialSignedUrl(uploadResult.data.storagePath);
  const fileUrl = signed.success && signed.data ? signed.data : uploadResult.data.storagePath;

  return addMaterial({
    lesson_id: lessonId,
    course_id: courseId,
    institute_id: instituteId,
    uploaded_by: uploadedBy,
    title: file.name,
    file_url: fileUrl,
    storage_path: uploadResult.data.storagePath,
    file_type: uploadResult.data.mimeType,
    file_size_bytes: file.size,
    is_downloadable: true,
  });
}

export async function deleteMaterial(materialId: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.from("lms_lesson_materials").delete().eq("id", materialId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

// ── Quizzes ───────────────────────────────────────────────────────────────────

export async function createQuiz(
  quizData: Omit<LmsQuiz, "id" | "created_at" | "updated_at" | "questions">,
): Promise<ApiResponse<LmsQuiz>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.from("lms_quizzes").insert(quizData).select("*").single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsQuiz, error: null, success: true };
}

export async function updateQuiz(
  quizId: string,
  updates: Partial<Omit<LmsQuiz, "id" | "created_at" | "updated_at" | "questions">>,
): Promise<ApiResponse<LmsQuiz>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_quizzes")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", quizId)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsQuiz, error: null, success: true };
}

export async function getQuizWithQuestions(quizId: string): Promise<ApiResponse<LmsQuiz>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_quizzes")
    .select(
      `
      *,
      questions:lms_quiz_questions(
        *,
        choices:lms_quiz_choices(*)
      )
    `,
    )
    .eq("id", quizId)
    .single();

  if (error) return { data: null, error: error.message, success: false };

  const quiz = data as LmsQuiz;
  if (quiz.questions) {
    quiz.questions = quiz.questions
      .sort((a, b) => a.position - b.position)
      .map((q) => ({
        ...q,
        choices: (q.choices ?? []).sort((a, b) => a.position - b.position),
      }));
  }

  return { data: quiz, error: null, success: true };
}

export async function getQuizByLessonId(lessonId: string): Promise<ApiResponse<LmsQuiz | null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_quizzes")
    .select(
      `
      *,
      questions:lms_quiz_questions(
        *,
        choices:lms_quiz_choices(*)
      )
    `,
    )
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) return { data: null, error: error.message, success: false };

  if (!data) return { data: null, error: null, success: true };

  const quiz = data as LmsQuiz;
  if (quiz.questions) {
    quiz.questions = quiz.questions
      .sort((a, b) => a.position - b.position)
      .map((q) => ({
        ...q,
        choices: (q.choices ?? []).sort((a, b) => a.position - b.position),
      }));
  }

  return { data: quiz, error: null, success: true };
}

export async function createQuestion(
  questionData: Omit<LmsQuizQuestion, "id" | "created_at" | "choices">,
): Promise<ApiResponse<LmsQuizQuestion>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_quiz_questions")
    .insert(questionData)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsQuizQuestion, error: null, success: true };
}

export async function updateQuestion(
  questionId: string,
  updates: Partial<Omit<LmsQuizQuestion, "id" | "created_at" | "choices">>,
): Promise<ApiResponse<LmsQuizQuestion>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_quiz_questions")
    .update(updates)
    .eq("id", questionId)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsQuizQuestion, error: null, success: true };
}

export async function deleteQuestion(questionId: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.from("lms_quiz_questions").delete().eq("id", questionId);

  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}

/**
 * Replace all choices for a question atomically:
 * deletes existing choices, then inserts the new set.
 */
export async function upsertChoices(
  questionId: string,
  choices: Omit<LmsQuizChoice, "id" | "question_id">[],
): Promise<ApiResponse<LmsQuizChoice[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // Delete existing
  const { error: deleteError } = await supabase
    .from("lms_quiz_choices")
    .delete()
    .eq("question_id", questionId);

  if (deleteError) return { data: null, error: deleteError.message, success: false };

  if (choices.length === 0) return { data: [], error: null, success: true };

  const { data, error } = await supabase
    .from("lms_quiz_choices")
    .insert(choices.map((c) => ({ ...c, question_id: questionId })))
    .select("*");

  if (error) return { data: null, error: error.message, success: false };
  return { data: (data ?? []) as LmsQuizChoice[], error: null, success: true };
}

// ── Assignments ───────────────────────────────────────────────────────────────

export async function createAssignment(
  assignmentData: Omit<LmsAssignment, "id" | "created_at" | "updated_at" | "submission">,
): Promise<ApiResponse<LmsAssignment>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_assignments")
    .insert(assignmentData)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsAssignment, error: null, success: true };
}

export async function updateAssignment(
  assignmentId: string,
  updates: Partial<Omit<LmsAssignment, "id" | "created_at" | "updated_at" | "submission">>,
): Promise<ApiResponse<LmsAssignment>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_assignments")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsAssignment, error: null, success: true };
}

export async function getAssignmentByLessonId(
  lessonId: string,
): Promise<ApiResponse<LmsAssignment | null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_assignments")
    .select("*")
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsAssignment | null, error: null, success: true };
}
