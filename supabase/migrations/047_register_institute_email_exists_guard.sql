-- ============================================================
-- Migration 047: Clarify register_institute invalid-user failures
--
-- If p_user_id is not found in auth.users (common when signUp is called
-- for an existing email and Supabase returns a placeholder user object),
-- return a specific email-already-registered exception when applicable.
-- ============================================================

CREATE OR REPLACE FUNCTION public.register_institute(
  p_institute_name TEXT,
  p_admin_name     TEXT,
  p_email          TEXT,
  p_phone          TEXT,
  p_user_id        UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_institute_id UUID;
  v_institute_code TEXT;
  v_existing_institute_id UUID;
  v_existing_user_id UUID;
  v_auth_email TEXT;
  v_attempt INT := 0;
BEGIN
  SELECT email INTO v_auth_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_auth_email IS NULL THEN
    -- If this email already has a platform user profile, surface a useful
    -- conflict message instead of generic invalid-session noise.
    SELECT u.id INTO v_existing_user_id
    FROM public.users u
    WHERE lower(trim(COALESCE(u.email, ''))) = lower(trim(COALESCE(p_email, '')))
    LIMIT 1;

    IF v_existing_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'REGISTRATION_EMAIL_ALREADY_REGISTERED: Email is already registered.';
    END IF;

    RAISE EXCEPTION 'REGISTRATION_INVALID_USER: User ID does not exist in auth system.';
  END IF;

  IF lower(trim(COALESCE(v_auth_email, ''))) <> lower(trim(COALESCE(p_email, ''))) THEN
    RAISE EXCEPTION 'REGISTRATION_INVALID_USER_EMAIL: Auth user/email mismatch.';
  END IF;

  SELECT institute_id INTO v_existing_institute_id
  FROM public.users
  WHERE id = p_user_id;

  IF v_existing_institute_id IS NOT NULL THEN
    RETURN json_build_object(
      'user_id', p_user_id,
      'institute_id', v_existing_institute_id,
      'already_exists', TRUE
    );
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_institute_code := LPAD((floor(random() * 900) + 100)::text, 3, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.institutes i WHERE i.institute_code = v_institute_code
    );

    IF v_attempt >= 100 THEN
      RAISE EXCEPTION 'REGISTRATION_CODE_FAILED: Could not allocate institute code.';
    END IF;
  END LOOP;

  INSERT INTO public.institutes (name, logo, subscription_plan, is_active, institute_code)
  VALUES (p_institute_name, NULL, 'free', TRUE, v_institute_code)
  RETURNING id INTO v_institute_id;

  INSERT INTO public.users (id, institute_id, role, name, email, phone, is_active)
  VALUES (p_user_id, v_institute_id, 'admin', p_admin_name, p_email, p_phone, TRUE)
  ON CONFLICT (id) DO UPDATE SET
    institute_id = EXCLUDED.institute_id,
    role         = 'admin',
    name         = EXCLUDED.name,
    phone        = EXCLUDED.phone,
    is_active    = TRUE;

  RETURN json_build_object(
    'user_id', p_user_id,
    'institute_id', v_institute_id,
    'institute_code', v_institute_code,
    'already_exists', FALSE
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '%', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_institute(TEXT, TEXT, TEXT, TEXT, UUID)
  TO anon, authenticated;
