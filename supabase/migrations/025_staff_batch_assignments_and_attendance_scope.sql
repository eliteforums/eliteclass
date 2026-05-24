-- ============================================================
-- EduOS Migration 025 — Staff Batch Assignments + Attendance Scope
-- ============================================================
--
-- WHY:
-- 1) staff_assignments already acts as the teacher/staff-to-batch relationship.
-- 2) We need explicit batch-only assignment rows (course_name + subject_name = NULL)
--    with uniqueness and metadata for assignment management from staff details.
-- 3) Staff attendance access must be limited to assigned batches.
--
-- NOTES:
-- - This migration keeps existing course assignment rows untouched.
-- - "Batch assignment" rows are represented as:
--     course_name IS NULL AND subject_name IS NULL AND batch_id IS NOT NULL
-- ============================================================

-- ── 1) staff_assignments hardening ──────────────────────────────────────────

ALTER TABLE public.staff_assignments
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.staff_assignments
SET assigned_at = COALESCE(assigned_at, created_at, NOW())
WHERE assigned_at IS NULL;

ALTER TABLE public.staff_assignments
  ALTER COLUMN assigned_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_staff_assignments_staff_id
  ON public.staff_assignments(staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_assignments_batch_id
  ON public.staff_assignments(batch_id)
  WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_assignments_assigned_at
  ON public.staff_assignments(assigned_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_batch_only_assignment
  ON public.staff_assignments(staff_id, batch_id)
  WHERE batch_id IS NOT NULL
    AND course_name IS NULL
    AND subject_name IS NULL;

-- ── 2) Coordinator write access for assignments ─────────────────────────────
-- Coordinators are represented in staff.designation (e.g. "Coordinator").

DROP POLICY IF EXISTS "coordinator_manage_assignments" ON public.staff_assignments;

CREATE POLICY "coordinator_manage_assignments"
  ON public.staff_assignments
  FOR ALL
  USING (
    institute_id = public.get_my_institute_id()
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.institute_id = public.staff_assignments.institute_id
        AND s.is_active IS TRUE
        AND COALESCE(s.designation, '') ILIKE '%coordinator%'
    )
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.institute_id = public.staff_assignments.institute_id
        AND s.is_active IS TRUE
        AND COALESCE(s.designation, '') ILIKE '%coordinator%'
    )
  );

-- ── 3) Attendance policies scoped to assigned batches for staff ────────────

DROP POLICY IF EXISTS "staff_read_attendance_sessions" ON public.attendance_sessions;
CREATE POLICY "staff_read_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND (
      EXISTS (
        SELECT 1 FROM public.staff_assignments sa
        WHERE sa.staff_id = public.get_my_staff_id()
          AND sa.batch_id = attendance_sessions.batch_id
      )
      OR EXISTS (
        SELECT 1 FROM public.schedules sch
        WHERE sch.teacher_id = public.get_my_staff_id()
          AND sch.batch_id = attendance_sessions.batch_id
          AND sch.status = 'published'
      )
    )
  );

DROP POLICY IF EXISTS "staff_read_attendance_records" ON public.attendance_records;
CREATE POLICY "staff_read_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND EXISTS (
      SELECT 1
      FROM public.attendance_sessions s
      WHERE s.id = attendance_records.session_id
        AND (
          EXISTS (
            SELECT 1 FROM public.staff_assignments sa
            WHERE sa.staff_id = public.get_my_staff_id()
              AND sa.batch_id = s.batch_id
          )
          OR EXISTS (
            SELECT 1 FROM public.schedules sch
            WHERE sch.teacher_id = public.get_my_staff_id()
              AND sch.batch_id = s.batch_id
              AND sch.status = 'published'
          )
        )
    )
  );

DROP POLICY IF EXISTS "staff_insert_attendance_records" ON public.attendance_records;
CREATE POLICY "staff_insert_attendance_records"
  ON public.attendance_records FOR INSERT
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND EXISTS (
      SELECT 1
      FROM public.attendance_sessions s
      WHERE s.id = attendance_records.session_id
        AND (
          EXISTS (
            SELECT 1 FROM public.staff_assignments sa
            WHERE sa.staff_id = public.get_my_staff_id()
              AND sa.batch_id = s.batch_id
          )
          OR EXISTS (
            SELECT 1 FROM public.schedules sch
            WHERE sch.teacher_id = public.get_my_staff_id()
              AND sch.batch_id = s.batch_id
              AND sch.status = 'published'
          )
        )
    )
  );

DROP POLICY IF EXISTS "staff_update_attendance_records" ON public.attendance_records;
CREATE POLICY "staff_update_attendance_records"
  ON public.attendance_records FOR UPDATE
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND EXISTS (
      SELECT 1
      FROM public.attendance_sessions s
      WHERE s.id = attendance_records.session_id
        AND (
          EXISTS (
            SELECT 1 FROM public.staff_assignments sa
            WHERE sa.staff_id = public.get_my_staff_id()
              AND sa.batch_id = s.batch_id
          )
          OR EXISTS (
            SELECT 1 FROM public.schedules sch
            WHERE sch.teacher_id = public.get_my_staff_id()
              AND sch.batch_id = s.batch_id
              AND sch.status = 'published'
          )
        )
    )
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND EXISTS (
      SELECT 1
      FROM public.attendance_sessions s
      WHERE s.id = attendance_records.session_id
        AND (
          EXISTS (
            SELECT 1 FROM public.staff_assignments sa
            WHERE sa.staff_id = public.get_my_staff_id()
              AND sa.batch_id = s.batch_id
          )
          OR EXISTS (
            SELECT 1 FROM public.schedules sch
            WHERE sch.teacher_id = public.get_my_staff_id()
              AND sch.batch_id = s.batch_id
              AND sch.status = 'published'
          )
        )
    )
  );

-- ── 4) Fix parent_read_linked_attendance_sessions to avoid RLS recursion ────

-- The parent_read_linked_attendance_sessions policy from migration 015 causes
-- infinite recursion because it queries attendance_records (which has RLS 
-- policies that reference attendance_sessions). Rewrite to directly join 
-- students/parents without triggering nested RLS evaluation.

DROP POLICY IF EXISTS "parent_read_linked_attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "parent_read_linked_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    batch_id IN (
      SELECT DISTINCT s.batch_id
      FROM public.students s
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
        AND s.batch_id IS NOT NULL
    )
  );
