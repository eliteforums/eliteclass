-- ============================================================
-- EduOS Migration 056 — Student read access for assignment resources
--
-- Allows assigned students to:
--   • SELECT assignment_resources metadata (RLS)
--   • SELECT storage objects in assignment-resources bucket
--
-- Isolated to assignment resource visibility. No upload changes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.student_can_read_assignment_resource(p_assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignment_assignees aa
    JOIN public.students s ON s.id = aa.student_id
    WHERE aa.assignment_id = p_assignment_id
      AND s.user_id = auth.uid()
      AND s.institute_id = public.get_my_institute_id()
  );
$$;

GRANT EXECUTE ON FUNCTION public.student_can_read_assignment_resource(uuid) TO authenticated;

DROP POLICY IF EXISTS "student_read_resources" ON public.assignment_resources;

CREATE POLICY "student_read_resources" ON public.assignment_resources
  FOR SELECT TO authenticated
  USING (
    public.get_my_role() = 'student'
    AND institute_id = public.get_my_institute_id()
    AND public.student_can_read_assignment_resource(assignment_id)
  );

DROP POLICY IF EXISTS "Students can read assignment resources" ON storage.objects;

CREATE POLICY "Students can read assignment resources" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'assignment-resources'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() = 'student'
  );
