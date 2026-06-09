-- ─────────────────────────────────────────────────────────────────────────────
-- Coding Exam Module: Database Migration
-- Run in your Supabase SQL editor BEFORE deploying the coding exam feature.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add exam_type to exams
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS exam_type TEXT NOT NULL DEFAULT 'mcq'
  CHECK (exam_type IN ('mcq', 'coding'));

-- 2. Add coding-specific columns to exam_questions
ALTER TABLE exam_questions
  ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'mcq'
    CHECK (question_type IN ('mcq', 'coding')),
  ADD COLUMN IF NOT EXISTS problem_statement TEXT,
  ADD COLUMN IF NOT EXISTS constraints_text TEXT,
  ADD COLUMN IF NOT EXISTS examples JSONB,
  ADD COLUMN IF NOT EXISTS test_cases JSONB,
  ADD COLUMN IF NOT EXISTS starter_code JSONB,
  ADD COLUMN IF NOT EXISTS time_limit_seconds INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS memory_limit_mb INTEGER DEFAULT 256;

-- 3. Create coding_submissions table
CREATE TABLE IF NOT EXISTS coding_submissions (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id      UUID        NOT NULL REFERENCES exam_attempts(id)  ON DELETE CASCADE,
  question_id     UUID        NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  student_id      UUID        NOT NULL,
  institute_id    UUID        NOT NULL,
  language        TEXT        NOT NULL,
  code            TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','accepted','wrong_answer','runtime_error','compilation_error','time_limit_exceeded')),
  test_results    JSONB,
  passed_tests    INTEGER     NOT NULL DEFAULT 0,
  total_tests     INTEGER     NOT NULL DEFAULT 0,
  score           NUMERIC(10,2) NOT NULL DEFAULT 0,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_coding_submissions_attempt  ON coding_submissions (attempt_id);
CREATE INDEX IF NOT EXISTS idx_coding_submissions_question ON coding_submissions (question_id);

-- 4. RLS for coding_submissions
ALTER TABLE coding_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students_own_coding_submissions"   ON coding_submissions;
DROP POLICY IF EXISTS "institute_view_coding_submissions" ON coding_submissions;

CREATE POLICY "students_own_coding_submissions" ON coding_submissions
  FOR ALL USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

CREATE POLICY "institute_view_coding_submissions" ON coding_submissions
  FOR SELECT USING (
    institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
  );

-- 5. Add time_per_question_seconds to exams (if not already added)
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS time_per_question_seconds INTEGER DEFAULT NULL;
