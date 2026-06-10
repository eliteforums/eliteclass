-- Migration: Add reattempt support to exam_attempts
-- Run this in your Supabase SQL editor

-- Add reattempt_granted column to exam_attempts
ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS reattempt_granted BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fast lookup when checking if reattempt was granted
CREATE INDEX IF NOT EXISTS idx_exam_attempts_reattempt
  ON exam_attempts(exam_id, student_id, reattempt_granted)
  WHERE reattempt_granted = TRUE;

-- Allow admins/staff to UPDATE exam_attempts (needed for granting reattempts, locking, etc.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'exam_attempts' AND policyname = 'admin_update_attempts'
  ) THEN
    CREATE POLICY "admin_update_attempts" ON public.exam_attempts FOR UPDATE
      USING (institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff'))
      WITH CHECK (institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff'));
  END IF;
END $$;

-- Comment for documentation
COMMENT ON COLUMN exam_attempts.reattempt_granted IS
  'Set to TRUE by admin to allow a student to retake the exam. A new attempt row is created; the old one is kept for audit.';
