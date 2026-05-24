-- ============================================================
-- EduOS Migration 024 — Repair orphan attendance_sessions.batch_id
-- ============================================================
-- Sessions created before batch_id was returned in API selects may still
-- have a valid batch_id in the database. This migration only fixes rows
-- where batch_id IS NULL and the institute has exactly one active batch
-- (safe single-batch institutes).

UPDATE public.attendance_sessions s
SET batch_id = only_batch.id
FROM (
  SELECT institute_id, (array_agg(id ORDER BY created_at DESC))[1] AS id
  FROM public.batches
  WHERE COALESCE(is_active, TRUE) = TRUE
  GROUP BY institute_id
  HAVING COUNT(*) = 1
) only_batch
WHERE s.batch_id IS NULL
  AND s.institute_id = only_batch.institute_id;

-- For institutes with multiple batches, orphan sessions must be recreated
-- or batch_id set manually in Supabase.

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_batch_id
  ON public.attendance_sessions(batch_id)
  WHERE batch_id IS NOT NULL;
