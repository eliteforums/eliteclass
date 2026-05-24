-- ============================================================
-- EduOS Migration 004 — Fix admit_student() RPC
-- ============================================================
--
-- PROBLEMS FIXED:
--
-- 1. gen_random_bytes() / crypt() / gen_salt() require the pgcrypto
--    extension which is not enabled by default in all Supabase projects.
--    Error: "function gen_random_bytes(integer) does not exist"
--
-- 2. p_batch_id is typed UUID so passing a text name like "JEE-2025-A"
--    throws "invalid input syntax for type uuid".
--    Fix: batch_id is now an optional UUID; the form must send NULL
--    (not a free-text string) when no real batch UUID is available.
--
-- SOLUTION:
--   Replace pgcrypto calls with built-in PostgreSQL functions:
--   • gen_random_uuid()          — built-in PG 13+, no extension needed
--   • encrypted_password = ''   — empty string; bcrypt comparison always
--                                  fails so the account cannot be used
--                                  with a password until the student runs
--                                  the "Forgot password" flow to set one.
--
-- This is safe because:
--   • The account is created and email-confirmed immediately.
--   • No one (not even the admin) knows a password for this account.
--   • The student MUST use "Forgot Password" to set their own password.
--   • This is the intended admission workflow.
--
-- ============================================================

-- Drop the old version that depends on pgcrypto
DROP FUNCTION IF EXISTS public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB);

-- ============================================================
-- Recreated admit_student() — no pgcrypto dependency
-- ============================================================
CREATE OR REPLACE FUNCTION public.admit_student(
  p_institute_id      UUID,
  p_name              TEXT,
  p_email             TEXT,
  p_phone             TEXT,
  p_admission_no      TEXT,
  p_batch_id          UUID,     -- Must be a real UUID or NULL — never free text
  p_aadhaar_last4     TEXT,     -- Only last 4 digits, nullable
  p_emergency_contact JSONB     -- { name, phone, relation }, nullable
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
BEGIN
  -- ── Security: verify caller is admin of the target institute ────────────
  SELECT institute_id, role
  INTO v_caller_institute, v_caller_role
  FROM public.users
  WHERE id = auth.uid();

  IF v_caller_role != 'admin' AND v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_FORBIDDEN: Only admins can admit students.';
  END IF;

  IF v_caller_role = 'admin' AND v_caller_institute != p_institute_id THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_FORBIDDEN: You can only admit students into your own institute.';
  END IF;

  -- ── Duplicate email check ────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_DUPLICATE_EMAIL: A user with this email already exists.';
  END IF;

  -- ── Duplicate admission number check ────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.students
    WHERE institute_id = p_institute_id
      AND lower(admission_no) = lower(trim(p_admission_no))
  ) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_DUPLICATE_ADMISSION_NO: This admission number is already in use.';
  END IF;

  -- ── Generate a new UUID for this user ────────────────────────────────────
  -- gen_random_uuid() is a PostgreSQL built-in (PG 13+) — no extension needed.
  v_student_user_id := gen_random_uuid();

  -- ── Insert into auth.users ───────────────────────────────────────────────
  --
  -- encrypted_password is set to '' (empty string).
  --
  -- Why this is safe and correct:
  --   Supabase's auth server uses bcrypt.CompareHashAndPassword to verify
  --   passwords. An empty string is not a valid bcrypt hash, so comparison
  --   always fails — no password can ever authenticate this account.
  --   The student MUST use the "Forgot Password" flow at /auth/login
  --   to receive a reset email and set their own password.
  --
  -- email_confirmed_at = NOW() pre-confirms the email so the student can
  -- immediately use the password-reset flow without a separate confirmation.
  --
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',   -- instance_id (always this value)
    v_student_user_id,
    'authenticated',
    'authenticated',
    lower(trim(p_email)),
    '',                                        -- empty = no password until reset
    NOW(),                                     -- email pre-confirmed
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object(
      'name',         p_name,
      'role',         'student',
      'institute_id', p_institute_id::text
    ),
    NOW(),
    NOW(),
    '', '', '', ''
  );

  -- ── Insert into public.users ─────────────────────────────────────────────
  INSERT INTO public.users (
    id,
    institute_id,
    role,
    name,
    email,
    phone,
    is_active
  ) VALUES (
    v_student_user_id,
    p_institute_id,
    'student',                        -- role is ALWAYS hardcoded, never user-supplied
    trim(p_name),
    lower(trim(p_email)),
    trim(p_phone),
    TRUE
  );

  -- ── Insert into public.students ──────────────────────────────────────────
  INSERT INTO public.students (
    institute_id,
    user_id,
    admission_no,
    batch_id,
    aadhaar_masked,
    emergency_contact,
    status
  ) VALUES (
    p_institute_id,
    v_student_user_id,
    trim(p_admission_no),
    p_batch_id,            -- NULL is fine; batch assignment can happen later
    p_aadhaar_last4,
    p_emergency_contact,
    'active'
  )
  RETURNING id INTO v_student_id;

  -- ── Log activity ─────────────────────────────────────────────────────────
  -- log_activity() swallows its own errors so a logging failure
  -- never rolls back the admission.
  BEGIN
    INSERT INTO public.activity_logs (
      institute_id, user_id, action, entity_type, entity_id, metadata
    ) VALUES (
      p_institute_id,
      auth.uid(),
      'student.admitted',
      'student',
      v_student_id,
      jsonb_build_object(
        'student_name',  p_name,
        'admission_no',  p_admission_no,
        'email',         lower(trim(p_email))
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── Return success ────────────────────────────────────────────────────────
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

-- Grant to authenticated users (the admin calling from the browser)
GRANT EXECUTE ON FUNCTION public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB)
  TO authenticated;
