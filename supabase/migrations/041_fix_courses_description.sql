-- ============================================================
-- EduOS Migration 041 — Ensure courses.description exists
-- ============================================================
-- Fixes "column courses.description does not exist" error.
-- This column was originally in migration 005 but may be missing 
-- in some environments due to partial migration runs.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.courses.description IS 'Optional description for the course.';
