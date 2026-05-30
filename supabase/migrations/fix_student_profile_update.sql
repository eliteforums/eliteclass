-- =============================================================================
-- Fix: Allow students to update their own record (for profile completion)
--
-- The ProfileCompletionGuard requires students to save emergency_contact data
-- on their own student record. Without an UPDATE policy, the write silently
-- fails due to RLS.
-- =============================================================================

-- Allow students to update their own student record (emergency_contact, etc.)
CREATE POLICY "students_own_update"
  ON public.students FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow students to INSERT into users table (for creating parent user record)
-- Scoped to their own institute
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

-- Allow students to INSERT into parents table (for creating parent record)
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

-- Allow students to INSERT into student_parents (to link themselves to a parent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_insert_student_parents' AND tablename = 'student_parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_insert_student_parents" ON public.student_parents FOR INSERT WITH CHECK (
      student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    )';
  END IF;
END $$;

-- Allow students to SELECT from student_parents for their own links
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_select_own_parents' AND tablename = 'student_parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_select_own_parents" ON public.student_parents FOR SELECT USING (
      student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    )';
  END IF;
END $$;

-- Allow students to read parent user records (for profile completeness check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_select_parent_users' AND tablename = 'parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_select_parent_users" ON public.parents FOR SELECT USING (
      id IN (
        SELECT sp.parent_id FROM public.student_parents sp
        JOIN public.students s ON s.id = sp.student_id
        WHERE s.user_id = auth.uid()
      )
    )';
  END IF;
END $$;
