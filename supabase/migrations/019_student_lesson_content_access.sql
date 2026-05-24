-- ============================================================
-- EduOS Migration 019 — Student access to lesson materials, quizzes, assignments
-- Enrolled students can read content without per-item is_published gates.
-- ============================================================

-- Materials (use enrollment helper from 013)
DROP POLICY IF EXISTS "lms_mat_student_enrolled" ON public.lms_lesson_materials;
CREATE POLICY "lms_mat_student_enrolled" ON public.lms_lesson_materials
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND public.lms_is_course_student(course_id)
  );

-- Quizzes — enrolled students see course quizzes (draft quiz flag optional for admins)
DROP POLICY IF EXISTS "lms_quiz_student_enrolled" ON public.lms_quizzes;
CREATE POLICY "lms_quiz_student_enrolled" ON public.lms_quizzes
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND public.lms_is_course_student(course_id)
  );

-- Assignments
DROP POLICY IF EXISTS "lms_assign_student_enrolled" ON public.lms_assignments;
CREATE POLICY "lms_assign_student_enrolled" ON public.lms_assignments
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND public.lms_is_course_student(course_id)
  );

-- Backfill publish flags for published courses
UPDATE public.lms_quizzes q
SET is_published = TRUE, updated_at = NOW()
FROM public.lms_courses c
WHERE q.course_id = c.id
  AND c.status = 'published'
  AND q.is_published = FALSE;

UPDATE public.lms_assignments a
SET is_published = TRUE, updated_at = NOW()
FROM public.lms_courses c
WHERE a.course_id = c.id
  AND c.status = 'published'
  AND a.is_published = FALSE;
