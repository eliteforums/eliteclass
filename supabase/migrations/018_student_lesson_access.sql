-- ============================================================
-- EduOS Migration 018 — Student lesson visibility for enrolled courses
-- Enrolled students can read all lessons in their course (not only is_published).
-- Preview lessons remain gated for non-enrolled visitors on published courses.
-- Backfill is_published for existing published-course content.
-- ============================================================

DROP POLICY IF EXISTS "lms_lesson_student" ON public.lms_lessons;
CREATE POLICY "lms_lesson_student" ON public.lms_lessons
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND (
      public.lms_is_course_student(course_id)
      OR (
        is_preview = TRUE
        AND is_published = TRUE
        AND course_id IN (
          SELECT id FROM public.lms_courses
          WHERE institute_id = get_my_institute_id()
            AND status = 'published'
            AND visibility IN ('public', 'institutional')
        )
      )
    )
  );

-- Ensure published courses expose curriculum to students
UPDATE public.lms_lessons l
SET is_published = TRUE, updated_at = NOW()
FROM public.lms_courses c
WHERE l.course_id = c.id
  AND c.status = 'published'
  AND l.is_published = FALSE;

UPDATE public.lms_modules m
SET is_published = TRUE, updated_at = NOW()
FROM public.lms_courses c
WHERE m.course_id = c.id
  AND c.status = 'published'
  AND m.is_published = FALSE;
