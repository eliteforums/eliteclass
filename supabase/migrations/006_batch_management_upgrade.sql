-- ============================================================
-- EduOS Migration 006 — Batch Management Upgrade
-- ============================================================
--
-- WHAT THIS MIGRATION DOES:
-- 1. Extends public.batches for full batch lifecycle management
-- 2. Backfills existing rows with safe defaults
-- 3. Adds constraints and indexes used by batch + attendance UI
--
-- IDEMPOTENT:
--   Uses IF NOT EXISTS and guarded updates where possible.
-- ============================================================

-- ============================================================
-- SECTION 1: Schema Additions
-- ============================================================

ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS batch_code  TEXT,
  ADD COLUMN IF NOT EXISTS course_name TEXT,
  ADD COLUMN IF NOT EXISTS start_date  DATE,
  ADD COLUMN IF NOT EXISTS end_date    DATE,
  ADD COLUMN IF NOT EXISTS capacity    INTEGER,
  ADD COLUMN IF NOT EXISTS status      TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- ============================================================
-- SECTION 2: Backfill Existing Data
-- ============================================================

UPDATE public.batches
SET batch_code = COALESCE(batch_code, UPPER(SUBSTRING(REPLACE(name, ' ', '') FROM 1 FOR 8)))
WHERE batch_code IS NULL;

UPDATE public.batches
SET course_name = COALESCE(course_name, name)
WHERE course_name IS NULL;

UPDATE public.batches
SET start_date = COALESCE(start_date, DATE_TRUNC('year', created_at)::DATE)
WHERE start_date IS NULL;

UPDATE public.batches
SET end_date = COALESCE(end_date, (DATE_TRUNC('year', created_at) + INTERVAL '1 year' - INTERVAL '1 day')::DATE)
WHERE end_date IS NULL;

UPDATE public.batches
SET capacity = COALESCE(capacity, 50)
WHERE capacity IS NULL;

UPDATE public.batches
SET status = COALESCE(status, CASE WHEN is_active THEN 'active' ELSE 'inactive' END)
WHERE status IS NULL;

-- ============================================================
-- SECTION 3: Constraints + Defaults
-- ============================================================

ALTER TABLE public.batches
  ALTER COLUMN batch_code SET NOT NULL,
  ALTER COLUMN course_name SET NOT NULL,
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN end_date SET NOT NULL,
  ALTER COLUMN capacity SET NOT NULL,
  ALTER COLUMN capacity SET DEFAULT 50,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'active';

-- Keep timeline valid
ALTER TABLE public.batches
  DROP CONSTRAINT IF EXISTS batches_dates_valid;

ALTER TABLE public.batches
  ADD CONSTRAINT batches_dates_valid CHECK (end_date >= start_date);

-- Bound capacity to a realistic operational range
ALTER TABLE public.batches
  DROP CONSTRAINT IF EXISTS batches_capacity_valid;

ALTER TABLE public.batches
  ADD CONSTRAINT batches_capacity_valid CHECK (capacity >= 1 AND capacity <= 1000);

-- Restrict statuses expected by the app
ALTER TABLE public.batches
  DROP CONSTRAINT IF EXISTS batches_status_valid;

ALTER TABLE public.batches
  ADD CONSTRAINT batches_status_valid CHECK (status IN ('active', 'inactive', 'archived'));

-- ============================================================
-- SECTION 4: Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_batches_status ON public.batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_archived_at ON public.batches(archived_at);
CREATE INDEX IF NOT EXISTS idx_batches_start_date ON public.batches(start_date);

-- Active codes should be unique per institute for operator clarity.
CREATE UNIQUE INDEX IF NOT EXISTS uq_batches_institute_batch_code_active
  ON public.batches(institute_id, batch_code)
  WHERE archived_at IS NULL;
