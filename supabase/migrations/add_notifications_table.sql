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

-- Partial index for fetching unread notifications efficiently
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_id, is_read, created_at DESC)
  WHERE is_read = false;

-- Index for fetching recent notifications (read and unread)
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_recent
  ON public.notifications (recipient_id, created_at DESC);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Recipients can view their own notifications
CREATE POLICY "users_view_own_notifications" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

-- Recipients can update their own notifications (mark as read)
CREATE POLICY "users_update_own_notifications" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid());

-- Admins and instructors can insert notifications within their institute
CREATE POLICY "admin_staff_insert_notifications" ON public.notifications
  FOR INSERT WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() IN ('admin', 'staff')
    AND sender_id = auth.uid()
  );

-- Super admins have full access
CREATE POLICY "super_admin_notifications" ON public.notifications
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());
