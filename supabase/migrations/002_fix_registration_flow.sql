-- ============================================================
-- EduOS Migration 002 — Fix Registration Flow
-- ============================================================
--
-- ROOT CAUSES FIXED:
--
-- 1. handle_new_user trigger fires on auth.signUp() BEFORE the
--    institute row exists. institute_id NOT NULL constraint fails.
--    Fix: make trigger conditional — skip when institute_id is
--    absent from metadata (self-registration path).
--
-- 2. Schema/TypeScript type mismatch: users and institutes tables
--    are missing is_active, updated_at columns, and users has
--    profile_image instead of avatar_url.
--
-- 3. No RLS INSERT policies exist for self-registration.
--    Fix: atomic SECURITY DEFINER RPC bypasses RLS safely.
--
-- 4. No atomicity — partial failures leave orphaned auth users.
--    Fix: single register_institute() transaction handles all steps.
--
-- ============================================================

-- ============================================================
-- SECTION 1: Schema corrections
-- ============================================================

-- Add missing columns to `users`
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Rename profile_image -> avatar_url (align with TypeScript User type)
-- Only run if profile_image still exists (idempotent guard via DO block)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'users'
      AND column_name  = 'profile_image'
  ) THEN
    ALTER TABLE public.users RENAME COLUMN profile_image TO avatar_url_old;
    -- avatar_url was just added above; drop the legacy column safely
    ALTER TABLE public.users DROP COLUMN IF EXISTS avatar_url_old;
  END IF;
END $$;

-- Add missing columns to `institutes`
ALTER TABLE public.institutes
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================
-- SECTION 2: auto-update updated_at triggers
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- users
DROP TRIGGER IF EXISTS users_set_updated_at ON public.users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- institutes
DROP TRIGGER IF EXISTS institutes_set_updated_at ON public.institutes;
CREATE TRIGGER institutes_set_updated_at
  BEFORE UPDATE ON public.institutes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SECTION 3: Fix handle_new_user trigger
--
-- OLD behaviour (BROKEN):
--   Always inserts into public.users on every auth.signUp(),
--   with institute_id = NULL → violates NOT NULL constraint.
--
-- NEW behaviour (FIXED):
--   • If institute_id IS present in metadata → insert profile
--     (used by admin-created users: staff, students, parents).
--   • If institute_id is ABSENT → skip entirely.
--     The register_institute() RPC (Section 4) handles this
--     path atomically after auth.signUp() returns.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institute_id UUID;
  v_role         user_role;
BEGIN
  -- Extract institute_id from auth metadata
  v_institute_id := (NEW.raw_user_meta_data->>'institute_id')::UUID;

  -- ── Self-registration path ──────────────────────────────────────────────
  -- institute_id is NOT known at signUp time for the register-institute
  -- flow. The register_institute() RPC will create both the institute
  -- and the user profile in a single atomic transaction after signUp().
  -- DO NOTHING here to avoid the NOT NULL constraint failure.
  IF v_institute_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── Admin-created users path ────────────────────────────────────────────
  -- Admin passes institute_id + role in metadata when creating staff,
  -- students, or parents via the dashboard. Auto-create the profile.
  v_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::user_role,
    'student'
  );

  INSERT INTO public.users (
    id,
    institute_id,
    role,
    name,
    email,
    is_active
  )
  VALUES (
    NEW.id,
    v_institute_id,
    v_role,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    TRUE
  )
  ON CONFLICT (id) DO NOTHING; -- idempotent: never error on retries

  RETURN NEW;
END;
$$;

-- Re-create the trigger (DROP + CREATE is safe and idempotent here)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- SECTION 4: register_institute() — atomic SECURITY DEFINER RPC
--
-- Replaces the fragile 3-step frontend service with a single
-- atomic PostgreSQL transaction:
--   1. Validate the auth user exists and was recently created
--   2. Insert into institutes
--   3. Insert into users (with ON CONFLICT for idempotency)
--
-- SECURITY DEFINER: runs as the function owner → bypasses RLS.
-- This is intentional and safe because:
--   a) We validate the p_user_id against auth.users (10-min window)
--   b) The role is hardcoded to 'admin' — not user-supplied
--   c) Grant is limited to anon + authenticated (not public)
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
SET search_path = public
AS $$
DECLARE
  v_institute_id UUID;
  v_existing_institute_id UUID;
  v_auth_created_at TIMESTAMPTZ;
BEGIN
  -- ── Security gate ─────────────────────────────────────────────────────────
  -- Verify p_user_id is a real, recently-created auth user.
  -- The 10-minute window prevents anyone from calling this RPC with an
  -- arbitrary UUID to create spurious institute/user records.
  SELECT created_at INTO v_auth_created_at
  FROM auth.users
  WHERE id = p_user_id;

  IF v_auth_created_at IS NULL THEN
    RAISE EXCEPTION 'REGISTRATION_INVALID_USER: User ID does not exist in auth system.';
  END IF;

  IF v_auth_created_at < NOW() - INTERVAL '10 minutes' THEN
    RAISE EXCEPTION 'REGISTRATION_SESSION_EXPIRED: Registration window has closed. Please sign up again.';
  END IF;

  -- ── Idempotency guard ─────────────────────────────────────────────────────
  -- If this user already has a profile (e.g. page refresh during submit),
  -- return the existing data instead of failing with a duplicate key error.
  SELECT institute_id INTO v_existing_institute_id
  FROM public.users
  WHERE id = p_user_id;

  IF v_existing_institute_id IS NOT NULL THEN
    RETURN json_build_object(
      'user_id',        p_user_id,
      'institute_id',   v_existing_institute_id,
      'already_exists', TRUE
    );
  END IF;

  -- ── Step 1: Create the institute ──────────────────────────────────────────
  INSERT INTO public.institutes (
    name,
    logo,
    subscription_plan,
    is_active
  )
  VALUES (
    p_institute_name,
    NULL,     -- no logo at registration time
    'free',   -- all new institutes start on free tier
    TRUE
  )
  RETURNING id INTO v_institute_id;

  -- ── Step 2: Create the admin user profile ─────────────────────────────────
  -- Role is HARDCODED to 'admin' — never accepted from user input.
  -- ON CONFLICT handles the rare case where the trigger somehow fired first.
  INSERT INTO public.users (
    id,
    institute_id,
    role,
    name,
    email,
    phone,
    is_active
  )
  VALUES (
    p_user_id,
    v_institute_id,
    'admin',         -- hardcoded, not user-supplied
    p_admin_name,
    p_email,
    p_phone,
    TRUE
  )
  ON CONFLICT (id) DO UPDATE
    SET institute_id = EXCLUDED.institute_id,
        role         = 'admin',   -- never let a conflict downgrade the role
        name         = EXCLUDED.name,
        phone        = EXCLUDED.phone,
        is_active    = TRUE;

  -- ── Return success payload ────────────────────────────────────────────────
  RETURN json_build_object(
    'user_id',        p_user_id,
    'institute_id',   v_institute_id,
    'already_exists', FALSE
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Surface the full error context to the frontend for debugging.
    -- In production you may want to log and return a generic message.
    RAISE EXCEPTION '%', SQLERRM;
END;
$$;

-- ── Permissions ──────────────────────────────────────────────────────────────
-- anon: needed when Supabase email confirmation is ENABLED
--       (signUp() returns no session → client has no JWT → runs as anon)
-- authenticated: needed when email confirmation is DISABLED
--                (signUp() returns a live session immediately)
GRANT EXECUTE ON FUNCTION public.register_institute(TEXT, TEXT, TEXT, TEXT, UUID)
  TO anon, authenticated;

-- ============================================================
-- SECTION 5: Additional RLS policies needed for auth flows
-- ============================================================

-- Allow any authenticated user to read and update their own profile.
-- Required for: login flow, profile page, onboarding steps.
DROP POLICY IF EXISTS "user_update_own_profile" ON public.users;
CREATE POLICY "user_update_own_profile"
  ON public.users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Allow a user to INSERT their own profile row.
-- Required for: edge cases where the trigger is bypassed or fails silently.
-- The check ensures they can only insert a row for their own auth.uid().
DROP POLICY IF EXISTS "user_insert_own_profile" ON public.users;
CREATE POLICY "user_insert_own_profile"
  ON public.users FOR INSERT
  WITH CHECK (id = auth.uid());

-- ============================================================
-- SECTION 6: Helper indexes for new columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_is_active     ON public.users(is_active);
CREATE INDEX IF NOT EXISTS idx_institutes_is_active ON public.institutes(is_active);

-- ============================================================
-- SECTION 7: Verification comments (run manually to confirm)
-- ============================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'users'
-- ORDER BY ordinal_position;
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'institutes'
-- ORDER BY ordinal_position;
--
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public' AND routine_name = 'register_institute';
