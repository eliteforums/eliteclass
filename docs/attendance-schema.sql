-- ============================================================================
-- Attendance schema — idempotent. Safe to paste into Supabase SQL editor.
-- Creates attendance_sessions + attendance_records tables, indexes, and the
-- minimum RLS policies admin/staff/student need.
-- ============================================================================

-- ── 1. Tables ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  batch_id     UUID        REFERENCES public.batches(id),
  course_id    UUID        REFERENCES public.courses(id),
  conducted_by UUID        NOT NULL REFERENCES public.users(id),
  session_date DATE        NOT NULL,
  session_type TEXT        NOT NULL DEFAULT 'daily',
  topic        TEXT,
  is_locked    BOOLEAN     NOT NULL DEFAULT FALSE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(institute_id, batch_id, session_date, session_type)
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id   UUID        NOT NULL REFERENCES public.students(id)            ON DELETE CASCADE,
  institute_id UUID        NOT NULL REFERENCES public.institutes(id)          ON DELETE CASCADE,
  batch_id     UUID        REFERENCES public.batches(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL,
  notes        TEXT,
  marked_by    UUID        NOT NULL REFERENCES public.users(id),
  marked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);

-- ── 2. Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_inst_date
  ON public.attendance_sessions(institute_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_batch
  ON public.attendance_sessions(batch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session
  ON public.attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student
  ON public.attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_batch
  ON public.attendance_records(batch_id);

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records  ENABLE ROW LEVEL SECURITY;

-- Drop any old/conflicting versions first (safe)
DROP POLICY IF EXISTS "super_admin_all_attendance_sessions"   ON public.attendance_sessions;
DROP POLICY IF EXISTS "admin_institute_attendance_sessions"   ON public.attendance_sessions;
DROP POLICY IF EXISTS "staff_read_attendance_sessions"        ON public.attendance_sessions;
DROP POLICY IF EXISTS "staff_write_attendance_sessions"       ON public.attendance_sessions;
DROP POLICY IF EXISTS "parent_read_attendance_sessions"       ON public.attendance_sessions;
DROP POLICY IF EXISTS "student_read_own_attendance_sessions"  ON public.attendance_sessions;

DROP POLICY IF EXISTS "super_admin_all_attendance_records"    ON public.attendance_records;
DROP POLICY IF EXISTS "admin_institute_attendance_records"    ON public.attendance_records;
DROP POLICY IF EXISTS "staff_read_attendance_records"         ON public.attendance_records;
DROP POLICY IF EXISTS "staff_write_attendance_records"        ON public.attendance_records;
DROP POLICY IF EXISTS "student_read_own_attendance"           ON public.attendance_records;
DROP POLICY IF EXISTS "parent_read_attendance_records"        ON public.attendance_records;

-- Sessions
CREATE POLICY "super_admin_all_attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "admin_institute_attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin')
  WITH CHECK (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "staff_write_attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
  );

CREATE POLICY "student_read_own_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'student'
  );

-- Records
CREATE POLICY "super_admin_all_attendance_records"
  ON public.attendance_records FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "admin_institute_attendance_records"
  ON public.attendance_records FOR ALL
  USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin')
  WITH CHECK (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "staff_write_attendance_records"
  ON public.attendance_records FOR ALL
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
  );

CREATE POLICY "student_read_own_attendance"
  ON public.attendance_records FOR SELECT
  USING (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  );
