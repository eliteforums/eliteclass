-- ============================================================
-- Fix: Student Self-Enrollment RLS Policies
-- ============================================================
-- This migration adds/replaces RLS policies to allow students to:
-- 1. INSERT enrollment rows for themselves in published courses
-- 2. UPDATE their own enrollment rows (e.g. re-activate via upsert)
-- 3. Browse (SELECT) all published courses in their institute
--
-- Uses DROP IF EXISTS + CREATE for idempotency.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. INSERT policy: Allow students to self-enroll in published courses
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lms_enroll_student_self" ON public.lms_enrollments;
CREATE POLICY "lms_enroll_student_self" ON public.lms_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
    AND enrolled_by = auth.uid()
    AND course_id IN (
      SELECT id FROM public.lms_courses
      WHERE institute_id = get_my_institute_id()
        AND status = 'published'
        AND visibility IN ('public', 'institutional')
    )
  );

-- ──────────────────────────────────────────────────────────────
-- 2. UPDATE policy: Allow students to update their own enrollment rows
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lms_enroll_student_self_update" ON public.lms_enrollments;
CREATE POLICY "lms_enroll_student_self_update" ON public.lms_enrollments
  FOR UPDATE TO authenticated
  USING (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
  )
  WITH CHECK (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
    AND status IN ('active', 'completed')
  );

-- ──────────────────────────────────────────────────────────────
-- 3. SELECT policy: Allow students to browse all published courses
--    in their institute (removes chicken-and-egg enrollment requirement)
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lms_course_student_browse_published" ON public.lms_courses;
CREATE POLICY "lms_course_student_browse_published" ON public.lms_courses
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND status = 'published'
  );
