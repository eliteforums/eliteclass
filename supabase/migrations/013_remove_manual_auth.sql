-- ============================================================================
-- Migration 013 — Refactor student admission to use Supabase Auth Admin API
-- ============================================================================
--
-- CHANGES:
--  1. Remove manual INSERT INTO auth.users for parents from create_student_profile.
--  2. The RPC now expects the parent_user_id to be provided if a new parent 
--     needs to be created.
--  3. All pgcrypto references and manual hashing are completely removed.
--
-- ============================================================================

SET LOCAL ROLE postgres;

-- ── Cleanup pgcrypto ────────────────────────────────────────────────────────
-- Completely remove pgcrypto dependency as per architecture requirements.
DROP EXTENSION IF EXISTS pgcrypto CASCADE;

-- Drop every known variant of admit_student
DROP FUNCTION IF EXISTS public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB);

-- Drop previous (broken) version of create_student_profile
DROP FUNCTION IF EXISTS public.create_student_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);

-- ── Refactored create_student_profile ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_student_profile(
  -- ── Required params ──────────────────────────────────────────────────────
  p_user_id              UUID,
  p_institute_id         UUID,
  p_login_id             TEXT,
  p_student_email        TEXT,
  p_name                 TEXT,
  p_phone                TEXT,
  p_admission_no         TEXT,
  -- ── Optional params ──────────────────────────────────────────────────────
  p_contact_email        TEXT     DEFAULT NULL,
  p_batch_id             UUID     DEFAULT NULL,
  p_aadhaar_last4        TEXT     DEFAULT NULL,
  p_emergency_contact    JSONB    DEFAULT NULL,
  p_parent_name          TEXT     DEFAULT NULL,
  p_parent_email         TEXT     DEFAULT NULL,
  p_parent_phone         TEXT     DEFAULT NULL,
  p_parent_occupation    TEXT     DEFAULT NULL,
  p_parent_relation_type TEXT     DEFAULT NULL,
  p_parent_user_id       UUID     DEFAULT NULL  -- NEW: passed from service
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
  v_parent_user_id   UUID := p_parent_user_id;
  v_parent_email     TEXT := NULLIF(lower(trim(COALESCE(p_parent_email, ''))), '');
  v_parent_phone     TEXT := NULLIF(trim(COALESCE(p_parent_phone, '')), '');
  v_parent_name      TEXT := NULLIF(trim(COALESCE(p_parent_name, '')), '');
  v_rel              relation_type;
BEGIN
  -- ── Security ──────────────────────────────────────────────────────────────
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

  -- ── Validation ─────────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.institutes
     WHERE id = p_institute_id AND COALESCE(is_active, TRUE)
  ) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_INVALID_INSTITUTE: Institute not found or inactive.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.students
     WHERE institute_id = p_institute_id
       AND lower(admission_no) = lower(trim(p_admission_no))
  ) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_DUPLICATE_ADMISSION_NO: This admission number is already in use.';
  END IF;

  IF p_batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.batches
     WHERE id = p_batch_id AND institute_id = p_institute_id
  ) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_INVALID_BATCH: The selected batch does not belong to this institute.';
  END IF;

  -- ── Upsert public.users (Student) ──────────────────────────────────────────
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

    -- If not found by email, try phone
    IF v_parent_id IS NULL AND v_parent_phone IS NOT NULL THEN
      SELECT p.id, p.user_id INTO v_parent_id, v_parent_user_id
        FROM public.parents p
        JOIN public.users   u ON u.id = p.user_id
       WHERE p.institute_id = p_institute_id
         AND trim(u.phone) = v_parent_phone
       LIMIT 1;
    END IF;

    -- If we still haven't found an existing parent in this institute, 
    -- we use the p_parent_user_id provided by the service to create a new one.
    -- We must re-ensure v_parent_user_id is not null if p_parent_user_id was passed.
    IF v_parent_id IS NULL AND v_parent_user_id IS NULL THEN
      v_parent_user_id := p_parent_user_id;
    END IF;

    -- Create new parent record if not found (v_parent_user_id comes from service)
    IF v_parent_id IS NULL THEN
      IF v_parent_user_id IS NULL THEN
        RAISE EXCEPTION 'ADMIT_STUDENT_PARENT_AUTH_REQUIRED: Parent auth account must be created by the service.';
      END IF;

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

  -- ── Activity log ──────────────────────────────────────────────────────────
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

-- Drop old pgcrypto admit_student if it still exists
DROP FUNCTION IF EXISTS public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);

-- Grant to authenticated
GRANT EXECUTE ON FUNCTION public.create_student_profile(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO authenticated;
