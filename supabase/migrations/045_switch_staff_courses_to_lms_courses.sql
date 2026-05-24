-- ============================================================
-- EduOS Migration 045 — Switch staff course assignments to LMS courses
-- ============================================================
--
-- Purpose:
--   Make staff course assignments reference LMS courses directly so the
--   assignment picker matches the courses created in the LMS wizard.
-- ============================================================

ALTER TABLE public.staff_courses
  DROP CONSTRAINT IF EXISTS staff_courses_course_id_fkey;

ALTER TABLE public.staff_courses
  ADD CONSTRAINT staff_courses_course_id_fkey
  FOREIGN KEY (course_id)
  REFERENCES public.lms_courses(id)
  ON DELETE CASCADE;