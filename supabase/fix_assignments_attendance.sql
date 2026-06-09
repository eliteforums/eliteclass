-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 1: Allow admins and staff to view ALL assignment submissions
--        in their institute (not just their own).
--
-- If RLS is enabled on assignment_submissions, students can currently only
-- read their own rows.  Add a policy so institute members (admin/staff) can
-- SELECT all rows scoped to their institute.
--
-- Run this in your Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the old restrictive policy if it exists
DROP POLICY IF EXISTS "institute_members_view_submissions" ON assignment_submissions;

-- Allow any authenticated user whose institute_id matches to SELECT
CREATE POLICY "institute_members_view_submissions" ON assignment_submissions
  FOR SELECT
  USING (
    institute_id = (
      SELECT institute_id FROM users WHERE id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 2: Prevent writes to attendance_records when the session is locked.
--
-- A DB-level trigger is the strongest guard — it blocks even direct API calls
-- that bypass the application layer.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_attendance_session_not_locked()
RETURNS TRIGGER AS $$
DECLARE
  session_locked BOOLEAN;
BEGIN
  SELECT is_locked INTO session_locked
  FROM attendance_sessions
  WHERE id = NEW.session_id;

  IF session_locked = TRUE THEN
    RAISE EXCEPTION 'Cannot modify attendance: session is locked. Unlock the session first.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if already exists (idempotent)
DROP TRIGGER IF EXISTS trg_check_session_not_locked ON attendance_records;

-- Fire on INSERT and UPDATE
CREATE TRIGGER trg_check_session_not_locked
  BEFORE INSERT OR UPDATE ON attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION check_attendance_session_not_locked();
