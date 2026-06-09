-- ─────────────────────────────────────────────────────────────────────────────
-- Assignment Submission Types Migration
-- Run in your Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add submission_type column to assignments
--    Controls what kind of submission students can make for this assignment.
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS submission_type TEXT NOT NULL DEFAULT 'any'
  CHECK (submission_type IN ('any', 'file_upload', 'text', 'url_link'));

COMMENT ON COLUMN assignments.submission_type IS
  'any=all types allowed, file_upload=files only, text=written response only, url_link=URL/link only';

-- 2. Fix grading RLS: allow institute members (admin/staff) to UPDATE submissions
--    This ensures gradeSubmission works without the PGRST116 single-row error.
DROP POLICY IF EXISTS "institute_grade_submissions" ON assignment_submissions;

CREATE POLICY "institute_grade_submissions" ON assignment_submissions
  FOR UPDATE
  USING (
    institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
  );

-- 3. Allow institute members to SELECT submissions (so the SubmissionList works)
DROP POLICY IF EXISTS "institute_view_all_submissions" ON assignment_submissions;

CREATE POLICY "institute_view_all_submissions" ON assignment_submissions
  FOR SELECT
  USING (
    institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
  );
