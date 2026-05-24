-- ============================================================
-- EduOS Migration 049 — Exam Attempt Status Compatibility
-- ============================================================

-- Backward compatibility only: some legacy paths still emit 'active'.
-- Keep the app canonical status as 'in_progress', but allow the old value so
-- production no longer fails on stale writes.
DO $$
BEGIN
  ALTER TYPE public.exam_attempt_status ADD VALUE 'active';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Normalize any existing rows that may already use the legacy value.
UPDATE public.exam_attempts
SET status = 'in_progress'
WHERE status::text = 'active';