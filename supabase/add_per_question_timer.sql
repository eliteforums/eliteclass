-- =============================================================================
-- Add per-question timer to exams
--
-- Adds time_per_question_seconds column to the exams table.
-- When set, each question has an individual countdown timer.
-- When time expires, the student auto-advances to the next question.
-- =============================================================================

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS time_per_question_seconds INTEGER DEFAULT NULL;

-- NULL = no per-question limit (use total exam duration only)
-- e.g. 30 = 30 seconds per question
-- e.g. 60 = 1 minute per question

COMMENT ON COLUMN public.exams.time_per_question_seconds IS
  'Per-question time limit in seconds. NULL means no per-question timer (only total exam duration applies). When set, student auto-advances after this many seconds.';
