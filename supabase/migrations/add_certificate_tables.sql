CREATE TABLE IF NOT EXISTS public.certificate_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  body_text TEXT NOT NULL,
  logo_url TEXT,
  seal_url TEXT,
  signatory_name TEXT NOT NULL,
  signatory_designation TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certificate_templates_institute ON public.certificate_templates (institute_id);

CREATE TABLE IF NOT EXISTS public.issued_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.certificate_templates(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  issued_by UUID NOT NULL REFERENCES public.users(id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  custom_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_issued_certificates_student ON public.issued_certificates (student_id);
CREATE INDEX IF NOT EXISTS idx_issued_certificates_institute ON public.issued_certificates (institute_id);
CREATE INDEX IF NOT EXISTS idx_issued_certificates_template ON public.issued_certificates (template_id);

ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issued_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_staff_manage_templates" ON public.certificate_templates
  FOR ALL USING (institute_id = get_my_institute_id() AND get_my_role() IN ('admin', 'staff'));

CREATE POLICY "admin_staff_manage_issued" ON public.issued_certificates
  FOR ALL USING (institute_id = get_my_institute_id() AND get_my_role() IN ('admin', 'staff'));

CREATE POLICY "students_view_own_certificates" ON public.issued_certificates
  FOR SELECT USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

CREATE POLICY "super_admin_templates" ON public.certificate_templates
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "super_admin_issued" ON public.issued_certificates
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());
