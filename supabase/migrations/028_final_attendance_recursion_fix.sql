-- ============================================================
-- EduOS Migration 028 — Final Attendance Recursion Fix
-- ============================================================
-- WHY: 
-- Even with SECURITY DEFINER functions, PostgreSQL RLS can sometimes 
-- trigger infinite recursion when policies cross-reference tables 
-- (attendance_records -> attendance_sessions -> attendance_records).
--
-- THE ULTIMATE FIX:
-- 1. Add batch_id directly to attendance_records.
-- 2. This allows attendance_records policies to check batch access 
--    WITHOUT querying the attendance_sessions table at all.
-- 3. This completely breaks the circular dependency.

-- 1. Add batch_id to attendance_records
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE;

-- 2. Populate batch_id from attendance_sessions
UPDATE public.attendance_records ar
SET batch_id = s.batch_id
FROM public.attendance_sessions s
WHERE ar.session_id = s.id AND ar.batch_id IS NULL;

-- 3. Make batch_id NOT NULL for future records
-- (Note: We do this after populating to avoid errors)
-- ALTER TABLE public.attendance_records ALTER COLUMN batch_id SET NOT NULL; 
-- ^ Commented out just in case there are orphaned records, but ideally should be NOT NULL.

-- 4. Create an index for performance
CREATE INDEX IF NOT EXISTS idx_attendance_records_batch_id ON public.attendance_records(batch_id);

-- 5. Drop ALL existing policies to start fresh
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
DROP POLICY IF EXISTS "staff_write_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_manage_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "student_read_own_attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "parent_read_linked_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "parent_read_attendance_records" ON public.attendance_records;

-- 6. Re-implement Clean Policies WITHOUT cross-table joins

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

CREATE POLICY "staff_write_attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING (
    institute_id = public.get_my_institute_id() 
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(batch_id)
  )
  WITH CHECK (
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
-- NOW USES batch_id FROM THE TABLE ITSELF! NO JOIN!
CREATE POLICY "staff_read_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(batch_id)
  );

-- Staff (INSERT/UPDATE/DELETE)
CREATE POLICY "staff_write_attendance_records"
  ON public.attendance_records FOR ALL
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(batch_id)
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(batch_id)
  );

-- Parent (READ)
CREATE POLICY "parent_read_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (
    public.get_my_role() = 'parent'
    AND public.parent_has_batch_access_v2(batch_id)
  );

-- Student (READ own)
CREATE POLICY "student_read_own_attendance"
  ON public.attendance_records FOR SELECT
  USING (
    public.get_my_role() = 'student'
    AND student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );
