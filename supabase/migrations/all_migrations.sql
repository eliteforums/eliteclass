-- =============================================================================
-- EliteClass — Consolidated Database Migrations
--
-- This file contains all migrations for the EliteClass platform.
-- Run this against a fresh database or use individual sections as needed.
--
-- Sections:
--   1. Batch Join Requests
--   2. Certificate Templates & Issued Certificates
--   3. Exam Proctoring Columns
--   4. Notifications
--   5. Translation Cache
--   6. Direct Messaging (DM)
--   7. Extend Messages Table (Rich Messages)
--   8. Student Enrollment RLS Fixes
--   9. Student Profile Update RLS Fixes
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. BATCH JOIN REQUESTS
-- ═══════════════════════════════════════════════════════════════════════════════

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_join_requests_unique_pending
  ON public.batch_join_requests (student_id, batch_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_batch_join_requests_student ON public.batch_join_requests (student_id);
CREATE INDEX IF NOT EXISTS idx_batch_join_requests_institute_status ON public.batch_join_requests (institute_id, status);
CREATE INDEX IF NOT EXISTS idx_batch_join_requests_batch ON public.batch_join_requests (batch_id);

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


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. CERTIFICATE TEMPLATES & ISSUED CERTIFICATES
-- ═══════════════════════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. EXAM PROCTORING COLUMNS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS enable_tab_detection BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS enable_camera_mic BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS enable_deterrent_ui BOOLEAN NOT NULL DEFAULT FALSE;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  body VARCHAR(500) NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_id, is_read, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_recent
  ON public.notifications (recipient_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_notifications" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "users_update_own_notifications" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid());

CREATE POLICY "admin_staff_insert_notifications" ON public.notifications
  FOR INSERT WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() IN ('admin', 'staff')
    AND sender_id = auth.uid()
  );

CREATE POLICY "super_admin_notifications" ON public.notifications
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. TRANSLATION CACHE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.translation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_text_hash VARCHAR(64) NOT NULL,
  source_lang VARCHAR(10) NOT NULL,
  target_lang VARCHAR(10) NOT NULL,
  translated_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  UNIQUE(source_text_hash, source_lang, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_translation_cache_lookup
  ON public.translation_cache (source_text_hash, source_lang, target_lang, expires_at);

ALTER TABLE public.translation_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_cache" ON public.translation_cache
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_insert_cache" ON public.translation_cache
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "super_admin_translation_cache" ON public.translation_cache
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. DIRECT MESSAGING (DM)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.dm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  participant_1_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  participant_2_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  UNIQUE(participant_1_id, participant_2_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_conversations_participant_1 ON public.dm_conversations (participant_1_id);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_participant_2 ON public.dm_conversations (participant_2_id);

CREATE TABLE IF NOT EXISTS public.dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT,
  message_type VARCHAR(20) NOT NULL DEFAULT 'text',
  gif_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation ON public.dm_messages (conversation_id, created_at DESC);

ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants_view_own_conversations" ON public.dm_conversations
  FOR SELECT USING (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

CREATE POLICY "participants_create_conversations" ON public.dm_conversations
  FOR INSERT WITH CHECK (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

CREATE POLICY "participants_update_own_conversations" ON public.dm_conversations
  FOR UPDATE USING (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

CREATE POLICY "participants_read_messages" ON public.dm_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM public.dm_conversations
      WHERE participant_1_id = auth.uid() OR participant_2_id = auth.uid()
    )
  );

CREATE POLICY "participants_send_messages" ON public.dm_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM public.dm_conversations
      WHERE participant_1_id = auth.uid() OR participant_2_id = auth.uid()
    )
  );

CREATE POLICY "super_admin_dm_conversations" ON public.dm_conversations
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "super_admin_dm_messages" ON public.dm_messages
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. EXTEND MESSAGES TABLE (Rich Messages — GIF, Emoji)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'text';

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS gif_url TEXT;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS metadata JSONB;

ALTER TABLE public.messages
  ALTER COLUMN content DROP NOT NULL;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_content_length;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_check CHECK (
    CASE
      WHEN message_type = 'text' THEN
        content IS NOT NULL AND char_length(content) > 0 AND char_length(content) <= 4000
      WHEN message_type = 'gif' THEN
        gif_url IS NOT NULL AND char_length(gif_url) > 0
      WHEN message_type = 'emoji' THEN
        content IS NOT NULL AND char_length(content) > 0 AND char_length(content) <= 4000
      ELSE
        content IS NOT NULL AND char_length(content) > 0 AND char_length(content) <= 4000
    END
  );

ALTER TABLE public.messages
  ADD CONSTRAINT messages_type_check CHECK (message_type IN ('text', 'gif', 'emoji'));


-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. STUDENT ENROLLMENT RLS FIXES
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "lms_enroll_student_self" ON public.lms_enrollments;
CREATE POLICY "lms_enroll_student_self" ON public.lms_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
    AND enrolled_by = auth.uid()
    AND course_id IN (
      SELECT id FROM public.lms_courses
      WHERE institute_id = get_my_institute_id()
        AND status = 'published'
        AND visibility IN ('public', 'institutional')
    )
  );

DROP POLICY IF EXISTS "lms_enroll_student_self_update" ON public.lms_enrollments;
CREATE POLICY "lms_enroll_student_self_update" ON public.lms_enrollments
  FOR UPDATE TO authenticated
  USING (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
  )
  WITH CHECK (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
    AND status IN ('active', 'completed')
  );

DROP POLICY IF EXISTS "lms_course_student_browse_published" ON public.lms_courses;
CREATE POLICY "lms_course_student_browse_published" ON public.lms_courses
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND status = 'published'
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. STUDENT PROFILE UPDATE RLS FIXES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_my_student_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT id FROM public.students WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_student_id() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_own_update' AND tablename = 'students'
  ) THEN
    EXECUTE 'CREATE POLICY "students_own_update" ON public.students FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_insert_parent_user' AND tablename = 'users'
  ) THEN
    EXECUTE 'CREATE POLICY "students_insert_parent_user" ON public.users FOR INSERT WITH CHECK (
      institute_id = public.get_my_institute_id()
      AND role = ''parent''
      AND public.get_my_role() = ''student''::user_role
    )';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_insert_parent_record' AND tablename = 'parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_insert_parent_record" ON public.parents FOR INSERT WITH CHECK (
      institute_id = public.get_my_institute_id()
      AND public.get_my_role() = ''student''::user_role
    )';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_insert_student_parents' AND tablename = 'student_parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_insert_student_parents" ON public.student_parents FOR INSERT WITH CHECK (
      student_id = public.get_my_student_id()
    )';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_select_own_parents' AND tablename = 'student_parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_select_own_parents" ON public.student_parents FOR SELECT USING (
      student_id = public.get_my_student_id()
    )';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.student_can_read_parent(p_parent_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_parents
    WHERE student_id = (SELECT id FROM public.students WHERE user_id = auth.uid() LIMIT 1)
      AND parent_id = p_parent_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.student_can_read_parent(UUID) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_select_parent_users' AND tablename = 'parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_select_parent_users" ON public.parents FOR SELECT USING (
      public.get_my_role() = ''student''::user_role
      AND public.student_can_read_parent(id)
    )';
  END IF;
END $$;
