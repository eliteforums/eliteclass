-- ============================================================
-- EduOS Migration 043 — Fix Student LMS Content Visibility
-- ============================================================
-- Fixes "No modules or lessons available" issue for students
-- by bridging the gap between Academic Enrollments and LMS Content.

-- 1. Ensure students can read published modules
DROP POLICY IF EXISTS "lms_mod_student_enrolled" ON public.lms_modules;
CREATE POLICY "lms_mod_student_enrolled" ON public.lms_modules
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND is_published = true
    AND (
      -- Direct LMS enrollment
      EXISTS (
        SELECT 1 FROM public.lms_enrollments
        WHERE course_id = lms_modules.course_id
        AND student_id = auth.uid()
        AND status IN ('active', 'completed')
      )
      OR 
      -- Academic enrollment via linked course
      EXISTS (
        SELECT 1 FROM public.lms_courses lc
        JOIN public.student_courses sc ON sc.course_id = lc.course_id
        JOIN public.students s ON s.id = sc.student_id
        WHERE lc.id = lms_modules.course_id
        AND s.user_id = auth.uid()
        AND sc.status = 'active'
      )
      OR
      -- Visibility-based preview (allows seeing module list)
      EXISTS (
        SELECT 1 FROM public.lms_courses lc
        WHERE lc.id = lms_modules.course_id
        AND lc.status = 'published'
        AND (lc.visibility = 'public' OR lc.visibility = 'institutional')
      )
    )
  );

-- 2. Ensure students can read published lessons
DROP POLICY IF EXISTS "lms_lesson_student" ON public.lms_lessons;
CREATE POLICY "lms_lesson_student" ON public.lms_lessons
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND is_published = true
    AND (
      is_preview = true
      OR 
      -- Direct LMS enrollment
      EXISTS (
        SELECT 1 FROM public.lms_enrollments
        WHERE course_id = lms_lessons.course_id
        AND student_id = auth.uid()
        AND status IN ('active', 'completed')
      )
      OR 
      -- Academic enrollment via linked course
      EXISTS (
        SELECT 1 FROM public.lms_courses lc
        JOIN public.student_courses sc ON sc.course_id = lc.course_id
        JOIN public.students s ON s.id = sc.student_id
        WHERE lc.id = lms_lessons.course_id
        AND s.user_id = auth.uid()
        AND sc.status = 'active'
      )
    )
  );

-- 3. Ensure students can read materials
DROP POLICY IF EXISTS "lms_mat_student_enrolled" ON public.lms_lesson_materials;
CREATE POLICY "lms_mat_student_enrolled" ON public.lms_lesson_materials
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'student'
    AND (
      -- Direct LMS enrollment
      EXISTS (
        SELECT 1 FROM public.lms_enrollments
        WHERE course_id = lms_lesson_materials.course_id
        AND student_id = auth.uid()
        AND status IN ('active', 'completed')
      )
      OR 
      -- Academic enrollment via linked course
      EXISTS (
        SELECT 1 FROM public.lms_courses lc
        JOIN public.student_courses sc ON sc.course_id = lc.course_id
        JOIN public.students s ON s.id = sc.student_id
        WHERE lc.id = lms_lesson_materials.course_id
        AND s.user_id = auth.uid()
        AND sc.status = 'active'
      )
    )
  );

-- 4. Fix potential issue where lms_course_progress might be missing
-- This trigger ensures that when a student opens a course for the first time,
-- their progress record is initialized.
CREATE OR REPLACE FUNCTION public.lms_ensure_course_progress()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.lms_course_progress
    (enrollment_id, student_id, course_id, institute_id)
  VALUES
    (NEW.id, NEW.student_id, NEW.course_id, NEW.institute_id)
  ON CONFLICT (enrollment_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_lms_init_course_progress ON public.lms_enrollments;
CREATE TRIGGER trg_lms_init_course_progress
  AFTER INSERT ON public.lms_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.lms_ensure_course_progress();
