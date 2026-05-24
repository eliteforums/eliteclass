-- ============================================================
-- EduOS Migration 055 — Assignment file upload RLS (production)
--
-- Fixes "new row violates row-level security policy" for:
--   • storage.objects in assignment-resources / assignment-submissions
--   • assignment_resources (admin/staff metadata inserts)
--   • submission_files (student metadata inserts)
--
-- Isolated to assignment upload paths only. No schema changes.
-- ============================================================

-- ── assignment_resources: admin + staff (explicit WITH CHECK for INSERT) ───

DROP POLICY IF EXISTS "admin_manage_resources" ON public.assignment_resources;

CREATE POLICY "admin_manage_resources" ON public.assignment_resources
  FOR ALL TO authenticated
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() IN ('admin', 'staff')
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() IN ('admin', 'staff')
    AND assignment_id IN (
      SELECT a.id
      FROM public.assignments a
      WHERE a.institute_id = public.get_my_institute_id()
    )
  );

-- ── submission_files: student-owned rows in own institute ─────────────────

DROP POLICY IF EXISTS "student_manage_own_submission_files" ON public.submission_files;

CREATE POLICY "student_manage_own_submission_files" ON public.submission_files
  FOR ALL TO authenticated
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'student'
    AND submission_id IN (
      SELECT sub.id
      FROM public.assignment_submissions sub
      JOIN public.students s ON s.id = sub.student_id
      WHERE s.user_id = auth.uid()
        AND sub.institute_id = public.get_my_institute_id()
    )
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'student'
    AND submission_id IN (
      SELECT sub.id
      FROM public.assignment_submissions sub
      JOIN public.students s ON s.id = sub.student_id
      WHERE s.user_id = auth.uid()
        AND sub.institute_id = public.get_my_institute_id()
    )
  );

-- ── storage: assignment-resources (admin + staff) ───────────────────────────

DROP POLICY IF EXISTS "Admins can upload resources" ON storage.objects;
CREATE POLICY "Admins can upload resources" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assignment-resources'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() IN ('admin', 'staff')
  );

DROP POLICY IF EXISTS "Admins can update resources" ON storage.objects;
CREATE POLICY "Admins can update resources" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'assignment-resources'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() IN ('admin', 'staff')
  )
  WITH CHECK (
    bucket_id = 'assignment-resources'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() IN ('admin', 'staff')
  );

DROP POLICY IF EXISTS "Admins can delete resources" ON storage.objects;
CREATE POLICY "Admins can delete resources" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'assignment-resources'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() IN ('admin', 'staff')
  );

-- ── storage: assignment-submissions (students; assignee-scoped path) ────────

DROP POLICY IF EXISTS "Students can upload submissions" ON storage.objects;
CREATE POLICY "Students can upload submissions" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assignment-submissions'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() = 'student'
    AND (storage.foldername(name))[2] = 'submissions'
    AND EXISTS (
      SELECT 1
      FROM public.assignment_assignees aa
      JOIN public.students s ON s.id = aa.student_id
      JOIN public.assignments a ON a.id = aa.assignment_id
      WHERE s.user_id = auth.uid()
        AND a.institute_id = public.get_my_institute_id()
        AND a.id::text = (storage.foldername(name))[3]
    )
  );

DROP POLICY IF EXISTS "Students can update own submissions" ON storage.objects;
CREATE POLICY "Students can update own submissions" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'assignment-submissions'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() = 'student'
    AND (storage.foldername(name))[2] = 'submissions'
    AND EXISTS (
      SELECT 1
      FROM public.assignment_assignees aa
      JOIN public.students s ON s.id = aa.student_id
      JOIN public.assignments a ON a.id = aa.assignment_id
      WHERE s.user_id = auth.uid()
        AND a.institute_id = public.get_my_institute_id()
        AND a.id::text = (storage.foldername(name))[3]
    )
  )
  WITH CHECK (
    bucket_id = 'assignment-submissions'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() = 'student'
    AND (storage.foldername(name))[2] = 'submissions'
    AND EXISTS (
      SELECT 1
      FROM public.assignment_assignees aa
      JOIN public.students s ON s.id = aa.student_id
      JOIN public.assignments a ON a.id = aa.assignment_id
      WHERE s.user_id = auth.uid()
        AND a.institute_id = public.get_my_institute_id()
        AND a.id::text = (storage.foldername(name))[3]
    )
  );
