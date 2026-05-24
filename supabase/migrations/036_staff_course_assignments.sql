-- ============================================================
-- EduOS Migration 036 — Staff course assignments
-- ============================================================
--
-- Purpose:
--   Add a dedicated many-to-many relationship between staff and courses,
--   independent from batch assignments.
--
-- Guarantees:
--   - Prevents duplicate staff/course assignments
--   - Preserves assignments when staff is queried after refresh
--   - Removes assignments automatically when a staff member or course is deleted
--   - Keeps writes restricted to admin/super_admin via RLS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_courses (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  staff_id     UUID        NOT NULL REFERENCES public.staff(id)      ON DELETE CASCADE,
  course_id    UUID        NOT NULL REFERENCES public.courses(id)     ON DELETE CASCADE,
  assigned_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_courses_staff_id
  ON public.staff_courses(staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_courses_course_id
  ON public.staff_courses(course_id);

CREATE INDEX IF NOT EXISTS idx_staff_courses_institute_id
  ON public.staff_courses(institute_id);

CREATE INDEX IF NOT EXISTS idx_staff_courses_assigned_at
  ON public.staff_courses(assigned_at DESC);

ALTER TABLE public.staff_courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_staff_courses" ON public.staff_courses;
CREATE POLICY "super_admin_all_staff_courses"
  ON public.staff_courses
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "admin_manage_staff_courses" ON public.staff_courses;
CREATE POLICY "admin_manage_staff_courses"
  ON public.staff_courses
  FOR ALL
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'admin'
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "staff_read_own_staff_courses" ON public.staff_courses;
CREATE POLICY "staff_read_own_staff_courses"
  ON public.staff_courses
  FOR SELECT
  USING (
    staff_id = public.get_my_staff_id()
    AND institute_id = public.get_my_institute_id()
  );
