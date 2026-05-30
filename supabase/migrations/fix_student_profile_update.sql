-- =============================================================================
-- Fix: Allow students to update their own record (for profile completion)
--
-- Uses SECURITY DEFINER functions to avoid RLS recursion between
-- students ↔ student_parents tables.
-- =============================================================================

-- Helper: get the student ID for the current authenticated user
-- SECURITY DEFINER bypasses RLS, breaking the recursion cycle
CREATE OR REPLACE FUNCTION public.get_my_student_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT id FROM public.students WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_student_id() TO authenticated;

-- 1. Allow students to UPDATE their own student record (emergency_contact, etc.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_own_update' AND tablename = 'students'
  ) THEN
    EXECUTE 'CREATE POLICY "students_own_update" ON public.students FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

-- 2. Allow students to INSERT parent users (role=parent) in their institute
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_insert_parent_user' AND tablename = 'users'
  ) THEN
    EXECUTE 'CREATE POLICY "students_insert_parent_user" ON public.users FOR INSERT WITH CHECK (
      institute_id = public.get_my_institute_id()
      AND role = ''parent''
      AND public.get_my_role() = ''student''::user_role
    )';
  END IF;
END $$;

-- 3. Allow students to INSERT parent records in their institute
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_insert_parent_record' AND tablename = 'parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_insert_parent_record" ON public.parents FOR INSERT WITH CHECK (
      institute_id = public.get_my_institute_id()
      AND public.get_my_role() = ''student''::user_role
    )';
  END IF;
END $$;

-- 4. Allow students to INSERT into student_parents (link themselves to a parent)
--    Uses SECURITY DEFINER function to avoid recursion
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_insert_student_parents' AND tablename = 'student_parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_insert_student_parents" ON public.student_parents FOR INSERT WITH CHECK (
      student_id = public.get_my_student_id()
    )';
  END IF;
END $$;

-- 5. Allow students to SELECT their own parent links
--    Uses SECURITY DEFINER function to avoid recursion
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_select_own_parents' AND tablename = 'student_parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_select_own_parents" ON public.student_parents FOR SELECT USING (
      student_id = public.get_my_student_id()
    )';
  END IF;
END $$;

-- 6. Allow students to read parent records linked to them
--    Uses SECURITY DEFINER helper to get student_id without querying students table
CREATE OR REPLACE FUNCTION public.student_can_read_parent(p_parent_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_parents
    WHERE student_id = (SELECT id FROM public.students WHERE user_id = auth.uid() LIMIT 1)
      AND parent_id = p_parent_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.student_can_read_parent(UUID) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_select_parent_users' AND tablename = 'parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_select_parent_users" ON public.parents FOR SELECT USING (
      public.get_my_role() = ''student''::user_role
      AND public.student_can_read_parent(id)
    )';
  END IF;
END $$;
