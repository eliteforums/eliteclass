-- Additional indexes for dashboard / list query performance (idempotent)

CREATE INDEX IF NOT EXISTS idx_students_institute_status ON public.students (institute_id, status);
CREATE INDEX IF NOT EXISTS idx_students_batch ON public.students (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON public.attendance_records (student_id, marked_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_fees_student_status ON public.student_fees (student_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_institute_active ON public.staff (institute_id) WHERE is_active IS TRUE;
