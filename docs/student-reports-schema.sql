-- ============================================================================
-- Student Reports — manual report cards by staff/admin
-- Idempotent. Paste into Supabase SQL editor and run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.student_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id    UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,           -- e.g. "Mid-Term Report 2025"
  period          TEXT,                    -- e.g. "Sem 1", "Q1 2025"
  -- entries: JSON array of { subject, task_type, task_name, marks_obtained, max_marks, remark }
  entries         JSONB NOT NULL DEFAULT '[]'::jsonb,
  overall_remark  TEXT,
  created_by      UUID NOT NULL REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_reports_student
  ON public.student_reports(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_reports_institute
  ON public.student_reports(institute_id, created_at DESC);

-- Auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION public.tg_student_reports_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_reports_updated_at ON public.student_reports;
CREATE TRIGGER trg_student_reports_updated_at
  BEFORE UPDATE ON public.student_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_student_reports_set_updated_at();

-- RLS
ALTER TABLE public.student_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_student_reports"    ON public.student_reports;
DROP POLICY IF EXISTS "admin_institute_student_reports"    ON public.student_reports;
DROP POLICY IF EXISTS "staff_write_student_reports"        ON public.student_reports;
DROP POLICY IF EXISTS "student_read_own_reports"           ON public.student_reports;
DROP POLICY IF EXISTS "parent_read_linked_reports"         ON public.student_reports;

CREATE POLICY "super_admin_all_student_reports"
  ON public.student_reports FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "admin_institute_student_reports"
  ON public.student_reports FOR ALL
  USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin')
  WITH CHECK (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "staff_write_student_reports"
  ON public.student_reports FOR ALL
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
  );

CREATE POLICY "student_read_own_reports"
  ON public.student_reports FOR SELECT
  USING (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  );

-- Parents can read reports of their linked students
CREATE POLICY "parent_read_linked_reports"
  ON public.student_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_parents sp
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE sp.student_id = student_reports.student_id
        AND p.user_id = auth.uid()
    )
  );
