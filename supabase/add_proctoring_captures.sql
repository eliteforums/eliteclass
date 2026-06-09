-- ─────────────────────────────────────────────────────────────────────────────
-- Proctoring Captures: DB migration + storage bucket
-- Run in your Supabase SQL editor before deploying.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add enable_screen_capture to exams
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS enable_screen_capture BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Create the captures table
CREATE TABLE IF NOT EXISTS exam_proctoring_captures (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id      UUID        NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  student_id      UUID        NOT NULL,
  institute_id    UUID        NOT NULL,
  exam_id         UUID        NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  capture_type    TEXT        NOT NULL CHECK (capture_type IN ('webcam', 'screenshot')),
  storage_path    TEXT        NOT NULL,
  capture_index   INTEGER     NOT NULL DEFAULT 0,
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proctoring_captures_attempt
  ON exam_proctoring_captures (attempt_id);

CREATE INDEX IF NOT EXISTS idx_proctoring_captures_exam
  ON exam_proctoring_captures (exam_id);

-- 3. RLS
ALTER TABLE exam_proctoring_captures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students_insert_own_captures" ON exam_proctoring_captures;
DROP POLICY IF EXISTS "students_read_own_captures"   ON exam_proctoring_captures;
DROP POLICY IF EXISTS "institute_view_captures"       ON exam_proctoring_captures;

-- Students can INSERT their own captures
CREATE POLICY "students_insert_own_captures" ON exam_proctoring_captures
  FOR INSERT WITH CHECK (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- Students can SELECT their own captures
CREATE POLICY "students_read_own_captures" ON exam_proctoring_captures
  FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  );

-- Institute members (admin/staff) can SELECT all captures in their institute
CREATE POLICY "institute_view_captures" ON exam_proctoring_captures
  FOR SELECT USING (
    institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
  );

-- 4. Create the private storage bucket for exam captures
--    (also creatable via the Supabase Dashboard -> Storage -> New Bucket)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exam-proctoring',
  'exam-proctoring',
  false,                    -- private bucket
  5242880,                  -- 5 MB per file max
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Students can upload to their own folder: {instituteId}/{examId}/{attemptId}/
CREATE POLICY "students_upload_own_captures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'exam-proctoring'
  );

-- Only institute members can read captures from the bucket
CREATE POLICY "institute_read_captures"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'exam-proctoring'
  );
