-- ============================================================
-- EduOS Migration 007 — Staff Attendance Write Access
-- ============================================================
--
-- FIXES:
--   Staff users can mark attendance, but the previous RLS policy only
--   granted SELECT on public.attendance_records. That caused save attempts
--   to fail and the UI to fall back to the default 'present' state on reload.
--
-- This migration grants INSERT/UPDATE access for staff within their
-- institute so attendance changes persist correctly.
-- ============================================================

DROP POLICY IF EXISTS "staff_manage_attendance_records" ON public.attendance_records;

CREATE POLICY "staff_insert_attendance_records"
  ON public.attendance_records FOR INSERT
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

CREATE POLICY "staff_update_attendance_records"
  ON public.attendance_records FOR UPDATE
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'staff');
