-- Migration: Add reattempt support to exam_attempts
-- Run this in your Supabase SQL editor

-- Add reattempt_granted column to exam_attempts
ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS reattempt_granted BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fast lookup when checking if reattempt was granted
CREATE INDEX IF NOT EXISTS idx_exam_attempts_reattempt
  ON exam_attempts(exam_id, student_id, reattempt_granted)
  WHERE reattempt_granted = TRUE;

-- Comment for documentation
COMMENT ON COLUMN exam_attempts.reattempt_granted IS
  'Set to TRUE by admin to allow a student to retake the exam. A new attempt row is created; the old one is kept for audit.';
