-- ============================================================
-- EduOS Migration 042 — Link LMS Courses to Academic Courses
-- ============================================================
-- Fixes the disconnect between Admin Course Assignments (Academic)
-- and Staff Course Visibility (LMS).

-- 1. Add course_id to lms_courses to link LMS content to Academic courses
ALTER TABLE public.lms_courses
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lms_courses_academic_course ON public.lms_courses(course_id);

-- 2. Update RLS on lms_courses to allow staff to see courses they are assigned to
-- We drop the existing restrictive staff read policy and replace it with one that
-- checks both creation and assignment.

DROP POLICY IF EXISTS "lms_course_staff_read" ON public.lms_courses;
DROP POLICY IF EXISTS "lms_course_staff_own" ON public.lms_courses;
DROP POLICY IF EXISTS "lms_course_staff_assigned" ON public.lms_courses;

-- Staff can manage (ALL) courses they created
CREATE POLICY "lms_course_staff_own" ON public.lms_courses
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  );

-- Staff can read (SELECT) courses they are assigned to via academic staff_courses
CREATE POLICY "lms_course_staff_assigned" ON public.lms_courses
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND (
      created_by = auth.uid()
      OR id IN (
        SELECT sc.course_id 
        FROM public.staff_courses sc
        JOIN public.staff s ON s.id = sc.staff_id
        WHERE s.user_id = auth.uid()
      )
    )
  );

-- 3. Update RLS on lms_modules/lessons/materials to follow the same logic
-- Since they reference lms_courses(id), the existing lms_is_course_owner helper
-- already handles the 'created_by' check. We need to ensure they can also see
-- assigned ones.

CREATE OR REPLACE FUNCTION lms_is_course_assigned(p_lms_course_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lms_courses lc
    WHERE lc.id = p_lms_course_id
    AND (
      lc.created_by = auth.uid()
      OR lc.id IN (
        SELECT sc.course_id 
        FROM public.staff_courses sc
        JOIN public.staff s ON s.id = sc.staff_id
        WHERE s.user_id = auth.uid()
      )
    )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

DROP POLICY IF EXISTS "lms_mod_student_enrolled" ON public.lms_modules;
DROP POLICY IF EXISTS "lms_mod_staff_read" ON public.lms_modules;
CREATE POLICY "lms_mod_staff_read" ON public.lms_modules
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_assigned(course_id)
  );

DROP POLICY IF EXISTS "lms_lesson_student" ON public.lms_lessons;
DROP POLICY IF EXISTS "lms_lesson_staff_read" ON public.lms_lessons;
CREATE POLICY "lms_lesson_staff_read" ON public.lms_lessons
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_assigned(course_id)
  );
