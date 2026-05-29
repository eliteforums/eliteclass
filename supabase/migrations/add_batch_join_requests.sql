CREATE TABLE IF NOT EXISTS public.batch_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reason TEXT,
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate pending requests
CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_join_requests_unique_pending
  ON public.batch_join_requests (student_id, batch_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_batch_join_requests_student ON public.batch_join_requests (student_id);
CREATE INDEX IF NOT EXISTS idx_batch_join_requests_institute_status ON public.batch_join_requests (institute_id, status);
CREATE INDEX IF NOT EXISTS idx_batch_join_requests_batch ON public.batch_join_requests (batch_id);

-- RLS
ALTER TABLE public.batch_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_view_own_requests" ON public.batch_join_requests
  FOR SELECT USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

CREATE POLICY "students_create_own_requests" ON public.batch_join_requests
  FOR INSERT WITH CHECK (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

CREATE POLICY "students_cancel_own_requests" ON public.batch_join_requests
  FOR UPDATE USING (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    AND status = 'pending'
  ) WITH CHECK (status = 'cancelled');

CREATE POLICY "staff_view_institute_requests" ON public.batch_join_requests
  FOR SELECT USING (institute_id = get_my_institute_id() AND get_my_role() IN ('admin', 'staff'));

CREATE POLICY "staff_update_requests" ON public.batch_join_requests
  FOR UPDATE USING (institute_id = get_my_institute_id() AND get_my_role() IN ('admin', 'staff'));

CREATE POLICY "admin_all_requests" ON public.batch_join_requests
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());
