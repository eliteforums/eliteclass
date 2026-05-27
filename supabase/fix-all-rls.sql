-- =============================================================================
-- COMPLETE RLS FIX — Run this to fix ALL recursion issues
-- 
-- The root cause: RLS policies on `users`, `students`, `staff` tables call
-- helper functions (get_my_role, get_my_institute_id) which query the `users`
-- table, triggering its own RLS policies, creating infinite recursion.
--
-- Fix: Ensure ALL helper functions have SET row_security = off
-- =============================================================================

-- Step 1: Fix helper functions (MUST have row_security = off)
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

-- get_my_role: keep original return type
DO $$
BEGIN
  -- Try to drop and recreate with the correct return type
  DROP FUNCTION IF EXISTS public.get_my_role();
EXCEPTION WHEN OTHERS THEN
  NULL; -- ignore if it can't be dropped due to dependencies
END $$;

-- Recreate — try user_role type first, fall back to text
DO $$
BEGIN
  EXECUTE '
    CREATE OR REPLACE FUNCTION public.get_my_role()
    RETURNS user_role
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    SET row_security = off
    AS $fn$
      SELECT role FROM public.users WHERE id = auth.uid();
    $fn$;
  ';
EXCEPTION WHEN OTHERS THEN
  EXECUTE '
    CREATE OR REPLACE FUNCTION public.get_my_role()
    RETURNS text
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    SET row_security = off
    AS $fn$
      SELECT role::text FROM public.users WHERE id = auth.uid();
    $fn$;
  ';
END $$;

-- Step 2: Fix users table — drop all policies and recreate simply
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'users' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
  END LOOP;
END $$;

-- Simple users policies (no subqueries that could recurse)
CREATE POLICY "users_read_own" ON public.users FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_admin_all" ON public.users FOR ALL USING (public.get_my_institute_id() = institute_id);
CREATE POLICY "users_insert" ON public.users FOR INSERT WITH CHECK (true);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Step 3: Fix students table
ALTER TABLE public.students DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'students' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.students', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "students_read_own" ON public.students FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "students_institute" ON public.students FOR ALL USING (institute_id = public.get_my_institute_id());
CREATE POLICY "students_insert" ON public.students FOR INSERT WITH CHECK (true);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Step 4: Fix staff table
ALTER TABLE public.staff DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'staff' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.staff', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "staff_read_own" ON public.staff FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "staff_institute" ON public.staff FOR ALL USING (institute_id = public.get_my_institute_id());
CREATE POLICY "staff_insert" ON public.staff FOR INSERT WITH CHECK (true);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Step 5: Fix institutes table
ALTER TABLE public.institutes DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'institutes' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.institutes', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "institutes_read_own" ON public.institutes FOR SELECT USING (id = public.get_my_institute_id());
CREATE POLICY "institutes_all" ON public.institutes FOR ALL USING (true);

ALTER TABLE public.institutes ENABLE ROW LEVEL SECURITY;

-- Step 6: Grant execute
GRANT EXECUTE ON FUNCTION public.get_my_institute_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- Done! Test with: SELECT public.get_my_role();
