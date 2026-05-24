-- ============================================================
-- EduOS Migration 033 — Optional student admission fields
-- ============================================================

SET LOCAL ROLE postgres;

ALTER TABLE public.students
  ALTER COLUMN batch_id DROP NOT NULL,
  ALTER COLUMN contact_email DROP NOT NULL,
  ALTER COLUMN emergency_contact DROP NOT NULL;

DROP FUNCTION IF EXISTS public.create_student_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_student_profile(
  p_user_id              UUID,
  p_institute_id         UUID,
  p_login_id             TEXT,
  p_student_email        TEXT,
  p_name                 TEXT,
  p_phone                TEXT,
  p_admission_no         TEXT,
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
  v_rel              relation_type := 'guardian';
BEGIN
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

  IF v_parent_email IS NOT NULL THEN
    IF v_parent_name IS NULL THEN
      v_parent_name := COALESCE(split_part(v_parent_email, '@', 1), 'Parent');
    END IF;

    BEGIN
      IF NULLIF(trim(COALESCE(p_parent_relation_type, '')), '') IS NOT NULL THEN
        v_rel := p_parent_relation_type::relation_type;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_rel := 'guardian';
    END;

    IF v_parent_email = lower(trim(p_student_email)) THEN
      RAISE EXCEPTION 'ADMIT_STUDENT_PARENT_SAME_AS_STUDENT: Parent email cannot match student email.';
    END IF;

    SELECT p.id, p.user_id INTO v_parent_id, v_parent_user_id
      FROM public.parents p
      JOIN public.users   u ON u.id = p.user_id
     WHERE p.institute_id = p_institute_id
       AND lower(trim(u.email)) = v_parent_email
     LIMIT 1;

    IF v_parent_id IS NULL AND v_parent_phone IS NOT NULL THEN
      SELECT p.id, p.user_id INTO v_parent_id, v_parent_user_id
        FROM public.parents p
        JOIN public.users   u ON u.id = p.user_id
       WHERE p.institute_id = p_institute_id
         AND trim(u.phone) = v_parent_phone
       LIMIT 1;
    END IF;

    IF v_parent_id IS NULL THEN
      v_parent_user_id := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_parent_user_id, 'authenticated', 'authenticated',
        v_parent_email,
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
        v_parent_email,
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

    INSERT INTO public.student_parents (student_id, parent_id, relation_type)
    VALUES (v_student_id, v_parent_id, v_rel)
    ON CONFLICT (student_id, parent_id) DO NOTHING;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.create_student_profile(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;