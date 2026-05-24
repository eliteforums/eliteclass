-- ============================================================================
-- Migration 012 — create_student_profile (replaces admit_student pgcrypto RPC)
-- ============================================================================
--
-- BUGS FIXED IN THIS VERSION:
--
--  1. gen_salt / pgcrypto dependency removed.
--     Auth user creation is now handled by supabase.auth.signUp() on the
--     frontend. Supabase bcrypts the password internally. No SQL extension needed.
--
--  2. ERROR 42P13 fixed:
--     PostgreSQL requires that once a parameter has a DEFAULT value, every
--     subsequent parameter must also have a DEFAULT.
--     The previous version had: required → optional → required → optional
--     which is illegal. Fixed by placing ALL required params first, then ALL
--     optional (DEFAULT NULL) params.
--
-- ============================================================================

SET LOCAL ROLE postgres;

-- Drop every known variant of admit_student
DROP FUNCTION IF EXISTS public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);

-- Drop pgcrypto helper from migration 011
DROP FUNCTION IF EXISTS public.generate_student_temp_password();

-- Drop previous (broken) version of create_student_profile
DROP FUNCTION IF EXISTS public.create_student_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);

-- ── Extra columns for students (from migration 011, idempotent) ───────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS login_id        TEXT,
  ADD COLUMN IF NOT EXISTS generated_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_email   TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_login_id
  ON public.students (login_id) WHERE login_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_generated_email
  ON public.students (generated_email) WHERE generated_email IS NOT NULL;

ALTER TABLE public.institutes
  ADD COLUMN IF NOT EXISTS institute_code VARCHAR(10);

-- ── create_student_profile ────────────────────────────────────────────────────
--
-- Parameter ordering rule enforced here:
--   REQUIRED params (no DEFAULT) → OPTIONAL params (DEFAULT NULL)
--
-- Called by the frontend AFTER supabase.auth.signUp() creates the auth user.

CREATE OR REPLACE FUNCTION public.create_student_profile(
  -- ── Required params (no DEFAULT) ─────────────────────────────────────────
  p_user_id              UUID,
  p_institute_id         UUID,
  p_login_id             TEXT,
  p_student_email        TEXT,
  p_name                 TEXT,
  p_phone                TEXT,
  p_admission_no         TEXT,
  -- ── Optional params — ALL after required, ALL with DEFAULT ────────────────
  p_contact_email        TEXT     DEFAULT NULL,
  p_batch_id             UUID     DEFAULT NULL,
  p_aadhaar_last4        TEXT     DEFAULT NULL,
  p_emergency_contact    JSONB    DEFAULT NULL,
  p_parent_name          TEXT     DEFAULT NULL,
  p_parent_email         TEXT     DEFAULT NULL,
  p_parent_phone         TEXT     DEFAULT NULL,
  p_parent_occupation    TEXT     DEFAULT NULL,
  p_parent_relation_type TEXT     DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role      user_role;
  v_caller_institute UUID;
  v_student_id       UUID;
  v_parent_id        UUID;
  v_parent_user_id   UUID;
  v_parent_email     TEXT := NULLIF(lower(trim(COALESCE(p_parent_email, ''))), '');
  v_parent_phone     TEXT := NULLIF(trim(COALESCE(p_parent_phone, '')), '');
  v_parent_name      TEXT := NULLIF(trim(COALESCE(p_parent_name, '')), '');
  v_rel              relation_type;
BEGIN
  -- ── Security: caller must be admin of the target institute ─────────────────
  SELECT role, institute_id
    INTO v_caller_role, v_caller_institute
    FROM public.users
   WHERE id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_FORBIDDEN: Caller has no user profile.';
  END IF;
  IF v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_FORBIDDEN: Only admins can admit students.';
  END IF;
  IF v_caller_role = 'admin' AND v_caller_institute != p_institute_id THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_FORBIDDEN: You can only admit students into your own institute.';
  END IF;

  -- ── Validate institute ─────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.institutes
     WHERE id = p_institute_id AND COALESCE(is_active, TRUE)
  ) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_INVALID_INSTITUTE: Institute not found or inactive.';
  END IF;

  -- ── Duplicate admission number ─────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.students
     WHERE institute_id = p_institute_id
       AND lower(admission_no) = lower(trim(p_admission_no))
  ) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_DUPLICATE_ADMISSION_NO: This admission number is already in use.';
  END IF;

  -- ── Batch validation ───────────────────────────────────────────────────────
  IF p_batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.batches
     WHERE id = p_batch_id AND institute_id = p_institute_id
  ) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_INVALID_BATCH: The selected batch does not belong to this institute.';
  END IF;

  -- ── Upsert public.users ────────────────────────────────────────────────────
  -- The auth user already exists (created by supabase.auth.signUp).
  -- ON CONFLICT handles the rare case where handle_new_user trigger fired first.
  INSERT INTO public.users (id, institute_id, role, name, email, phone, is_active)
  VALUES (
    p_user_id, p_institute_id, 'student',
    trim(p_name), lower(trim(p_student_email)), trim(p_phone), TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    institute_id = EXCLUDED.institute_id,
    role         = 'student',
    name         = EXCLUDED.name,
    email        = EXCLUDED.email,
    phone        = EXCLUDED.phone,
    is_active    = TRUE;

  -- ── Insert public.students ─────────────────────────────────────────────────
  INSERT INTO public.students (
    institute_id, user_id, admission_no, batch_id,
    aadhaar_masked, emergency_contact, status,
    login_id, generated_email, contact_email
  ) VALUES (
    p_institute_id, p_user_id, trim(p_admission_no), p_batch_id,
    p_aadhaar_last4, p_emergency_contact, 'active',
    p_login_id, lower(trim(p_student_email)),
    NULLIF(lower(trim(COALESCE(p_contact_email, ''))), '')
  )
  RETURNING id INTO v_student_id;

  -- ── Optional parent block ─────────────────────────────────────────────────
  IF v_parent_name IS NOT NULL AND (v_parent_email IS NOT NULL OR v_parent_phone IS NOT NULL) THEN

    -- Validate relation type
    BEGIN
      v_rel := p_parent_relation_type::relation_type;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ADMIT_STUDENT_INVALID_PARENT_RELATION: Invalid relation type.';
    END;

    -- Guard: parent email cannot match student email
    IF v_parent_email IS NOT NULL
       AND lower(trim(v_parent_email)) = lower(trim(p_student_email)) THEN
      RAISE EXCEPTION 'ADMIT_STUDENT_PARENT_SAME_AS_STUDENT: Parent email cannot match student email.';
    END IF;

    -- Find existing parent by email
    IF v_parent_email IS NOT NULL THEN
      SELECT p.id, p.user_id INTO v_parent_id, v_parent_user_id
        FROM public.parents p
        JOIN public.users   u ON u.id = p.user_id
       WHERE p.institute_id = p_institute_id
         AND lower(trim(u.email)) = v_parent_email
       LIMIT 1;
    END IF;

    -- Find existing parent by phone
    IF v_parent_id IS NULL AND v_parent_phone IS NOT NULL THEN
      SELECT p.id, p.user_id INTO v_parent_id, v_parent_user_id
        FROM public.parents p
        JOIN public.users   u ON u.id = p.user_id
       WHERE p.institute_id = p_institute_id
         AND trim(u.phone) = v_parent_phone
       LIMIT 1;
    END IF;

    -- Create new parent if not found
    IF v_parent_id IS NULL THEN
      v_parent_user_id := gen_random_uuid();

      -- Auth user for parent (empty password — uses forgot-password to set own)
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_parent_user_id, 'authenticated', 'authenticated',
        COALESCE(v_parent_email, v_parent_user_id::text || '@parent.eduos.internal'),
        '', NOW(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object(
          'name', v_parent_name, 'role', 'parent',
          'institute_id', p_institute_id::text
        ),
        NOW(), NOW(), '', '', '', ''
      );

      INSERT INTO public.users (id, institute_id, role, name, email, phone, is_active)
      VALUES (
        v_parent_user_id, p_institute_id, 'parent', v_parent_name,
        COALESCE(v_parent_email, v_parent_user_id::text || '@parent.eduos.internal'),
        v_parent_phone, TRUE
      )
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.parents (institute_id, user_id, occupation)
      VALUES (
        p_institute_id,
        v_parent_user_id,
        NULLIF(trim(COALESCE(p_parent_occupation, '')), '')
      )
      RETURNING id INTO v_parent_id;
    END IF;

    -- Link student <-> parent
    INSERT INTO public.student_parents (student_id, parent_id, relation_type)
    VALUES (v_student_id, v_parent_id, v_rel)
    ON CONFLICT (student_id, parent_id) DO NOTHING;

  END IF;

  -- ── Activity log (non-fatal) ───────────────────────────────────────────────
  BEGIN
    INSERT INTO public.activity_logs (
      institute_id, user_id, action, entity_type, entity_id, metadata
    ) VALUES (
      p_institute_id, auth.uid(), 'student.admitted', 'student', v_student_id,
      jsonb_build_object(
        'student_name', trim(p_name),
        'admission_no', trim(p_admission_no),
        'login_id',     p_login_id
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN json_build_object(
    'student_id',   v_student_id,
    'user_id',      p_user_id,
    'admission_no', trim(p_admission_no)
  );

EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION '%', SQLERRM;
END;
$$;

-- Grant to authenticated (the admin calling from the browser)
GRANT EXECUTE ON FUNCTION public.create_student_profile(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
