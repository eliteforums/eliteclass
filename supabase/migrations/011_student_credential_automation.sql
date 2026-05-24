-- ============================================================================
-- Migration 011 — Student credential automation on admission
--
-- • institute_code on institutes (for login ID prefix)
-- • login_id, generated_email, contact_email on students
-- • Auto-generates virtual email + bcrypt password at admission
-- • Returns temporary_password once in RPC JSON (never stored)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Institute code ───────────────────────────────────────────────────────────

ALTER TABLE public.institutes
  ADD COLUMN IF NOT EXISTS institute_code VARCHAR(10);

UPDATE public.institutes
   SET institute_code = LPAD(
     ((ABS(hashtext(id::text)) % 900) + 100)::text,
     3,
     '0'
   )
 WHERE institute_code IS NULL OR btrim(institute_code) = '';

ALTER TABLE public.institutes
  ALTER COLUMN institute_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_institutes_institute_code
  ON public.institutes (institute_code);

-- ── Student credential columns ───────────────────────────────────────────────

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS login_id TEXT,
  ADD COLUMN IF NOT EXISTS generated_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_login_id
  ON public.students (login_id)
  WHERE login_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_generated_email
  ON public.students (generated_email)
  WHERE generated_email IS NOT NULL;

-- ── Helpers ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sanitize_name_for_login(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(
    regexp_replace(lower(trim(coalesce(p_name, ''))), '[^a-z0-9]', '', 'g'),
    24
  );
$$;

CREATE OR REPLACE FUNCTION public.generate_student_temp_password()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_upper   CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_lower   CONSTANT TEXT := 'abcdefghjkmnpqrstuvwxyz';
  v_digits  CONSTANT TEXT := '23456789';
  v_special CONSTANT TEXT := '@#$!&*';
  v_pwd     TEXT;
  i         INT;
BEGIN
  v_pwd :=
    substr(v_upper,   1 + floor(random() * length(v_upper))::int,   1) ||
    substr(v_lower,   1 + floor(random() * length(v_lower))::int,   1) ||
    substr(v_digits,  1 + floor(random() * length(v_digits))::int,  1) ||
    substr(v_special, 1 + floor(random() * length(v_special))::int, 1);

  FOR i IN 1..4 LOOP
    v_pwd := v_pwd || substr(
      v_lower || v_digits,
      1 + floor(random() * length(v_lower || v_digits))::int,
      1
    );
  END LOOP;

  RETURN v_pwd;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_student_login_id(
  p_institute_id UUID,
  p_name         TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code      TEXT;
  v_slug      TEXT;
  v_candidate TEXT;
  v_suffix    INT;
  v_attempt   INT := 0;
BEGIN
  SELECT i.institute_code
    INTO v_code
    FROM public.institutes i
   WHERE i.id = p_institute_id;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_INVALID_INSTITUTE: Institute not found.';
  END IF;

  v_slug := public.sanitize_name_for_login(p_name);
  IF v_slug IS NULL OR v_slug = '' THEN
    v_slug := 'student';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_suffix := floor(random() * 10000)::int;
    v_candidate := lower(regexp_replace(v_code, '[^a-z0-9]', '', 'g'))
                || v_slug
                || lpad(v_suffix::text, 4, '0');

    EXIT WHEN NOT EXISTS (
      SELECT 1
        FROM public.students s
       WHERE s.login_id = v_candidate
    ) AND NOT EXISTS (
      SELECT 1
        FROM auth.users au
       WHERE lower(trim(au.email)) = v_candidate || '@eduos.student'
    );

    IF v_attempt >= 50 THEN
      RAISE EXCEPTION 'ADMIT_STUDENT_LOGIN_ID_FAILED: Could not generate a unique student login ID.';
    END IF;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- ── admit_student (extends 010 with credential automation) ───────────────────

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
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_institute   UUID;
  v_caller_role        user_role;
  v_student_user_id    UUID;
  v_student_id         UUID;
  v_parent_id          UUID;
  v_parent_user_id     UUID;
  v_contact_email      TEXT;
  v_login_id           TEXT;
  v_student_email      TEXT;
  v_temp_password      TEXT;
  v_password_hash      TEXT;
  v_parent_email       TEXT := NULLIF(lower(trim(COALESCE(p_parent_email, ''))), '');
  v_parent_phone       TEXT := NULLIF(trim(COALESCE(p_parent_phone, '')), '');
  v_parent_name        TEXT := NULLIF(trim(COALESCE(p_parent_name, '')), '');
  v_rel                relation_type;
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

  v_contact_email := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  IF v_contact_email LIKE '%@eduos.student' THEN
    v_contact_email := NULL;
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

  v_login_id      := public.generate_student_login_id(p_institute_id, trim(p_name));
  v_student_email := v_login_id || '@eduos.student';
  v_temp_password := public.generate_student_temp_password();
  v_password_hash := crypt(v_temp_password, gen_salt('bf'));
  v_student_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_student_user_id, 'authenticated', 'authenticated',
    v_student_email, v_password_hash, NOW(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object(
      'name', trim(p_name), 'role', 'student',
      'institute_id', p_institute_id::text, 'login_id', v_login_id
    ),
    NOW(), NOW(), '', '', '', ''
  );

  INSERT INTO public.users (id, institute_id, role, name, email, phone, is_active)
  VALUES (
    v_student_user_id, p_institute_id, 'student', trim(p_name),
    v_student_email, trim(p_phone), TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    institute_id = EXCLUDED.institute_id,
    role           = EXCLUDED.role,
    name           = EXCLUDED.name,
    email          = EXCLUDED.email,
    phone          = EXCLUDED.phone,
    is_active      = EXCLUDED.is_active;

  INSERT INTO public.students (
    institute_id, user_id, admission_no, batch_id, aadhaar_masked,
    emergency_contact, status, login_id, generated_email, contact_email
  )
  VALUES (
    p_institute_id, v_student_user_id, trim(p_admission_no), p_batch_id,
    p_aadhaar_last4, p_emergency_contact, 'active',
    v_login_id, v_student_email, v_contact_email
  )
  RETURNING id INTO v_student_id;

  BEGIN
    INSERT INTO public.activity_logs (
      institute_id, user_id, action, entity_type, entity_id, metadata
    ) VALUES (
      p_institute_id, auth.uid(), 'student.admitted', 'student', v_student_id,
      jsonb_build_object(
        'student_name', trim(p_name),
        'admission_no', trim(p_admission_no),
        'login_id', v_login_id,
        'generated_email', v_student_email
      )
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
      RAISE EXCEPTION 'ADMIT_STUDENT_PARENT_SAME_AS_STUDENT: Parent email must differ from the student login email.';
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
      SELECT u.id INTO v_parent_user_id
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
          p_institute_id, v_parent_user_id,
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
      SELECT au.id INTO v_parent_user_id
        FROM auth.users au
       WHERE lower(trim(au.email)) = v_parent_email
       LIMIT 1;

      IF v_parent_user_id IS NOT NULL THEN
        SELECT p.id INTO v_parent_id
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
              p_institute_id, v_parent_user_id,
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
            RAISE EXCEPTION 'ADMIT_STUDENT_PARENT_OTHER_INSTITUTE: This guardian email belongs to another institute.';
          ELSE
            RAISE EXCEPTION 'ADMIT_STUDENT_PARENT_EMAIL_IN_USE: This email is already used by a non-parent account.';
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
        p_institute_id, v_parent_user_id,
        NULLIF(trim(COALESCE(p_parent_occupation, '')), '')
      )
      RETURNING id INTO v_parent_id;
    END IF;

    INSERT INTO public.student_parents (student_id, parent_id, relation_type)
    VALUES (v_student_id, v_parent_id, v_rel)
    ON CONFLICT (student_id, parent_id) DO NOTHING;
  END IF;

  RETURN json_build_object(
    'student_id',          v_student_id,
    'user_id',             v_student_user_id,
    'admission_no',        trim(p_admission_no),
    'login_id',            v_login_id,
    'generated_email',     v_student_email,
    'temporary_password',  v_temp_password
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '%', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_student_login_id(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_student_temp_password() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admit_student(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB,
  TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- ── New institutes get a unique institute_code at registration ───────────────

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
  v_auth_created_at TIMESTAMPTZ;
  v_attempt INT := 0;
BEGIN
  SELECT created_at INTO v_auth_created_at
  FROM auth.users
  WHERE id = p_user_id;

  IF v_auth_created_at IS NULL THEN
    RAISE EXCEPTION 'REGISTRATION_INVALID_USER: User ID does not exist in auth system.';
  END IF;

  IF v_auth_created_at < NOW() - INTERVAL '10 minutes' THEN
    RAISE EXCEPTION 'REGISTRATION_SESSION_EXPIRED: Registration window has closed. Please sign up again.';
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
