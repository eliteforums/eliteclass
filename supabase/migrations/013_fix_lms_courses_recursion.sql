-- ============================================================
-- EduOS Migration 013 — Fix LMS RLS Recursion
-- ============================================================
-- Replaces direct table queries inside RLS policies with
-- SECURITY DEFINER functions to break infinite recursion
-- between lms_courses and lms_enrollments.
-- ============================================================

-- 1. Helper function for course creator check
CREATE OR REPLACE FUNCTION public.lms_is_course_creator(p_course_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lms_courses
    WHERE id = p_course_id
      AND created_by = auth.uid()
  )
$$;

-- 2. Helper function for course enrollment check
CREATE OR REPLACE FUNCTION public.lms_is_course_student(p_course_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lms_enrollments
    WHERE course_id = p_course_id
      AND student_id = auth.uid()
      AND status IN ('active', 'completed')
  )
$$;

-- 3. Update lms_courses policy
DROP POLICY IF EXISTS "lms_course_student_enrolled" ON public.lms_courses;
CREATE POLICY "lms_course_student_enrolled" ON public.lms_courses
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND status = 'published'
    AND (
      visibility = 'institutional'
      OR public.lms_is_course_student(id)
    )
  );

-- 4. Update lms_modules policies
DROP POLICY IF EXISTS "lms_mod_staff_own" ON public.lms_modules;
CREATE POLICY "lms_mod_staff_own" ON public.lms_modules
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  );

DROP POLICY IF EXISTS "lms_mod_student_enrolled" ON public.lms_modules;
CREATE POLICY "lms_mod_student_enrolled" ON public.lms_modules
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND public.lms_is_course_student(course_id)
  );

-- 5. Update lms_lessons policies
DROP POLICY IF EXISTS "lms_lesson_staff_own" ON public.lms_lessons;
CREATE POLICY "lms_lesson_staff_own" ON public.lms_lessons
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  );

DROP POLICY IF EXISTS "lms_lesson_student" ON public.lms_lessons;
CREATE POLICY "lms_lesson_student" ON public.lms_lessons
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND is_published = TRUE
    AND (
      is_preview = TRUE
      OR public.lms_is_course_student(course_id)
    )
  );

-- 6. Update lms_lesson_materials policies
DROP POLICY IF EXISTS "lms_mat_student_enrolled" ON public.lms_lesson_materials;
CREATE POLICY "lms_mat_student_enrolled" ON public.lms_lesson_materials
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND public.lms_is_course_student(course_id)
  );

-- 7. Update lms_enrollments policies
DROP POLICY IF EXISTS "lms_enroll_staff_read" ON public.lms_enrollments;
CREATE POLICY "lms_enroll_staff_read" ON public.lms_enrollments
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  );

-- 8. Update lms_lesson_progress & lms_course_progress
DROP POLICY IF EXISTS "lms_lp_staff_read" ON public.lms_lesson_progress;
CREATE POLICY "lms_lp_staff_read" ON public.lms_lesson_progress
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  );

DROP POLICY IF EXISTS "lms_cp_staff_read" ON public.lms_course_progress;
CREATE POLICY "lms_cp_staff_read" ON public.lms_course_progress
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  );

-- 9. Update lms_quizzes & assignments policies
DROP POLICY IF EXISTS "lms_quiz_student_enrolled" ON public.lms_quizzes;
CREATE POLICY "lms_quiz_student_enrolled" ON public.lms_quizzes
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND is_published = TRUE
    AND public.lms_is_course_student(course_id)
  );

DROP POLICY IF EXISTS "lms_assign_student_enrolled" ON public.lms_assignments;
CREATE POLICY "lms_assign_student_enrolled" ON public.lms_assignments
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND is_published = TRUE
    AND public.lms_is_course_student(course_id)
  );
