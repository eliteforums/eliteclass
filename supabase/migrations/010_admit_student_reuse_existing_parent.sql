-- ============================================================================
-- Migration 010 — Reuse existing parent on admission (one parent → many children)
--
-- Fixes ADMIT_STUDENT_PARENT_EMAIL_EXISTS incorrectly blocking second child
-- when the guardian email already has an auth account in this institute.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admit_student(
  p_institute_id       UUID,
  p_name               TEXT,
  p_email              TEXT,
  p_phone              TEXT,
  p_admission_no       TEXT,
  p_batch_id           UUID,
  p_aadhaar_last4      TEXT,
  p_emergency_contact  JSONB,
  p_parent_name        TEXT DEFAULT NULL,
  p_parent_email       TEXT DEFAULT NULL,
  p_parent_phone       TEXT DEFAULT NULL,
  p_parent_occupation  TEXT DEFAULT NULL,
  p_parent_relation_type TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_institute UUID;
  v_caller_role      user_role;
  v_student_user_id  UUID;
  v_student_id       UUID;
  v_parent_id        UUID;
  v_parent_user_id   UUID;
  v_student_email    TEXT := lower(trim(p_email));
  v_parent_email     TEXT := NULLIF(lower(trim(COALESCE(p_parent_email, ''))), '');
  v_parent_phone     TEXT := NULLIF(trim(COALESCE(p_parent_phone, '')), '');
  v_parent_name      TEXT := NULLIF(trim(COALESCE(p_parent_name, '')), '');
  v_rel              relation_type;
BEGIN
  SELECT institute_id, role
    INTO v_caller_institute, v_caller_role
    FROM public.users
   WHERE id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_FORBIDDEN: Caller has no user profile.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.institutes i
     WHERE i.id = p_institute_id AND COALESCE(i.is_active, TRUE)
  ) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_INVALID_INSTITUTE: The specified institute does not exist or is currently inactive.';
  END IF;

  IF v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_FORBIDDEN: Only admins can admit students.';
  END IF;

  IF v_caller_role = 'admin' AND v_caller_institute != p_institute_id THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_FORBIDDEN: You can only admit students into your own institute.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_student_email) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_DUPLICATE_EMAIL: A user with this email address already exists.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.students
     WHERE institute_id = p_institute_id
       AND lower(admission_no) = lower(trim(p_admission_no))
  ) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_DUPLICATE_ADMISSION_NO: This admission number is already in use.';
  END IF;

  IF p_batch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.batches b
       WHERE b.id = p_batch_id AND b.institute_id = p_institute_id
    ) THEN
      RAISE EXCEPTION 'ADMIT_STUDENT_INVALID_BATCH: The selected batch does not exist or does not belong to this institute.';
    END IF;
  END IF;

  v_student_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_student_user_id, 'authenticated', 'authenticated', v_student_email, '',
    NOW(), '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('name', trim(p_name), 'role', 'student', 'institute_id', p_institute_id::text),
    NOW(), NOW(), '', '', '', ''
  );

  INSERT INTO public.users (id, institute_id, role, name, email, phone, is_active)
  VALUES (
    v_student_user_id, p_institute_id, 'student', trim(p_name), v_student_email, trim(p_phone), TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    institute_id = EXCLUDED.institute_id,
    role           = EXCLUDED.role,
    name           = EXCLUDED.name,
    email          = EXCLUDED.email,
    phone          = EXCLUDED.phone,
    is_active      = EXCLUDED.is_active;

  INSERT INTO public.students (
    institute_id, user_id, admission_no, batch_id, aadhaar_masked, emergency_contact, status
  )
  VALUES (
    p_institute_id, v_student_user_id, trim(p_admission_no), p_batch_id,
    p_aadhaar_last4, p_emergency_contact, 'active'
  )
  RETURNING id INTO v_student_id;

  BEGIN
    INSERT INTO public.activity_logs (
      institute_id, user_id, action, entity_type, entity_id, metadata
    ) VALUES (
      p_institute_id, auth.uid(), 'student.admitted', 'student', v_student_id,
      jsonb_build_object('student_name', trim(p_name), 'admission_no', trim(p_admission_no), 'email', v_student_email)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF v_parent_name IS NOT NULL
     AND v_parent_email IS NOT NULL
     AND p_parent_relation_type IS NOT NULL
     AND btrim(p_parent_relation_type) <> ''
  THEN
    IF v_parent_email = v_student_email THEN
      RAISE EXCEPTION 'ADMIT_STUDENT_PARENT_SAME_AS_STUDENT: Parent email must differ from the student email.';
    END IF;

    BEGIN
      v_rel := p_parent_relation_type::relation_type;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'ADMIT_STUDENT_INVALID_PARENT_RELATION: Invalid relationship type.';
    END;

    v_parent_id := NULL;
    v_parent_user_id := NULL;

    SELECT p.id, u.id
      INTO v_parent_id, v_parent_user_id
      FROM public.parents p
      JOIN public.users u ON u.id = p.user_id
     WHERE p.institute_id = p_institute_id
       AND u.role = 'parent'
       AND (
         lower(trim(u.email)) = v_parent_email
         OR (
           v_parent_phone IS NOT NULL
           AND trim(coalesce(u.phone, '')) = v_parent_phone
         )
       )
     ORDER BY p.created_at ASC
     LIMIT 1;

    IF v_parent_id IS NULL THEN
      SELECT u.id
        INTO v_parent_user_id
        FROM public.users u
       WHERE u.institute_id = p_institute_id
         AND u.role = 'parent'
         AND (
           lower(trim(u.email)) = v_parent_email
           OR (
             v_parent_phone IS NOT NULL
             AND trim(coalesce(u.phone, '')) = v_parent_phone
           )
         )
       LIMIT 1;

      IF v_parent_user_id IS NOT NULL THEN
        INSERT INTO public.parents (institute_id, user_id, occupation)
        VALUES (
          p_institute_id,
          v_parent_user_id,
          NULLIF(trim(COALESCE(p_parent_occupation, '')), '')
        )
        ON CONFLICT (user_id) DO UPDATE SET
          occupation = COALESCE(
            NULLIF(trim(COALESCE(p_parent_occupation, '')), ''),
            public.parents.occupation
          )
        RETURNING id INTO v_parent_id;
      END IF;
    END IF;

    IF v_parent_id IS NULL THEN
      SELECT au.id
        INTO v_parent_user_id
        FROM auth.users au
       WHERE lower(trim(au.email)) = v_parent_email
       LIMIT 1;

      IF v_parent_user_id IS NOT NULL THEN
        SELECT p.id
          INTO v_parent_id
          FROM public.parents p
          JOIN public.users u ON u.id = p.user_id
         WHERE p.user_id = v_parent_user_id
           AND p.institute_id = p_institute_id
           AND u.role = 'parent'
         LIMIT 1;

        IF v_parent_id IS NULL THEN
          IF EXISTS (
            SELECT 1 FROM public.users u
             WHERE u.id = v_parent_user_id
               AND u.institute_id = p_institute_id
               AND u.role = 'parent'
          ) THEN
            INSERT INTO public.parents (institute_id, user_id, occupation)
            VALUES (
              p_institute_id,
              v_parent_user_id,
              NULLIF(trim(COALESCE(p_parent_occupation, '')), '')
            )
            ON CONFLICT (user_id) DO UPDATE SET
              occupation = COALESCE(
                NULLIF(trim(COALESCE(p_parent_occupation, '')), ''),
                public.parents.occupation
              )
            RETURNING id INTO v_parent_id;
          ELSIF EXISTS (
            SELECT 1 FROM public.users u
             WHERE u.id = v_parent_user_id
               AND u.institute_id <> p_institute_id
          ) THEN
            RAISE EXCEPTION 'ADMIT_STUDENT_PARENT_OTHER_INSTITUTE: This guardian email belongs to another institute. Use a different email or contact support.';
          ELSE
            RAISE EXCEPTION 'ADMIT_STUDENT_PARENT_EMAIL_IN_USE: This email is already used by a non-parent account. Use a different guardian email.';
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_parent_id IS NULL THEN
      v_parent_user_id := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_parent_user_id, 'authenticated', 'authenticated', v_parent_email, '',
        NOW(), '{"provider": "email", "providers": ["email"]}',
        jsonb_build_object(
          'name', v_parent_name, 'role', 'parent', 'institute_id', p_institute_id::text
        ),
        NOW(), NOW(), '', '', '', ''
      );

      INSERT INTO public.users (id, institute_id, role, name, email, phone, is_active)
      VALUES (
        v_parent_user_id, p_institute_id, 'parent', v_parent_name, v_parent_email, v_parent_phone, TRUE
      )
      ON CONFLICT (id) DO UPDATE SET
        institute_id = EXCLUDED.institute_id,
        role           = EXCLUDED.role,
        name           = EXCLUDED.name,
        email          = EXCLUDED.email,
        phone          = COALESCE(EXCLUDED.phone, public.users.phone),
        is_active      = EXCLUDED.is_active;

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

  RETURN json_build_object(
    'student_id',   v_student_id,
    'user_id',      v_student_user_id,
    'admission_no', trim(p_admission_no)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '%', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admit_student(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB,
  TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
