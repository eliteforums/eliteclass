-- =============================================================================
-- EliteClass — Messages Table Migration
--
-- Creates the messages table for batch communication with:
--   • RLS policies enforcing batch-member-only access
--   • Helper function to check batch membership (student, staff, admin)
--   • Realtime publication for live message delivery
--
-- Run this in Supabase Dashboard → SQL Editor
-- =============================================================================

-- ============================================================
-- 1. Create messages table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   UUID        NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  sender_id  UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 2. CHECK constraint: content must be non-empty and max 4000 chars
  CONSTRAINT messages_content_length CHECK (
    char_length(content) > 0 AND char_length(content) <= 4000
  )
);

-- ============================================================
-- 3. Index for efficient batch message retrieval (chronological)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_messages_batch_created
  ON public.messages (batch_id, created_at DESC);

-- ============================================================
-- 4. Enable Row Level Security
-- ============================================================

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. Helper function: is_batch_member
--
-- Checks if a user belongs to a batch via any of:
--   • Student: exists in student_batch_assignments with matching batch_id
--   • Staff: exists in staff_assignments with matching batch_id
--   • Admin: user role is admin and batch belongs to same institute
--
-- SECURITY DEFINER + SET row_security = off prevents infinite
-- recursion when RLS policies on referenced tables would otherwise
-- trigger nested policy checks.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_batch_member(p_user_id UUID, p_batch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    -- Student enrolled in batch (via student_batch_assignments)
    SELECT 1
    FROM public.students s
    JOIN public.student_batch_assignments sba ON sba.student_id = s.id
    WHERE s.user_id = p_user_id
      AND sba.batch_id = p_batch_id
      AND sba.is_active = TRUE

    UNION ALL

    -- Staff assigned to batch
    SELECT 1
    FROM public.staff st
    JOIN public.staff_assignments sa ON sa.staff_id = st.id
    WHERE st.user_id = p_user_id
      AND sa.batch_id = p_batch_id

    UNION ALL

    -- Admin of the institute that owns the batch
    SELECT 1
    FROM public.users u
    JOIN public.batches b ON b.institute_id = u.institute_id
    WHERE u.id = p_user_id
      AND u.role = 'admin'
      AND b.id = p_batch_id
  );
END;
$$;

-- ============================================================
-- 6. SELECT policy: only batch members can read messages
-- ============================================================

DROP POLICY IF EXISTS "messages_select" ON public.messages;
CREATE POLICY "messages_select"
  ON public.messages
  FOR SELECT
  USING (public.is_batch_member(auth.uid(), batch_id));

-- ============================================================
-- 7. INSERT policy: batch members can insert with sender_id = auth.uid()
-- ============================================================

DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_batch_member(auth.uid(), batch_id)
  );

-- ============================================================
-- 8. Add messages table to supabase_realtime publication
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
