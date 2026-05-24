-- ============================================================
-- EduOS Migration 023 — students.batch_id → batches FK
-- ============================================================
-- PostgREST / Supabase embed syntax (batch:batches(...)) requires a
-- declared foreign key. Migration 001 created batch_id without REFERENCES.
-- This migration adds the FK so relationship hints work in the API.

-- Clear orphan batch references before adding the constraint
UPDATE public.students st
SET batch_id = NULL
WHERE batch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.batches b WHERE b.id = st.batch_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_batch_id_fkey'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_batch_id_fkey
      FOREIGN KEY (batch_id)
      REFERENCES public.batches(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_students_batch_id ON public.students(batch_id);

COMMENT ON CONSTRAINT students_batch_id_fkey ON public.students IS
  'Enables PostgREST embed students → batches for batch assignment UI.';
