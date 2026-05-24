// ---------------------------------------------------------------------------
// EduOS — LMS Course Service
//
// All database operations for lms_courses and lms_categories tables.
// Follows the same null-safe Supabase pattern as student.service.ts.
// Every function returns ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase, supabaseAdmin } from "@/lib/supabase";
import { publishCourseCurriculum } from "@/modules/courses/services/curriculum.service";
import type {
  ApiResponse,
  LmsCourse,
  LmsCategory,
  LmsCourseWithCurriculum,
  LmsEnrollment,
  LmsLesson,
  LmsLessonMaterial,
  LmsCourseStatus,
  LmsDifficulty,
  CreateCoursePayload,
  LmsModule,
} from "@/types";

// ── List / filter types ───────────────────────────────────────────────────────

export interface CourseListFilters {
  search?: string;
  status?: LmsCourseStatus;
  difficulty?: LmsDifficulty;
  category_id?: string;
  course_id?: string;
  /** Limit results to courses created by or assigned to a specific user (staff-scoped view) */
  staff_id?: string;
  /** Legacy: Limit results to courses created by a specific user */
  created_by?: string;
  page?: number;
  pageSize?: number;
}

export interface CourseListResult {
  items: LmsCourse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CourseStats {
  total: number;
  published: number;
  draft: number;
  archived: number;
  totalEnrollments: number;
}

// ── Shared "not configured" error response ───────────────────────────────────
const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Utility ───────────────────────────────────────────────────────────────────

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || "course"}-${suffix}`;
}

/** Columns that may be written via create/update — excludes joins and counters. */
const COURSE_WRITABLE_KEYS = [
  "title",
  "subtitle",
  "description",
  "category_id",
  "course_id",
  "difficulty",
  "language",
  "tags",
  "estimated_duration_mins",
  "visibility",
  "pricing",
  "price",
  "prerequisites",
  "learning_outcomes",
  "thumbnail_url",
  "thumbnail_storage_path",
  "intro_video_url",
  "intro_video_storage_path",
  "status",
  "published_at",
  "is_featured",
] as const;

function sanitizeCoursePayload(
  payload: Partial<LmsCourse> | CreateCoursePayload,
): Record<string, unknown> {
  // Filter and sanitize payload
  const out: Record<string, any> = {};
  COURSE_WRITABLE_KEYS.forEach((key) => {
    if (key in payload) {
      let val = (payload as any)[key];
      // Convert empty strings to null for UUID/Optional columns to avoid "invalid input syntax for type uuid"
      if (
        (key === "category_id" || key === "course_id") &&
        (val === "" || val === "none")
      ) {
        val = null;
      }
      out[key] = val;
    }
  });
  if (out.subtitle === "") out.subtitle = null;
  if (out.description === "") out.description = null;
  if (typeof out.price === "number") out.price = Number(out.price);

  return out;
}

// ── Course CRUD ───────────────────────────────────────────────────────────────

export async function createCourse(
  payload: CreateCoursePayload,
  instituteId: string,
  userId: string,
): Promise<ApiResponse<LmsCourse>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const slug = generateSlug(payload.title);
  const fields = sanitizeCoursePayload(payload);

  const { data, error } = await supabase
    .from("lms_courses")
    .insert({
      ...fields,
      institute_id: instituteId,
      created_by: userId,
      slug,
      status: "draft",
      total_modules: 0,
      total_lessons: 0,
      total_enrollments: 0,
      total_completions: 0,
      is_featured: false,
    })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };

  return { data: data as LmsCourse, error: null, success: true };
}

export async function updateCourse(
  courseId: string,
  updates: Partial<LmsCourse>,
): Promise<ApiResponse<LmsCourse>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const sanitizedUpdates = sanitizeCoursePayload(updates);

  const { data, error } = await supabase
    .from("lms_courses")
    .update({ ...sanitizedUpdates, updated_at: new Date().toISOString() })
    .eq("id", courseId)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };

  return { data: data as LmsCourse, error: null, success: true };
}

export async function getCourseById(courseId: string): Promise<ApiResponse<LmsCourse>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_courses")
    .select("*, category:lms_categories(*)")
    .eq("id", courseId)
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsCourse, error: null, success: true };
}

function sortCurriculum(course: LmsCourseWithCurriculum): LmsCourseWithCurriculum {
  if (!course.modules?.length) {
    course.modules = [];
    return course;
  }

  course.modules = course.modules
    .sort((a, b) => a.position - b.position)
    .map((mod) => ({
      ...mod,
      lessons: (mod.lessons ?? []).sort((a, b) => a.position - b.position),
    }));

  return course;
}

/** Attach flat lesson rows to modules when nested embed returns empty lesson arrays (RLS edge cases). */
function mergeLessonsIntoModules(
  modules: LmsModule[],
  flatLessons: Array<LmsLesson & { materials?: LmsLessonMaterial[] }>,
): LmsCourseWithCurriculum["modules"] {
  const byModule = new Map<string, typeof flatLessons>();
  for (const lesson of flatLessons) {
    const list = byModule.get(lesson.module_id) ?? [];
    list.push(lesson);
    byModule.set(lesson.module_id, list);
  }

  const matchedLessonIds = new Set<string>();

  const mergedModules = modules.map((mod) => {
    const nested = (mod as any).lessons ?? [];
    const merged =
      nested.length > 0
        ? nested
        : (byModule.get(mod.id) ?? []).sort((a, b) => a.position - b.position);

    merged.forEach((lesson) => matchedLessonIds.add(lesson.id));

    return { ...mod, lessons: merged };
  });

  const orphanLessons = flatLessons
    .filter((lesson) => !matchedLessonIds.has(lesson.id))
    .sort((a, b) => a.position - b.position);

  if (orphanLessons.length > 0) {
    mergedModules.push({
      id: `${modules[0]?.course_id ?? "course"}-fallback-module`,
      course_id: modules[0]?.course_id ?? orphanLessons[0].course_id,
      institute_id: modules[0]?.institute_id ?? orphanLessons[0].institute_id,
      title: "Course Lessons",
      description: null,
      position: mergedModules.length + 1,
      is_published: true,
      created_at: orphanLessons[0].created_at,
      updated_at: orphanLessons[0].updated_at,
      lessons: orphanLessons,
    });
  }

  return mergedModules;
}

export async function getCourseWithCurriculum(
  courseId: string,
  instituteId?: string,
): Promise<ApiResponse<LmsCourseWithCurriculum>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // 1. Fetch the course base metadata
  const { data: courseData, error: courseError } = await supabase
    .from("lms_courses")
    .select("*, category:lms_categories(*)")
    .eq("id", courseId)
    .single();

  if (courseError) {
    console.error(`[getCourseWithCurriculum] Error fetching course ${courseId}:`, courseError);
    return { data: null, error: courseError.message, success: false };
  }

  // 2. Fetch modules and lessons in parallel to bypass nested RLS issues
  const [modulesRes, lessonsRes] = await Promise.all([
    supabase
      .from("lms_modules")
      .select("*")
      .eq("course_id", courseId)
      .order("position", { ascending: true }),
    supabase
      .from("lms_lessons")
      .select("*, materials:lms_lesson_materials(*)")
      .eq("course_id", courseId)
      .order("position", { ascending: true }),
  ]);

  if (modulesRes.error) console.error("[getCourseWithCurriculum] Modules fetch error:", modulesRes.error);
  if (lessonsRes.error) console.error("[getCourseWithCurriculum] Lessons fetch error:", lessonsRes.error);

  const modules = (modulesRes.data ?? []) as LmsModule[];
  const lessons = (lessonsRes.data ?? []) as Array<LmsLesson & { materials?: LmsLessonMaterial[] }>;

  console.log(`[getCourseWithCurriculum] Course: ${courseData.title}, Modules: ${modules.length}, Lessons: ${lessons.length}`);

  // 3. Assemble the curriculum
  const courseWithCurriculum: LmsCourseWithCurriculum = {
    ...courseData,
    modules: mergeLessonsIntoModules(modules, lessons),
  };

  return { 
    data: sortCurriculum(courseWithCurriculum), 
    error: null, 
    success: true 
  };
}

// ── Enrollment (backward-compat for student learning route) ─────────────────

export async function getStudentEnrollment(
  courseId: string,
  studentId: string,
  instituteId?: string,
): Promise<ApiResponse<LmsEnrollment>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // 1. Try to get existing LMS enrollment
  let query = supabase
    .from("lms_enrollments")
    .select("*")
    .eq("course_id", courseId)
    .eq("student_id", studentId)
    .in("status", ["active", "completed"]);

  if (instituteId) {
    query = query.eq("institute_id", instituteId);
  }

  const { data: lmsData, error: lmsError } = await query.maybeSingle();

  if (lmsError) {
    console.error("[getStudentEnrollment] Error checking LMS enrollment:", lmsError);
    return { data: null, error: lmsError.message, success: false };
  }
  
  if (lmsData) {
    return { data: lmsData as LmsEnrollment, error: null, success: true };
  }

  // 2. If no LMS enrollment, check for academic enrollment (The "Proper Wire")
  console.log(`[getStudentEnrollment] No direct LMS enrollment found for student ${studentId} in course ${courseId}. Checking academic assignment...`);
  
  const { data: lmsCourse, error: lmsCourseError } = await supabase
    .from("lms_courses")
    .select("course_id, institute_id, title")
    .eq("id", courseId)
    .single();

  if (lmsCourseError || !lmsCourse || !lmsCourse.course_id) {
    console.warn(`[getStudentEnrollment] LMS Course ${courseId} has no linked academic course. Access denied.`);
    return {
      data: null,
      error: "You are not enrolled in this course.",
      success: false,
    };
  }

  // Check student record to get the internal student ID
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", studentId)
    .single();

  if (studentError || !student) {
    console.error(`[getStudentEnrollment] Failed to find student record for user ${studentId}`);
    return { data: null, error: "Student record not found.", success: false };
  }

  const { data: academicData, error: academicError } = await supabase
    .from("student_courses")
    .select("*")
    .eq("course_id", lmsCourse.course_id)
    .eq("student_id", student.id)
    .eq("status", "active")
    .maybeSingle();

  if (academicError) {
    console.error("[getStudentEnrollment] Academic enrollment check error:", academicError);
    return { data: null, error: academicError.message, success: false };
  }

  if (academicData) {
    // 3. AUTO-ENROLL in LMS based on academic assignment
    console.log(`[getStudentEnrollment] Auto-enrolling student in LMS course "${lmsCourse.title}" based on direct academic assignment`);
    return createAutoEnrollment(courseId, studentId, lmsCourse.institute_id);
  }

  // 4. Check for Batch-based enrollment (The most common path)
  console.log(`[getStudentEnrollment] Checking batch-based enrollment for student ${student.id}`);
  const { data: batchData, error: batchError } = await supabase
    .from("batches")
    .select("id")
    .eq("course_id", lmsCourse.course_id)
    .eq("id", student.batch_id) // student.batch_id comes from the student fetch below
    .maybeSingle();

  // Wait, I need to ensure the 'student' fetch includes batch_id
  // Let's re-fetch student with batch_id to be sure
  const { data: fullStudent, error: fullStudentError } = await supabase
    .from("students")
    .select("id, batch_id")
    .eq("user_id", studentId)
    .single();

  if (!fullStudentError && fullStudent?.batch_id) {
    const { data: batchAssignment } = await supabase
      .from("batches")
      .select("id")
      .eq("id", fullStudent.batch_id)
      .eq("course_id", lmsCourse.course_id)
      .maybeSingle();

    if (batchAssignment) {
      console.log(`[getStudentEnrollment] Auto-enrolling student in LMS course "${lmsCourse.title}" based on Batch assignment (${fullStudent.batch_id})`);
      return createAutoEnrollment(courseId, studentId, lmsCourse.institute_id);
    }
  }

  return {
    data: null,
    error: "You are not enrolled in this course.",
    success: false,
  };
}

/** Helper to create an LMS enrollment record on the fly */
async function createAutoEnrollment(courseId: string, studentId: string, instituteId: string): Promise<ApiResponse<LmsEnrollment>> {
  const { data: newEnrollment, error: enrollError } = await supabase!
    .from("lms_enrollments")
    .insert({
      institute_id: instituteId,
      student_id: studentId,
      course_id: courseId,
      status: "active",
      enrolled_at: new Date().toISOString(),
      progress_percent: 0,
    })
    .select("*")
    .single();

  if (enrollError) {
    return { data: null, error: "Auto-enrollment failed: " + enrollError.message, success: false };
  }
  return { data: newEnrollment as LmsEnrollment, error: null, success: true };
}

/** Published courses visible to students in their institute (RLS-scoped). */
export async function listPublishedCoursesForStudent(
  instituteId: string,
  filters: Pick<
    CourseListFilters,
    "search" | "page" | "pageSize" | "difficulty" | "category_id"
  > = {},
): Promise<ApiResponse<CourseListResult>> {
  return listCourses(instituteId, { ...filters, status: "published" });
}

// ── List with filters & pagination ───────────────────────────────────────────

export async function listCourses(
  instituteId: string,
  filters: CourseListFilters = {},
): Promise<ApiResponse<CourseListResult>> {
  if (!supabase) return { data: null, error: "Supabase is not configured.", success: false };

  const { search, status, difficulty, category_id, created_by, page = 1, pageSize = 12 } = filters;

  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(50, pageSize));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let query = supabase
    .from("lms_courses")
    .select("*, category:lms_categories(*)", { count: "exact" })
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) query = query.ilike("title", `%${search}%`);
  if (status) query = query.eq("status", status);
  if (difficulty) query = query.eq("difficulty", difficulty);
  if (category_id) query = query.eq("category_id", category_id);
  if (created_by) query = query.eq("created_by", created_by);

  const { data, error, count } = await query;

  if (error) return { data: null, error: error.message, success: false };

  const total = count ?? 0;
  return {
    data: {
      items: (data ?? []) as LmsCourse[],
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    },
    error: null,
    success: true,
  };
}

// ── Publish / Archive / Delete ────────────────────────────────────────────────

export async function publishCourse(courseId: string): Promise<ApiResponse<LmsCourse>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("lms_courses")
    .update({ status: "published", published_at: now, updated_at: now })
    .eq("id", courseId)
    .select("*")
    .single();
  if (error) return { data: null, error: error.message, success: false };

  const publishCurriculum = await publishCourseCurriculum(courseId);
  if (!publishCurriculum.success) {
    return {
      data: data as LmsCourse,
      error: publishCurriculum.error ?? "Course published but curriculum sync failed",
      success: true,
    };
  }

  return { data: data as LmsCourse, error: null, success: true };
}

export async function archiveCourse(courseId: string): Promise<ApiResponse<LmsCourse>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("lms_courses")
    .update({ status: "archived", updated_at: now })
    .eq("id", courseId)
    .select("*")
    .single();
  if (error) return { data: null, error: error.message, success: false };
  return { data: data as LmsCourse, error: null, success: true };
}

export async function deleteCourse(courseId: string): Promise<ApiResponse<{ id: string }>> {
  const db = supabaseAdmin ?? supabase;
  if (!db) return { data: null, error: "Supabase is not configured.", success: false };

  const { error: progressError } = await db
    .from("lms_course_progress")
    .delete()
    .eq("course_id", courseId);

  if (progressError) {
    return { data: null, error: progressError.message, success: false };
  }

  const { error } = await db.from("lms_courses").delete().eq("id", courseId);
  if (error) return { data: null, error: error.message, success: false };
  return { data: { id: courseId }, error: null, success: true };
}

// ── Aggregate stats ───────────────────────────────────────────────────────────

export async function getCourseStats(
  instituteId: string,
  createdBy?: string,
  staffId?: string,
): Promise<ApiResponse<CourseStats>> {
  if (!supabase) return { data: null, error: "Supabase is not configured.", success: false };

  let query = supabase
    .from("lms_courses")
    .select("status, total_enrollments")
    .eq("institute_id", instituteId);

  if (createdBy) query = query.eq("created_by", createdBy);
  // If staffId is provided, RLS handles the filtering. 
  // We just need to make sure we don't apply restrictive filters here.

  const { data, error } = await query;
  if (error) return { data: null, error: error.message, success: false };

  const rows = (data ?? []) as { status: LmsCourseStatus; total_enrollments: number }[];
  return {
    data: {
      total: rows.length,
      published: rows.filter((c) => c.status === "published").length,
      draft: rows.filter((c) => c.status === "draft").length,
      archived: rows.filter((c) => c.status === "archived").length,
      totalEnrollments: rows.reduce((sum, c) => sum + (c.total_enrollments || 0), 0),
    },
    error: null,
    success: true,
  };
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function listCategories(instituteId: string): Promise<ApiResponse<LmsCategory[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_categories")
    .select("*")
    .eq("institute_id", instituteId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if (error) return { data: null, error: error.message, success: false };
  return { data: (data ?? []) as LmsCategory[], error: null, success: true };
}
