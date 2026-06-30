-- ---------------------------------------------------------------------------
-- Notifications hot-fix:
--   1. Bulk-insert RPC that bypasses per-row RLS round-trips
--   2. Add `notifications` to the supabase_realtime publication
-- Run this in the Supabase SQL editor.
-- ---------------------------------------------------------------------------

-- 1) Bulk-insert RPC ────────────────────────────────────────────────────────
-- Sends one notification per recipient in a single statement. SECURITY DEFINER
-- so it can bypass per-row INSERT RLS while still validating that the caller
-- is allowed to broadcast within their institute.
--
-- Validation rules:
--   - Caller must be admin / staff (or super_admin)
--   - All recipients must belong to the caller's institute (or any institute
--     when the caller is super_admin)
--   - Title 1..100 chars, body 1..500 chars
--
-- Returns the integer count of notifications successfully inserted.

CREATE OR REPLACE FUNCTION public.broadcast_notification(
  p_title          TEXT,
  p_body           TEXT,
  p_recipient_ids  UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id     UUID := auth.uid();
  v_role          TEXT;
  v_institute_id  UUID;
  v_inserted      INTEGER := 0;
BEGIN
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF length(coalesce(p_title, '')) < 1 OR length(p_title) > 100 THEN
    RAISE EXCEPTION 'invalid_title_length' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_body, '')) < 1 OR length(p_body) > 500 THEN
    RAISE EXCEPTION 'invalid_body_length' USING ERRCODE = '22023';
  END IF;
  IF p_recipient_ids IS NULL OR array_length(p_recipient_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT u.role, u.institute_id
    INTO v_role, v_institute_id
    FROM public.users u
   WHERE u.id = v_sender_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'sender_profile_missing' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('admin', 'staff', 'super_admin') THEN
    RAISE EXCEPTION 'role_not_allowed' USING ERRCODE = '42501';
  END IF;

  -- Bulk insert. For super_admin we still need an institute_id on each row;
  -- we use the recipient's institute_id (looked up below). For admin/staff
  -- we enforce that every recipient is in the sender's institute.
  IF v_role = 'super_admin' THEN
    INSERT INTO public.notifications (institute_id, sender_id, recipient_id, title, body)
    SELECT u.institute_id, v_sender_id, u.id, p_title, p_body
      FROM public.users u
     WHERE u.id = ANY(p_recipient_ids)
       AND u.institute_id IS NOT NULL;
  ELSE
    INSERT INTO public.notifications (institute_id, sender_id, recipient_id, title, body)
    SELECT v_institute_id, v_sender_id, u.id, p_title, p_body
      FROM public.users u
     WHERE u.id = ANY(p_recipient_ids)
       AND u.institute_id = v_institute_id;
  END IF;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.broadcast_notification(TEXT, TEXT, UUID[]) TO authenticated;


-- 2) Realtime publication ───────────────────────────────────────────────────
-- Without this the client-side `useNotifications` realtime channel will
-- subscribe successfully but never receive INSERT events. Polling (30s) was
-- masking this for slow updates; instant delivery requires the publication.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;

-- Smoke test (run after deploy, replace UUIDs with real values):
--   SELECT public.broadcast_notification('Test', 'Hello world', ARRAY['<some-user-id>']::uuid[]);
--   SELECT count(*) FROM public.notifications WHERE recipient_id = '<some-user-id>';
