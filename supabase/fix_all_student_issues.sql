-- =============================================================================
-- FIX: All Student Panel Database Issues
--
-- This migration resolves RLS policies that prevent:
--   1. Emergency contact visibility (students can't read their own student record fully)
--   2. Attendance history (students can't read attendance_records with session joins)
--   3. Watch time / progress (students can't update lms_lesson_progress)
--   4. Course completion status (enrollment status not updating)
--   5. Avatar not updating (students can't update their own users.avatar_url)
--
-- Run this ENTIRE file in Supabase SQL Editor.
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. FIX: Students can UPDATE their own student record (emergency_contact, etc.)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'students_own_update' AND tablename = 'students') THEN
    EXECUTE 'CREATE POLICY "students_own_update" ON public.students FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. FIX: Students can read attendance sessions (for history display)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Students need to read attendance_sessions to display session details in history
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'students_read_own_sessions' AND tablename = 'attendance_sessions') THEN
    EXECUTE 'CREATE POLICY "students_read_own_sessions" ON public.attendance_sessions FOR SELECT USING (
      institute_id = public.get_my_institute_id()
      AND public.get_my_role() = ''student''::user_role
    )';
  END IF;
END $$;

-- Students need to read their own attendance records
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'students_read_own_attendance' AND tablename = 'attendance_records') THEN
    EXECUTE 'CREATE POLICY "students_read_own_attendance" ON public.attendance_records FOR SELECT USING (
      student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    )';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. FIX: Students can update their LMS progress (watch time, lesson completion)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Allow students to INSERT their own lesson progress
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'students_insert_lesson_progress' AND tablename = 'lms_lesson_progress') THEN
    EXECUTE 'CREATE POLICY "students_insert_lesson_progress" ON public.lms_lesson_progress FOR INSERT WITH CHECK (
      student_id = auth.uid()
      AND institute_id = public.get_my_institute_id()
    )';
  END IF;
END $$;

-- Allow students to UPDATE their own lesson progress (watch time increment)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'students_update_lesson_progress' AND tablename = 'lms_lesson_progress') THEN
    EXECUTE 'CREATE POLICY "students_update_lesson_progress" ON public.lms_lesson_progress FOR UPDATE USING (
      student_id = auth.uid()
    ) WITH CHECK (
      student_id = auth.uid()
    )';
  END IF;
END $$;

-- Allow students to READ their own lesson progress
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'students_read_lesson_progress' AND tablename = 'lms_lesson_progress') THEN
    EXECUTE 'CREATE POLICY "students_read_lesson_progress" ON public.lms_lesson_progress FOR SELECT USING (
      student_id = auth.uid()
    )';
  END IF;
END $$;

-- Allow students to INSERT/UPDATE their course progress
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'students_manage_course_progress' AND tablename = 'lms_course_progress') THEN
    EXECUTE 'CREATE POLICY "students_manage_course_progress" ON public.lms_course_progress FOR ALL USING (
      student_id = auth.uid()
    ) WITH CHECK (
      student_id = auth.uid()
    )';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. FIX: Students can update their enrollment status (mark as completed)
-- ═══════════════════════════════════════════════════════════════════════════════

-- This was partially done in fix_student_enrollment_rls.sql but let's ensure it exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'students_update_own_enrollment' AND tablename = 'lms_enrollments') THEN
    EXECUTE 'CREATE POLICY "students_update_own_enrollment" ON public.lms_enrollments FOR UPDATE USING (
      student_id = auth.uid()
      AND institute_id = public.get_my_institute_id()
    ) WITH CHECK (
      student_id = auth.uid()
      AND institute_id = public.get_my_institute_id()
      AND status IN (''active'', ''completed'')
    )';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. FIX: All users can update their own profile (avatar_url, name, phone)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ensure user_update_own_profile policy exists (for avatar, name, phone updates)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_update_own_profile' AND tablename = 'users') THEN
    EXECUTE 'CREATE POLICY "user_update_own_profile" ON public.users FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid())';
  END IF;
END $$;

-- Ensure users can read their own profile
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_read_own_profile' AND tablename = 'users') THEN
    EXECUTE 'CREATE POLICY "user_read_own_profile" ON public.users FOR SELECT USING (id = auth.uid())';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. FIX: Students can read batches (for attendance session joins)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ensure students can read all active batches in their institute
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'student_read_institute_batches' AND tablename = 'batches') THEN
    EXECUTE 'CREATE POLICY "student_read_institute_batches" ON public.batches FOR SELECT USING (
      public.get_my_role() = ''student''::user_role
      AND institute_id = public.get_my_institute_id()
      AND is_active = true
    )';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. FIX: Enable RLS on tables that might not have it enabled
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE IF EXISTS public.lms_lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lms_course_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.attendance_sessions ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE! Verify with:
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
-- ═══════════════════════════════════════════════════════════════════════════════
