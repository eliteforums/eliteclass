-- ============================================================
-- EduOS Migration 017 — Student self-enrollment
-- Allows students to enroll in published public/institutional courses.
-- ============================================================

CREATE POLICY "lms_enroll_student_self" ON public.lms_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
    AND enrolled_by = auth.uid()
    AND course_id IN (
      SELECT id FROM public.lms_courses
      WHERE institute_id = get_my_institute_id()
        AND status = 'published'
        AND visibility IN ('public', 'institutional')
    )
  );

-- Students may update their own enrollment row (e.g. re-activate via upsert path)
CREATE POLICY "lms_enroll_student_self_update" ON public.lms_enrollments
  FOR UPDATE TO authenticated
  USING (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
  )
  WITH CHECK (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
    AND status IN ('active', 'completed')
  );
