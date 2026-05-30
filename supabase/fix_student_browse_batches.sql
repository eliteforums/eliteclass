-- =============================================================================
-- Fix: Allow students to browse ALL active batches in their institute
--
-- The existing "student_read_own_batch" policy only allows students to see
-- batches they're already assigned to. For the "Browse Batches" feature,
-- students need to see ALL active batches to submit join requests.
--
-- This adds a broader SELECT policy that allows viewing all active batches
-- within the student's institute.
-- =============================================================================

-- Drop the restrictive policy and replace with a broader one
DROP POLICY IF EXISTS "student_read_own_batch" ON public.batches;

-- Students can see ALL active batches in their institute (for browsing)
CREATE POLICY "student_read_institute_batches"
  ON public.batches FOR SELECT
  USING (
    public.get_my_role() = 'student'::user_role
    AND institute_id = public.get_my_institute_id()
    AND is_active = true
  );
