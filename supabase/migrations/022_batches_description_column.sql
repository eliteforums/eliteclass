-- ============================================================
-- EduOS Migration 022 — batches.description (optional)
-- ============================================================
-- Run this when you want the Description field on batch forms to persist.
-- The app works without this column (description is not queried until added).

ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.batches.description IS 'Optional operator notes about the batch.';
