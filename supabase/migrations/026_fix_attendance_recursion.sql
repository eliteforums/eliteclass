-- ============================================================
-- EduOS Migration 026 — Fix Attendance RLS Recursion
-- ============================================================
--
-- WHY:
-- The "infinite recursion" error in attendance_sessions occurs because 
-- policies for one table query another table whose policies query the first.
--
-- FIX:
-- We rewrite the policies to use SECURITY DEFINER helper functions. 
-- These functions run with superuser privileges and bypass RLS, 
-- effectively breaking the circular dependency chain.
-- ============================================================

-- ── 1) Helper Function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.staff_has_batch_access(p_batch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_assignments sa
    WHERE sa.staff_id = public.get_my_staff_id()
      AND sa.batch_id = p_batch_id
    UNION
    SELECT 1 FROM public.schedules sch
    WHERE sch.teacher_id = public.get_my_staff_id()
      AND sch.batch_id = p_batch_id
      AND sch.status = 'published'
  );
$$;

-- ── 2) Fix attendance_sessions ──────────────────────────────────────────────

DROP POLICY IF EXISTS "staff_read_attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "staff_read_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access(batch_id)
  );

-- ── 3) Fix attendance_records ────────────────────────────────────────────────

DROP POLICY IF EXISTS "staff_read_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_insert_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_update_attendance_records" ON public.attendance_records;

-- READ
CREATE POLICY "staff_read_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access(
      (SELECT batch_id FROM public.attendance_sessions WHERE id = session_id)
    )
  );

-- INSERT
CREATE POLICY "staff_insert_attendance_records"
  ON public.attendance_records FOR INSERT
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access(
      (SELECT batch_id FROM public.attendance_sessions WHERE id = session_id)
    )
  );

-- UPDATE
CREATE POLICY "staff_update_attendance_records"
  ON public.attendance_records FOR UPDATE
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access(
      (SELECT batch_id FROM public.attendance_sessions WHERE id = session_id)
    )
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access(
      (SELECT batch_id FROM public.attendance_sessions WHERE id = session_id)
    )
  );

-- ── 4) Fix parent policy (Final check) ──────────────────────────────────────

-- Migration 025 already fixed parent_read_linked_attendance_sessions 
-- to join students/parents directly. Ensure it's safe.
-- It queries 'students', which has RLS.
-- Let's make a SECURITY DEFINER helper for it too to be 100% safe.

CREATE OR REPLACE FUNCTION public.parent_has_batch_access(p_batch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.student_parents sp ON sp.student_id = s.id
    JOIN public.parents p ON p.id = sp.parent_id
    WHERE p.user_id = auth.uid()
      AND s.batch_id = p_batch_id
  );
$$;

DROP POLICY IF EXISTS "parent_read_linked_attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "parent_read_linked_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (public.parent_has_batch_access(batch_id));
