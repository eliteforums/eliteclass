-- ============================================================
-- EduOS Migration 027 — Ultimate Attendance RLS Fix
-- ============================================================
-- 
-- WHY:
-- The "infinite recursion" error in attendance_sessions is caused by 
-- policies that cross-reference attendance_sessions and attendance_records.
-- Even if a user is an Admin, ALL policies (including Parent ones) 
-- are evaluated, and if any of them contain a looping subquery, 
-- the entire request fails.
--
-- FIX:
-- 1. Use SECURITY DEFINER functions for ALL cross-table checks.
-- 2. Ensure NO policy on attendance_sessions queries attendance_records.
-- 3. Ensure NO policy on attendance_records queries attendance_sessions directly.
-- 4. Drop every possible historical policy name to ensure a clean state.
-- ============================================================

-- ── 1. Helper Functions (SECURITY DEFINER) ──────────────────────────────────

-- Get session's batch_id without triggering RLS
CREATE OR REPLACE FUNCTION public.get_session_batch_id(p_session_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT batch_id FROM public.attendance_sessions WHERE id = p_session_id;
$$;

-- Check if staff has access to a batch
CREATE OR REPLACE FUNCTION public.staff_has_batch_access_v2(p_batch_id UUID)
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

-- Check if parent has access to a batch
CREATE OR REPLACE FUNCTION public.parent_has_batch_access_v2(p_batch_id UUID)
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

-- ── 2. Clean up ALL historical policies ──────────────────────────────────────

-- attendance_sessions
DROP POLICY IF EXISTS "super_admin_all_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "admin_institute_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "staff_read_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "parent_read_linked_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "parent_read_attendance_sessions" ON public.attendance_sessions;

-- attendance_records
DROP POLICY IF EXISTS "super_admin_all_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "admin_institute_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_read_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_insert_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_update_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_manage_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "student_read_own_attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "parent_read_linked_attendance_records" ON public.attendance_records;

-- ── 3. Re-implement Clean Policies ───────────────────────────────────────────

-- ── ATTENDANCE_SESSIONS ──

-- Super Admin
CREATE POLICY "super_admin_all_attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Admin
CREATE POLICY "admin_institute_attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin')
  WITH CHECK (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

-- Staff
CREATE POLICY "staff_read_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    institute_id = public.get_my_institute_id() 
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(batch_id)
  );

-- Parent
CREATE POLICY "parent_read_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    public.get_my_role() = 'parent' 
    AND public.parent_has_batch_access_v2(batch_id)
  );


-- ── ATTENDANCE_RECORDS ──

-- Super Admin
CREATE POLICY "super_admin_all_attendance_records"
  ON public.attendance_records FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Admin
CREATE POLICY "admin_institute_attendance_records"
  ON public.attendance_records FOR ALL
  USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin')
  WITH CHECK (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

-- Staff (READ)
CREATE POLICY "staff_read_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(public.get_session_batch_id(session_id))
  );

-- Staff (INSERT/UPDATE)
CREATE POLICY "staff_write_attendance_records"
  ON public.attendance_records FOR ALL
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(public.get_session_batch_id(session_id))
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(public.get_session_batch_id(session_id))
  );

-- Student
CREATE POLICY "student_read_own_attendance"
  ON public.attendance_records FOR SELECT
  USING (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  );

-- Parent
CREATE POLICY "parent_read_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (
    public.get_my_role() = 'parent'
    AND student_id IN (
      SELECT sp.student_id 
      FROM public.student_parents sp
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );
