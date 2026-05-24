-- ============================================================
-- EduOS Migration 044 — Fix LMS course deletion blockers
-- ============================================================
--
-- Purpose:
--   Allow LMS courses to be deleted without being blocked by aggregated
--   progress rows that still reference the course.
-- ============================================================

ALTER TABLE public.lms_course_progress
  DROP CONSTRAINT IF EXISTS lms_course_progress_course_id_fkey;

ALTER TABLE public.lms_course_progress
  ADD CONSTRAINT lms_course_progress_course_id_fkey
  FOREIGN KEY (course_id)
  REFERENCES public.lms_courses(id)
  ON DELETE CASCADE;

DROP POLICY IF EXISTS "lms_cp_admin_delete" ON public.lms_course_progress;
CREATE POLICY "lms_cp_admin_delete"
  ON public.lms_course_progress
  FOR DELETE
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  );