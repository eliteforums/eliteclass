-- ============================================================
-- EduOS Migration 037 — Fix assignment file upload RLS
--
-- Minimal, isolated fix for assignment file uploads:
--   - admin-staged assignment resources
--   - student submission attachment files
--
-- This only tightens INSERT authorization for the assignment
-- file metadata tables. No schema changes.
-- ============================================================

DROP POLICY IF EXISTS "admin_manage_resources" ON public.assignment_resources;
CREATE POLICY "admin_manage_resources" ON public.assignment_resources
  FOR ALL TO authenticated
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'admin'
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "student_manage_own_submission_files" ON public.submission_files;
CREATE POLICY "student_manage_own_submission_files" ON public.submission_files
  FOR ALL TO authenticated
  USING (
    submission_id IN (
      SELECT sub.id
      FROM public.assignment_submissions sub
      JOIN public.students s ON s.id = sub.student_id
      WHERE s.user_id = auth.uid()
    )
    AND public.get_my_role() = 'student'
  )
  WITH CHECK (
    submission_id IN (
      SELECT sub.id
      FROM public.assignment_submissions sub
      JOIN public.students s ON s.id = sub.student_id
      WHERE s.user_id = auth.uid()
    )
    AND public.get_my_role() = 'student'
  );