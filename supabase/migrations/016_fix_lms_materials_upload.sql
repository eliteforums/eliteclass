-- ============================================================
-- EduOS Migration 016 — Fix lesson materials upload for staff
-- Staff can manage materials on courses they created (not only rows they uploaded).
-- ============================================================

DROP POLICY IF EXISTS "lms_mat_staff_own" ON public.lms_lesson_materials;

CREATE POLICY "lms_mat_staff_own" ON public.lms_lesson_materials
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
