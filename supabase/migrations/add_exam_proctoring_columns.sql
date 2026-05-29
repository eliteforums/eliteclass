-- Migration: Add proctoring settings columns to exams table
-- These columns control per-exam proctoring features:
--   enable_tab_detection: Monitor and log tab switches during exam
--   enable_camera_mic: Request camera/mic access as deterrent (no recording)
--   enable_deterrent_ui: Show fake "recording active" overlay

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS enable_tab_detection BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS enable_camera_mic BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS enable_deterrent_ui BOOLEAN NOT NULL DEFAULT FALSE;
