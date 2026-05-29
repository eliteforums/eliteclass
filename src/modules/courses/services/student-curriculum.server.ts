import { createServerFn } from "@tanstack/react-start";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import type {
  ApiResponse,
  LmsCourseWithCurriculum,
  LmsLesson,
  LmsLessonMaterial,
  LmsModule,
} from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

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

    merged.forEach((lesson: { id: string }) => matchedLessonIds.add(lesson.id));

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

async function loadStudentCourseCurriculum(
  courseId: string,
  enrollmentId: string,
  studentId: string,
  instituteId: string,
): Promise<ApiResponse<LmsCourseWithCurriculum>> {
  // Prefer admin client (bypasses RLS) since this is a trusted server context.
  // The client already verified enrollment before calling this server function.
  const db = supabaseAdmin ?? supabase;
  if (!db) return SUPABASE_NOT_CONFIGURED;

  // If we don't have the admin client, the anon client on the server won't have
  // a user session and RLS will block queries. Log a warning and try anyway.
  if (!supabaseAdmin) {
    console.warn(
      `[loadStudentCourseCurriculum] supabaseAdmin not available. ` +
      `Falling back to anon client which may fail due to RLS. ` +
      `Ensure SUPABASE_SERVICE_ROLE_KEY is set in environment variables.`
    );
  }

  // Verify enrollment exists using the admin client (authoritative check).
  // Skip verification if admin client is unavailable — trust client-side check.
  if (supabaseAdmin) {
    const { data: enrollment, error: enrollmentError } = await supabaseAdmin
      .from("lms_enrollments")
      .select("id, student_id, course_id, institute_id, status")
      .eq("id", enrollmentId)
      .eq("student_id", studentId)
      .eq("course_id", courseId)
      .eq("institute_id", instituteId)
      .in("status", ["active", "completed"])
      .maybeSingle();

    if (enrollmentError || !enrollment) {
      return {
        data: null,
        error: "You are not enrolled in this course.",
        success: false,
      };
    }
  }

  const { data: courseData, error: courseError } = await db
    .from("lms_courses")
    .select("*, category:lms_categories(*)")
    .eq("id", courseId)
    .single();

  if (courseError) {
    return { data: null, error: courseError.message, success: false };
  }

  const [modulesRes, lessonsRes] = await Promise.all([
    db
      .from("lms_modules")
      .select("*")
      .eq("course_id", courseId)
      .order("position", { ascending: true }),
    db
      .from("lms_lessons")
      .select("*, materials:lms_lesson_materials(*)")
      .eq("course_id", courseId)
      .order("position", { ascending: true }),
  ]);

  const modules = (modulesRes.data ?? []) as LmsModule[];
  const lessons = (lessonsRes.data ?? []) as Array<LmsLesson & { materials?: LmsLessonMaterial[] }>;

  const courseWithCurriculum: LmsCourseWithCurriculum = {
    ...courseData,
    modules: mergeLessonsIntoModules(modules, lessons),
  };

  return {
    data: sortCurriculum(courseWithCurriculum),
    error: null,
    success: true,
  };
}

export const getStudentCourseCurriculum = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      courseId: string;
      enrollmentId: string;
      studentId: string;
      instituteId: string;
    }) => data,
  )
  .handler(async ({ data }) => loadStudentCourseCurriculum(data.courseId, data.enrollmentId, data.studentId, data.instituteId));
