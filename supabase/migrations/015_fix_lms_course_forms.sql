-- ============================================================
-- EduOS Migration 015 — LMS course form fixes
-- ============================================================
-- 1. Allow students to read published public courses without enrollment
-- 2. Allow staff to enroll students in courses they created
-- ============================================================

-- 1. Public visibility: students can browse published public courses
DROP POLICY IF EXISTS "lms_course_student_enrolled" ON public.lms_courses;
CREATE POLICY "lms_course_student_enrolled" ON public.lms_courses
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND status = 'published'
    AND (
      visibility = 'public'
      OR visibility = 'institutional'
      OR public.lms_is_course_student(id)
    )
  );

-- 2. Staff can manage enrollments for their own courses
CREATE POLICY "lms_enroll_staff_manage_own" ON public.lms_enrollments
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
