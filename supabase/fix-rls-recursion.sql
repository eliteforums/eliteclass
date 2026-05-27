-- =============================================================================
-- DEFINITIVE FIX: Infinite recursion in "students" table RLS
--
-- Strategy: Disable RLS on students, drop ALL policies, recreate with 
-- simple non-recursive policies that NEVER do subqueries against other 
-- RLS-protected tables.
--
-- Run this in Supabase Dashboard → SQL Editor
-- =============================================================================

-- Step 0: Temporarily disable RLS so we can drop and recreate policies
ALTER TABLE public.students DISABLE ROW LEVEL SECURITY;

-- Step 1: Drop EVERY policy on students (catch-all)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'students' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.students', pol.policyname);
  END LOOP;
END $$;

-- Step 2: Recreate helper functions with row_security = off
-- These MUST have row_security = off to prevent any recursion

CREATE OR REPLACE FUNCTION public.get_my_institute_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT institute_id FROM public.users WHERE id = auth.uid();
$$;

-- Recreate get_my_role keeping original return type (user_role enum)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin');
$$;

-- Step 3: Create simple, non-recursive policies
-- RULE: No policy on students may query student_parents, parents, staff, 
-- staff_assignments, or any table that has policies referencing students.

-- Super admin: full access
CREATE POLICY "students_superadmin"
  ON public.students FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Admin: full access within own institute (institute_id check is safe — no subquery)
CREATE POLICY "students_admin_all"
  ON public.students FOR ALL
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'admin'::user_role
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'admin'::user_role
  );

-- Staff: read all students in own institute (simple check, no subquery)
CREATE POLICY "students_staff_select"
  ON public.students FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'::user_role
  );

-- Student: read own record only (direct column check, no subquery)
CREATE POLICY "students_own_select"
  ON public.students FOR SELECT
  USING (user_id = auth.uid());

-- Parent: read linked children using a SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.parent_can_read_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_parents sp
    JOIN public.parents p ON p.id = sp.parent_id
    WHERE sp.student_id = p_student_id
      AND p.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.parent_can_read_student(UUID) TO authenticated;

CREATE POLICY "students_parent_select"
  ON public.students FOR SELECT
  USING (
    public.get_my_role() = 'parent'::user_role
    AND public.parent_can_read_student(id)
  );

-- Step 4: Re-enable RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Step 5: Force RLS for all roles except postgres superuser
ALTER TABLE public.students FORCE ROW LEVEL SECURITY;

-- Done! Verify with: SELECT * FROM pg_policies WHERE tablename = 'students';
