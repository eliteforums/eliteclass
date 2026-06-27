-- =============================================================================
-- EduOS — Complete Database Setup
--
-- Run this file against a fresh Supabase project to set up the full schema.
-- It contains all tables, functions, triggers, RLS policies, and storage buckets.
--
-- Usage:
--   1. Create a new Supabase project
--   2. Go to SQL Editor
--   3. Paste and run this entire file
--   4. Configure your .env with the project URL and keys
--
-- This file is the consolidated result of 56 incremental migrations.
-- =============================================================================

-- ============================================================
-- EduOS — Initial Database Schema
-- Multi-tenant SaaS — all tables scoped by institute_id
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'staff', 'student', 'parent');
CREATE TYPE subscription_plan AS ENUM ('free', 'basic', 'pro', 'enterprise');
CREATE TYPE student_status AS ENUM ('active', 'inactive', 'graduated');
CREATE TYPE relation_type AS ENUM ('father', 'mother', 'guardian');

-- ============================================================
-- TABLE: institutes
-- Root tenant entity
-- ============================================================

CREATE TABLE institutes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  logo              TEXT,
  subscription_plan subscription_plan NOT NULL DEFAULT 'free',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: users
-- Central profile — id matches Supabase auth.users.id
-- ============================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY,  -- synced from auth.users.id
  institute_id  UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  role          user_role NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  profile_image TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_institute_id ON users(institute_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- TABLE: students
-- ============================================================

CREATE TABLE students (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institute_id   UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  admission_no   TEXT NOT NULL,
  batch_id       UUID,
  aadhaar_masked TEXT,
  status         student_status NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(institute_id, admission_no)
);

CREATE INDEX idx_students_institute_id ON students(institute_id);
CREATE INDEX idx_students_user_id ON students(user_id);
CREATE INDEX idx_students_status ON students(status);

-- ============================================================
-- TABLE: parents
-- ============================================================

CREATE TABLE parents (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parents_institute_id ON parents(institute_id);

-- ============================================================
-- TABLE: student_parents (Junction)
-- Supports: one parent → many children
--           many guardians → one student
-- ============================================================

CREATE TABLE student_parents (
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id     UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  relation_type relation_type NOT NULL,

  PRIMARY KEY (student_id, parent_id)
);

CREATE INDEX idx_student_parents_parent_id ON student_parents(parent_id);
CREATE INDEX idx_student_parents_student_id ON student_parents(student_id);

-- ============================================================
-- TABLE: staff
-- ============================================================

CREATE TABLE staff (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  designation  TEXT,
  department   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staff_institute_id ON staff(institute_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Enforce data isolation at the database level
-- ============================================================

ALTER TABLE institutes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE students        ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff           ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's institute_id
CREATE OR REPLACE FUNCTION get_my_institute_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT institute_id
  FROM public.users
  WHERE id = auth.uid()
$$;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT role
  FROM public.users
  WHERE id = auth.uid()
$$;

-- Helper function: is current user a super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'super_admin'
  )
$$;

-- ── INSTITUTES policies ──────────────────────────────────────

-- super_admin: see all institutes
CREATE POLICY "super_admin_all_institutes"
  ON institutes FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- admin/staff/student/parent: only their own institute
CREATE POLICY "users_own_institute"
  ON institutes FOR SELECT
  USING (id = get_my_institute_id());

-- ── USERS policies ───────────────────────────────────────────

-- super_admin: see all users
CREATE POLICY "super_admin_all_users"
  ON users FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- admin: see users in their institute
CREATE POLICY "admin_institute_users"
  ON users FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  );

-- staff: read users in their institute
CREATE POLICY "staff_read_institute_users"
  ON users FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
  );

-- student/parent: read own profile only
CREATE POLICY "user_read_own_profile"
  ON users FOR SELECT
  USING (id = auth.uid());

-- ── STUDENTS policies ────────────────────────────────────────

-- super_admin
CREATE POLICY "super_admin_all_students"
  ON students FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- admin: full access within institute
CREATE POLICY "admin_institute_students"
  ON students FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  );

-- staff: read only within institute
CREATE POLICY "staff_read_institute_students"
  ON students FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
  );

-- student: read own record only
CREATE POLICY "student_read_own"
  ON students FOR SELECT
  USING (user_id = auth.uid());

-- parent: read linked children only
CREATE POLICY "parent_read_linked_students"
  ON students FOR SELECT
  USING (
    get_my_role() = 'parent'
    AND id IN (
      SELECT sp.student_id
      FROM student_parents sp
      JOIN parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── PARENTS policies ─────────────────────────────────────────

-- super_admin
CREATE POLICY "super_admin_all_parents"
  ON parents FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- admin: full access within institute
CREATE POLICY "admin_institute_parents"
  ON parents FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  );

-- staff: read only
CREATE POLICY "staff_read_parents"
  ON parents FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
  );

-- parent: read own record
CREATE POLICY "parent_read_own"
  ON parents FOR SELECT
  USING (user_id = auth.uid());

-- ── STUDENT_PARENTS policies ─────────────────────────────────

-- super_admin
CREATE POLICY "super_admin_all_student_parents"
  ON student_parents FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- admin: manage within institute
CREATE POLICY "admin_manage_student_parents"
  ON student_parents FOR ALL
  USING (
    get_my_role() = 'admin'
    AND student_id IN (
      SELECT id FROM students WHERE institute_id = get_my_institute_id()
    )
  )
  WITH CHECK (
    get_my_role() = 'admin'
    AND student_id IN (
      SELECT id FROM students WHERE institute_id = get_my_institute_id()
    )
  );

-- parent: read their own relationships
CREATE POLICY "parent_read_own_relationships"
  ON student_parents FOR SELECT
  USING (
    parent_id IN (
      SELECT id FROM parents WHERE user_id = auth.uid()
    )
  );

-- student: read their own parent links
CREATE POLICY "student_read_own_parents"
  ON student_parents FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- ── STAFF policies ───────────────────────────────────────────

-- super_admin
CREATE POLICY "super_admin_all_staff"
  ON staff FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- admin: full access within institute
CREATE POLICY "admin_institute_staff"
  ON staff FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  );

-- staff: read own record
CREATE POLICY "staff_read_own"
  ON staff FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- TRIGGER: auto-create user profile on Supabase auth signup
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, institute_id, role, name, email)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'institute_id')::UUID, NULL),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'student'),
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
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
-- ============================================================
-- EduOS Migration 003 — Operational Foundation
-- ============================================================
--
-- WHAT THIS MIGRATION DOES:
--
-- 1. Extensions      — pgcrypto (for gen_random_bytes / crypt in admit_student)
-- 2. Enum additions  — student_status += 'suspended'
--                      relation_type  += 'sibling', 'other'
-- 3. Column gaps     — students.updated_at, students.emergency_contact
--                      parents.occupation, parents.updated_at
--                      staff.updated_at
-- 4. Triggers        — updated_at auto-maintenance for students, parents, staff
-- 5. batches         — new table: institute batch / academic-year grouping
-- 6. student_history — immutable audit log of student record changes
-- 7. activity_logs   — platform-wide audit trail
-- 8. RLS             — row-level security for all three new tables
-- 9. admit_student() — atomic SECURITY DEFINER RPC: create auth user +
--                      public.users + public.students in one transaction
-- 10. log_activity() — lightweight SECURITY DEFINER helper for frontend
-- 11. Indexes        — performance indexes on new/updated columns
--
-- IDEMPOTENCY:
--   Every DDL statement uses IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS
--   so this file is safe to re-run without errors.
--
-- DEPENDENCIES:
--   • Migration 001: enums, base tables, helper functions
--                    (get_my_institute_id, get_my_role, is_super_admin)
--   • Migration 002: update_updated_at_column() trigger function,
--                    users.is_active, users.updated_at, users.avatar_url,
--                    institutes.is_active, institutes.updated_at
-- ============================================================

-- ============================================================
-- SECTION 1: Extensions
-- ============================================================

-- pgcrypto: supplies crypt() + gen_salt() for bcrypt password hashing
-- and gen_random_bytes() for secure temp-password generation inside
-- admit_student(). uuid-ossp is already enabled from migration 001.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- SECTION 2: Enum additions
-- ============================================================
-- ADD VALUE IF NOT EXISTS is idempotent and safe on re-runs.
-- Note: PostgreSQL does not allow removing enum values; additions only.

-- student_status: 'suspended' covers disciplinary holds that are
-- distinct from voluntary 'inactive' or terminal 'graduated'.
ALTER TYPE student_status ADD VALUE IF NOT EXISTS 'suspended';

-- relation_type: cover same-generation family links and catch-all
-- for non-standard guardianship arrangements.
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'sibling';
ALTER TYPE relation_type ADD VALUE IF NOT EXISTS 'other';

-- ============================================================
-- SECTION 3: Schema column additions
-- ============================================================

-- ── students ─────────────────────────────────────────────────────────────────
-- updated_at: mirrors the pattern applied to users/institutes in migration 002.
-- emergency_contact: freeform JSONB because the shape can vary
--   expected keys: { name: string, phone: string, relation: string }
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS emergency_contact JSONB;  -- { name, phone, relation }

-- ── parents ──────────────────────────────────────────────────────────────────
-- occupation: requested by TypeScript ParentProfile type; nullable TEXT.
-- updated_at: same audit-trail pattern.
ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ── staff ────────────────────────────────────────────────────────────────────
-- updated_at: same audit-trail pattern.
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================
-- SECTION 4: updated_at triggers for new columns
-- ============================================================
-- All three leverage the update_updated_at_column() function
-- created in migration 002 — no need to recreate it here.

-- students
DROP TRIGGER IF EXISTS students_set_updated_at ON public.students;
CREATE TRIGGER students_set_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- parents
DROP TRIGGER IF EXISTS parents_set_updated_at ON public.parents;
CREATE TRIGGER parents_set_updated_at
  BEFORE UPDATE ON public.parents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- staff
DROP TRIGGER IF EXISTS staff_set_updated_at ON public.staff;
CREATE TRIGGER staff_set_updated_at
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SECTION 5: batches table
-- ============================================================
-- A batch groups students by academic year within an institute.
-- Examples: "Class 10-A / 2024-25", "Batch B / 2023-24".
--
-- Design decisions:
--   • UNIQUE(institute_id, name, academic_year): prevents duplicate
--     batch entries within the same year for the same institute.
--   • is_active: allows archiving old batches without deleting records.
--   • students.batch_id FK is left in the students table (migration 001);
--     this table is the referent for that FK.

CREATE TABLE IF NOT EXISTS public.batches (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  institute_id  UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  academic_year TEXT        NOT NULL,   -- e.g. '2024-25'
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(institute_id, name, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_batches_institute_id ON public.batches(institute_id);
CREATE INDEX IF NOT EXISTS idx_batches_is_active    ON public.batches(is_active);

DROP TRIGGER IF EXISTS batches_set_updated_at ON public.batches;
CREATE TRIGGER batches_set_updated_at
  BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SECTION 6: student_history table
-- ============================================================
-- Immutable, append-only audit log of every significant change
-- made to a student's record.
--
-- action examples:  'status_changed', 'batch_updated', 'remark_added',
--                   'emergency_contact_updated', 'admission_no_corrected'
-- old_value / new_value: JSONB snapshots of whatever changed.
-- remark: free-text note left by the admin / staff member.
--
-- Rows are NEVER updated or deleted (hence no updated_at column).
-- ON DELETE CASCADE keeps referential integrity if a student is removed.

CREATE TABLE IF NOT EXISTS public.student_history (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id   UUID        NOT NULL REFERENCES public.students(id)  ON DELETE CASCADE,
  institute_id UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  changed_by   UUID        NOT NULL REFERENCES public.users(id),
  action       TEXT        NOT NULL,  -- 'status_changed' | 'batch_updated' | ...
  old_value    JSONB,                 -- previous state snapshot (nullable)
  new_value    JSONB,                 -- new state snapshot (nullable)
  remark       TEXT,                  -- optional free-text admin note
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_history_student_id   ON public.student_history(student_id);
CREATE INDEX IF NOT EXISTS idx_student_history_institute_id ON public.student_history(institute_id);
-- DESC ordering for "most-recent first" queries used in the dashboard timeline
CREATE INDEX IF NOT EXISTS idx_student_history_created_at   ON public.student_history(created_at DESC);

-- ============================================================
-- SECTION 7: activity_logs table
-- ============================================================
-- Platform-wide audit trail — one row per user action.
-- Written by SECURITY DEFINER functions (admit_student, log_activity)
-- so that RLS cannot be bypassed by clever frontend calls.
--
-- action naming convention:  '<entity>.<verb>'
--   e.g. 'student.admitted', 'parent.linked', 'user.login',
--        'batch.created', 'staff.deactivated'
-- institute_id / user_id are nullable to support system-level events
-- (e.g. cron jobs, super-admin actions that span institutes).
-- metadata: arbitrary JSONB context — IP, browser, old/new values, etc.

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  institute_id UUID        REFERENCES public.institutes(id) ON DELETE CASCADE,
  user_id      UUID        REFERENCES public.users(id)      ON DELETE SET NULL,
  action       TEXT        NOT NULL,   -- 'student.admitted' | 'user.login' | ...
  entity_type  TEXT,                   -- 'student' | 'parent' | 'staff' | ...
  entity_id    UUID,                   -- PK of the affected row
  metadata     JSONB,                  -- arbitrary context (IP, diff, etc.)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_institute_id ON public.activity_logs(institute_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id      ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action       ON public.activity_logs(action);
-- DESC ordering for "most-recent first" dashboard / audit views
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at   ON public.activity_logs(created_at DESC);

-- ============================================================
-- SECTION 8: Row Level Security for new tables
-- ============================================================

ALTER TABLE public.batches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs   ENABLE ROW LEVEL SECURITY;

-- ── batches ──────────────────────────────────────────────────────────────────

-- Super-admin: unrestricted access across all institutes
CREATE POLICY "super_admin_all_batches"
  ON public.batches FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

-- Admin: full CRUD within their own institute
CREATE POLICY "admin_manage_batches"
  ON public.batches FOR ALL
  USING     (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK(institute_id = get_my_institute_id() AND get_my_role() = 'admin');

-- Staff: read-only within their own institute (e.g. for attendance screens)
CREATE POLICY "staff_read_batches"
  ON public.batches FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

-- Student: read their own batch only (for profile / dashboard display)
CREATE POLICY "student_read_own_batch"
  ON public.batches FOR SELECT
  USING (
    get_my_role() = 'student'
    AND id IN (
      SELECT batch_id
      FROM public.students
      WHERE user_id = auth.uid()
        AND batch_id IS NOT NULL
    )
  );

-- ── student_history ───────────────────────────────────────────────────────────

-- Super-admin: unrestricted access
CREATE POLICY "super_admin_all_student_history"
  ON public.student_history FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

-- Admin: full CRUD on history rows within their institute
CREATE POLICY "admin_institute_student_history"
  ON public.student_history FOR ALL
  USING     (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK(institute_id = get_my_institute_id() AND get_my_role() = 'admin');

-- Staff: read-only on history within their institute
CREATE POLICY "staff_read_student_history"
  ON public.student_history FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

-- Student: read their own history (e.g. status change notifications)
CREATE POLICY "student_read_own_history"
  ON public.student_history FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );

-- ── activity_logs ─────────────────────────────────────────────────────────────
-- Writes are intentionally locked down: only SECURITY DEFINER functions
-- (admit_student, log_activity) can insert rows. This prevents frontend
-- code from forging audit entries.

-- Super-admin: unrestricted access
CREATE POLICY "super_admin_all_activity_logs"
  ON public.activity_logs FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

-- Admin: read-only view of their own institute's logs
-- (Writes come exclusively from SECURITY DEFINER functions)
CREATE POLICY "admin_read_institute_logs"
  ON public.activity_logs FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

-- ============================================================
-- SECTION 9: admit_student() — atomic student admission RPC
-- ============================================================
--
-- PURPOSE:
--   Atomically create an auth.users entry + public.users profile +
--   public.students record in a single transaction. Uses SECURITY
--   DEFINER so it can write to auth.users without the service_role key.
--
-- SECURITY MODEL:
--   • Verifies caller is admin of the target institute (or super_admin).
--   • Hardcodes role = 'student' — never accepts it from parameters.
--   • Duplicate email and admission-number guards prevent conflicts.
--   • Student account is pre-confirmed; the student uses
--     "Forgot Password" to set their own password on first login.
--
-- PARAMETERS:
--   p_institute_id       — target institute UUID
--   p_name               — full student name
--   p_email              — student login email (must be unique in auth)
--   p_phone              — contact number (stored on public.users)
--   p_admission_no       — institute-scoped admission number
--   p_batch_id           — batch UUID (nullable — can be assigned later)
--   p_aadhaar_last4      — last 4 digits only (nullable, stored as-is)
--   p_emergency_contact  — JSONB { name, phone, relation } (nullable)
--
-- RETURNS:
--   JSON { student_id, user_id, admission_no }

CREATE OR REPLACE FUNCTION public.admit_student(
  p_institute_id      UUID,
  p_name              TEXT,
  p_email             TEXT,
  p_phone             TEXT,
  p_admission_no      TEXT,
  p_batch_id          UUID,
  p_aadhaar_last4     TEXT,   -- last 4 digits only; nullable
  p_emergency_contact JSONB   -- { name, phone, relation }; nullable
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_institute UUID;
  v_caller_role      user_role;
  v_student_user_id  UUID;
  v_student_id       UUID;
  v_temp_password    TEXT;
BEGIN

  -- ── Security: caller must be admin of the target institute (or super_admin) ─
  SELECT institute_id, role
    INTO v_caller_institute, v_caller_role
    FROM public.users
   WHERE id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_FORBIDDEN: Caller has no user profile.';
  END IF;

  IF v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_FORBIDDEN: Only admins can admit students.';
  END IF;

  -- A plain admin can only admit students into their own institute
  IF v_caller_role = 'admin' AND v_caller_institute != p_institute_id THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_FORBIDDEN: Institute mismatch.';
  END IF;

  -- ── Duplicate email guard ──────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_DUPLICATE_EMAIL: A user with this email already exists.';
  END IF;

  -- ── Duplicate admission number guard (scoped to institute) ─────────────────
  IF EXISTS (
    SELECT 1 FROM public.students
     WHERE institute_id = p_institute_id
       AND admission_no = p_admission_no
  ) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_DUPLICATE_ADMISSION_NO: Admission number already exists in this institute.';
  END IF;

  -- ── Generate a temporary password ─────────────────────────────────────────
  -- The account is pre-confirmed; the student uses "Forgot Password"
  -- to choose their own password before their first real login.
  v_temp_password   := encode(gen_random_bytes(12), 'hex');   -- 24-char hex string
  v_student_user_id := gen_random_uuid();

  -- ── Step 1: Insert into auth.users ────────────────────────────────────────
  -- We bypass the Supabase dashboard / service_role key requirement by
  -- writing directly to auth.users inside this SECURITY DEFINER function.
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,    -- pre-confirmed: student resets via forgot-password
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_student_user_id,
    'authenticated',
    'authenticated',
    p_email,
    crypt(v_temp_password, gen_salt('bf')),  -- bcrypt hash via pgcrypto
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object(
      'name',         p_name,
      'role',         'student',             -- baked into metadata for trigger
      'institute_id', p_institute_id::text   -- trigger uses this if it fires
    ),
    NOW(),
    NOW(),
    '', '', '', ''
  );

  -- ── Step 2: Insert into public.users ──────────────────────────────────────
  -- The handle_new_user trigger may also fire here; ON CONFLICT guards
  -- against duplicate inserts so the transaction stays clean either way.
  INSERT INTO public.users (id, institute_id, role, name, email, phone, is_active)
  VALUES (v_student_user_id, p_institute_id, 'student', p_name, p_email, p_phone, TRUE)
  ON CONFLICT (id) DO NOTHING;   -- idempotent: trigger may have beaten us to it

  -- ── Step 3: Insert into public.students ───────────────────────────────────
  INSERT INTO public.students (
    institute_id,
    user_id,
    admission_no,
    batch_id,
    aadhaar_masked,
    emergency_contact,
    status
  )
  VALUES (
    p_institute_id,
    v_student_user_id,
    p_admission_no,
    p_batch_id,          -- nullable; can be assigned/updated later
    p_aadhaar_last4,     -- store last-4 digits only (no full Aadhaar ever stored)
    p_emergency_contact, -- nullable JSONB
    'active'             -- hardcoded: all newly admitted students start active
  )
  RETURNING id INTO v_student_id;

  -- ── Step 4: Log the admission event ───────────────────────────────────────
  INSERT INTO public.activity_logs (
    institute_id, user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_institute_id,
    auth.uid(),
    'student.admitted',
    'student',
    v_student_id,
    jsonb_build_object(
      'student_name', p_name,
      'admission_no', p_admission_no,
      'email',        p_email,
      'batch_id',     p_batch_id
    )
  );

  -- ── Return success payload ─────────────────────────────────────────────────
  RETURN json_build_object(
    'student_id',   v_student_id,
    'user_id',      v_student_user_id,
    'admission_no', p_admission_no
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Surface the full error message to the caller for structured handling.
    -- The SQLERRM is prefixed with a machine-readable code (see guards above)
    -- so the frontend can dispatch on it without string-parsing stack traces.
    RAISE EXCEPTION '%', SQLERRM;
END;
$$;

-- Grant to authenticated only — anonymous callers must never admit students
GRANT EXECUTE ON FUNCTION public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB)
  TO authenticated;

-- ============================================================
-- SECTION 10: log_activity() — frontend audit helper
-- ============================================================
--
-- PURPOSE:
--   Provides a lightweight, safe way for authenticated frontend
--   code to record user actions (e.g. page views, exports, searches)
--   without needing direct INSERT access to activity_logs.
--
--   Because this is SECURITY DEFINER, it bypasses RLS on activity_logs
--   for the insert — preventing the "no INSERT policy" error while still
--   attributing the row to the calling user.
--
-- FAILURE BEHAVIOUR:
--   The EXCEPTION block swallows all errors silently.
--   A logging failure must NEVER block or roll back the main operation.
--
-- PARAMETERS:
--   p_action       — required action string ('student.viewed', etc.)
--   p_entity_type  — optional entity type ('student', 'batch', ...)
--   p_entity_id    — optional PK of the affected entity
--   p_metadata     — optional arbitrary JSONB context

CREATE OR REPLACE FUNCTION public.log_activity(
  p_action      TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id   UUID DEFAULT NULL,
  p_metadata    JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_institute_id UUID;
BEGIN
  -- Resolve the caller's institute from their user profile
  SELECT institute_id
    INTO v_institute_id
    FROM public.users
   WHERE id = auth.uid();

  INSERT INTO public.activity_logs (
    institute_id, user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    v_institute_id,
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_metadata
  );

EXCEPTION WHEN OTHERS THEN
  -- Intentionally swallowed: logging must never abort the caller's transaction
  NULL;
END;
$$;

-- Authenticated users (admins, staff, students, parents) may all log activity
GRANT EXECUTE ON FUNCTION public.log_activity(TEXT, TEXT, UUID, JSONB)
  TO authenticated;

-- ============================================================
-- SECTION 11: Performance indexes
-- ============================================================

-- students: updated_at for sync queries ("give me everything changed since X")
CREATE INDEX IF NOT EXISTS idx_students_updated_at  ON public.students(updated_at DESC);

-- students: batch_id for "all students in batch" lookups (dashboard, reports)
CREATE INDEX IF NOT EXISTS idx_students_batch_id    ON public.students(batch_id);

-- students: composite for filtered list queries (institute + status filter)
-- covers: SELECT * FROM students WHERE institute_id = ? AND status = ?
CREATE INDEX IF NOT EXISTS idx_students_status_inst ON public.students(institute_id, status);

-- ============================================================
-- Verification queries (uncomment and run manually if needed)
-- ============================================================

-- -- Confirm enum values were added:
-- SELECT enumlabel FROM pg_enum
-- JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
-- WHERE pg_type.typname IN ('student_status', 'relation_type')
-- ORDER BY pg_type.typname, enumsortorder;

-- -- Confirm new columns on students:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'students'
-- ORDER BY ordinal_position;

-- -- Confirm new tables exist:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('batches', 'student_history', 'activity_logs')
-- ORDER BY table_name;

-- -- Confirm RLS is enabled on new tables:
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('batches', 'student_history', 'activity_logs');

-- -- Confirm RPCs exist:
-- SELECT routine_name, security_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name IN ('admit_student', 'log_activity');
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
-- ============================================================
-- EduOS Migration 005 — ERP Operational Phase
-- ============================================================

-- ============================================================
-- PERMISSION FIX (newer Supabase projects restrict public schema)
-- Run this FIRST if you see: permission denied for schema public
-- ============================================================
GRANT USAGE, CREATE ON SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
--
-- WHAT THIS MIGRATION DOES:
--
--  1. Courses system    — courses, student_courses (enrollment junction)
--  2. Student lifecycle — student_promotions, student_documents
--  3. Attendance system — attendance_sessions, attendance_records
--  4. Fee management    — fee_categories, fee_structures, student_fees,
--                         fee_payments, fee_receipts
--  5. Security events   — security_events (audit log for suspicious activity)
--  6. Indexes           — performance indexes on all new tables
--  7. Triggers          — updated_at auto-maintenance
--  8. RLS policies      — row-level security for all new tables
--  9. generate_receipt_number() — SECURITY DEFINER receipt numbering RPC
-- 10. record_fee_payment()      — atomic, validated payment recording RPC
--
-- IDEMPOTENCY:
--   Every DDL statement uses IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS
--   so this file is safe to re-run without errors.
--
-- DEPENDENCIES:
--   • Migration 001: enums (user_role), base tables (institutes, users,
--                    students), helper functions (get_my_institute_id,
--                    get_my_role, is_super_admin)
--   • Migration 002: update_updated_at_column() trigger function,
--                    users.is_active, users.updated_at, users.avatar_url,
--                    institutes.is_active, institutes.updated_at
--   • Migration 003: batches, student_history, activity_logs tables;
--                    students.emergency_contact, students.updated_at
--   • Migration 004: admit_student() RPC (no pgcrypto)
-- ============================================================


-- ============================================================
-- SECTION 1: Courses System
-- ============================================================

-- ── courses ──────────────────────────────────────────────────────────────────
-- An academic subject or module offered within an institute.
-- UNIQUE(institute_id, code) prevents duplicate course codes per institute.

CREATE TABLE IF NOT EXISTS public.courses (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  code         TEXT        NOT NULL,
  description  TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(institute_id, code)
);

-- ── student_courses ───────────────────────────────────────────────────────────
-- Junction table: links students to their enrolled courses.
-- status: 'active'    = currently enrolled
--         'completed' = successfully finished the course
--         'dropped'   = withdrew mid-course
-- UNIQUE(student_id, course_id) prevents duplicate enrollments.

CREATE TABLE IF NOT EXISTS public.student_courses (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID        NOT NULL REFERENCES public.students(id)   ON DELETE CASCADE,
  course_id    UUID        NOT NULL REFERENCES public.courses(id)    ON DELETE CASCADE,
  institute_id UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       TEXT        NOT NULL DEFAULT 'active', -- 'active' | 'completed' | 'dropped'
  UNIQUE(student_id, course_id)
);


-- ============================================================
-- SECTION 2: Student Lifecycle
-- ============================================================

-- ── student_promotions ────────────────────────────────────────────────────────
-- Immutable, append-only record of every major student lifecycle transition.
-- action: 'promoted'    = moved to next batch / grade
--         'graduated'   = successfully completed the programme
--         'suspended'   = placed on disciplinary hold
--         'reactivated' = reinstated after suspension/inactive period
--         'transferred' = moved to another institute / branch
-- from_batch_id / to_batch_id: capture batch-level promotions.
-- Rows are NEVER updated after insertion.

CREATE TABLE IF NOT EXISTS public.student_promotions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID        NOT NULL REFERENCES public.students(id)   ON DELETE CASCADE,
  institute_id   UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  promoted_by    UUID        NOT NULL REFERENCES public.users(id),
  action         TEXT        NOT NULL, -- 'promoted' | 'graduated' | 'suspended' | 'reactivated' | 'transferred'
  from_status    TEXT        NOT NULL,
  to_status      TEXT        NOT NULL,
  from_batch_id  UUID        REFERENCES public.batches(id),
  to_batch_id    UUID        REFERENCES public.batches(id),
  reason         TEXT,
  effective_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── student_documents ─────────────────────────────────────────────────────────
-- Metadata catalogue for documents uploaded to Supabase Storage.
-- file_path: the storage object path — NOT a public URL. Generate a
--            signed URL at read time via Supabase Storage SDK.
-- document_type: 'aadhaar' | 'birth_certificate' | 'marksheet'
--                'photo'   | 'tc'                | 'other'
-- is_verified: toggled by an admin after manual document review.

CREATE TABLE IF NOT EXISTS public.student_documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID        NOT NULL REFERENCES public.students(id)   ON DELETE CASCADE,
  institute_id  UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  uploaded_by   UUID        NOT NULL REFERENCES public.users(id),
  document_type TEXT        NOT NULL, -- 'aadhaar' | 'birth_certificate' | 'marksheet' | 'photo' | 'tc' | 'other'
  file_name     TEXT        NOT NULL,
  file_path     TEXT        NOT NULL, -- Supabase Storage path (not a public URL)
  file_size     INTEGER     NOT NULL,
  mime_type     TEXT        NOT NULL,
  is_verified   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- SECTION 3: Attendance System
-- ============================================================

-- ── attendance_sessions ───────────────────────────────────────────────────────
-- Represents one attendance-taking event (daily roll-call or per-lecture).
-- session_type: 'daily'   = whole-batch roll-call (one per batch per day)
--               'lecture' = course-specific session (multiple per day allowed)
-- is_locked: once TRUE, attendance_records for this session are read-only.
-- UNIQUE(institute_id, batch_id, session_date, session_type) prevents
-- duplicate daily sessions for the same batch on the same day.

CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  batch_id     UUID        REFERENCES public.batches(id),
  course_id    UUID        REFERENCES public.courses(id),
  conducted_by UUID        NOT NULL REFERENCES public.users(id),
  session_date DATE        NOT NULL,
  session_type TEXT        NOT NULL DEFAULT 'daily', -- 'daily' | 'lecture'
  topic        TEXT,
  is_locked    BOOLEAN     NOT NULL DEFAULT FALSE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(institute_id, batch_id, session_date, session_type)
);

-- ── attendance_records ────────────────────────────────────────────────────────
-- One row per student per session — the actual presence/absence data.
-- status: 'present' | 'absent' | 'late' | 'leave'
-- UNIQUE(session_id, student_id) prevents duplicate marks per session.

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id   UUID        NOT NULL REFERENCES public.students(id)            ON DELETE CASCADE,
  institute_id UUID        NOT NULL REFERENCES public.institutes(id)          ON DELETE CASCADE,
  status       TEXT        NOT NULL, -- 'present' | 'absent' | 'late' | 'leave'
  notes        TEXT,
  marked_by    UUID        NOT NULL REFERENCES public.users(id),
  marked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);


-- ============================================================
-- SECTION 4: Fee Management System
-- ============================================================

-- ── fee_categories ────────────────────────────────────────────────────────────
-- Groups fee structures into logical buckets (Tuition, Transport, Hostel, …).

CREATE TABLE IF NOT EXISTS public.fee_categories (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── fee_structures ────────────────────────────────────────────────────────────
-- A reusable fee template that can be assigned to many students.
-- amount >= 0: zero is valid for free / fully-waived structures.
-- frequency: 'one_time' | 'monthly' | 'quarterly' | 'annual'

CREATE TABLE IF NOT EXISTS public.fee_structures (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id  UUID          NOT NULL REFERENCES public.institutes(id)    ON DELETE CASCADE,
  category_id   UUID          REFERENCES public.fee_categories(id),
  name          TEXT          NOT NULL,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  frequency     TEXT          NOT NULL DEFAULT 'one_time', -- 'one_time' | 'monthly' | 'quarterly' | 'annual'
  academic_year TEXT          NOT NULL,
  description   TEXT,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── student_fees ──────────────────────────────────────────────────────────────
-- Source of truth for what a specific student owes against a fee structure.
-- discount_amount reduces original_amount to arrive at final_amount.
-- status lifecycle: pending → partial → paid
--                   pending → overdue (if due_date passes)
--                   any     → waived  (admin action)

CREATE TABLE IF NOT EXISTS public.student_fees (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID          NOT NULL REFERENCES public.students(id)       ON DELETE CASCADE,
  institute_id     UUID          NOT NULL REFERENCES public.institutes(id)     ON DELETE CASCADE,
  fee_structure_id UUID          NOT NULL REFERENCES public.fee_structures(id),
  assigned_by      UUID          NOT NULL REFERENCES public.users(id),
  original_amount  NUMERIC(12,2) NOT NULL,
  discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  discount_reason  TEXT,
  final_amount     NUMERIC(12,2) NOT NULL,
  due_date         DATE          NOT NULL,
  status           TEXT          NOT NULL DEFAULT 'pending', -- 'pending' | 'partial' | 'paid' | 'overdue' | 'waived'
  academic_year    TEXT          NOT NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── fee_payments ──────────────────────────────────────────────────────────────
-- Records each individual cash or digital payment against a student_fee row.
-- A single fee may accumulate multiple partial payments before reaching 'paid'.
-- receipt_number: human-readable ref generated by generate_receipt_number().
-- payment_method: 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'card'

CREATE TABLE IF NOT EXISTS public.fee_payments (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  student_fee_id  UUID          NOT NULL REFERENCES public.student_fees(id) ON DELETE CASCADE,
  student_id      UUID          NOT NULL REFERENCES public.students(id)     ON DELETE CASCADE,
  institute_id    UUID          NOT NULL REFERENCES public.institutes(id)   ON DELETE CASCADE,
  collected_by    UUID          NOT NULL REFERENCES public.users(id),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method  TEXT          NOT NULL, -- 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'card'
  payment_date    DATE          NOT NULL,
  transaction_ref TEXT,
  notes           TEXT,
  receipt_number  TEXT          UNIQUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── fee_receipts ──────────────────────────────────────────────────────────────
-- Serialised JSONB snapshot of the receipt at the moment of payment.
-- Used by the frontend to render and print receipts without querying multiple
-- joined tables. Writes come exclusively from record_fee_payment() SECURITY
-- DEFINER RPC — no direct INSERT from the frontend is possible under RLS.

CREATE TABLE IF NOT EXISTS public.fee_receipts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id     UUID        NOT NULL REFERENCES public.fee_payments(id) ON DELETE CASCADE,
  institute_id   UUID        NOT NULL REFERENCES public.institutes(id)   ON DELETE CASCADE,
  receipt_number TEXT        NOT NULL UNIQUE,
  receipt_data   JSONB       NOT NULL,
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by   UUID        NOT NULL REFERENCES public.users(id)
);


-- ============================================================
-- SECTION 5: Security Events
-- ============================================================
-- Platform-wide audit trail for security-relevant incidents.
-- institute_id / user_id are nullable to capture unauthenticated events
-- (e.g. brute-force login attempts before a session exists).
--
-- event_type: 'failed_login' | 'permission_denied' | 'suspicious_upload' | 'rate_limit'
-- severity:   'low' | 'medium' | 'high' | 'critical'

CREATE TABLE IF NOT EXISTS public.security_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID        REFERENCES public.institutes(id) ON DELETE CASCADE,
  user_id      UUID        REFERENCES public.users(id)      ON DELETE SET NULL,
  event_type   TEXT        NOT NULL, -- 'failed_login' | 'permission_denied' | 'suspicious_upload' | 'rate_limit'
  severity     TEXT        NOT NULL DEFAULT 'low', -- 'low' | 'medium' | 'high' | 'critical'
  ip_address   TEXT,
  user_agent   TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- SECTION 6: Indexes
-- ============================================================
-- Covering the highest-cardinality filter columns used by list/search queries.
-- All index names are prefixed with idx_ and scoped to the table name.

-- ── courses ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_courses_institute_id ON public.courses(institute_id);
CREATE INDEX IF NOT EXISTS idx_courses_is_active    ON public.courses(is_active);
CREATE INDEX IF NOT EXISTS idx_courses_created_at   ON public.courses(created_at DESC);

-- ── student_courses ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_courses_student_id   ON public.student_courses(student_id);
CREATE INDEX IF NOT EXISTS idx_student_courses_course_id    ON public.student_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_student_courses_institute_id ON public.student_courses(institute_id);
CREATE INDEX IF NOT EXISTS idx_student_courses_status       ON public.student_courses(status);

-- ── student_promotions ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_promotions_student_id   ON public.student_promotions(student_id);
CREATE INDEX IF NOT EXISTS idx_student_promotions_institute_id ON public.student_promotions(institute_id);
CREATE INDEX IF NOT EXISTS idx_student_promotions_created_at   ON public.student_promotions(created_at DESC);

-- ── student_documents ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_documents_student_id   ON public.student_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_student_documents_institute_id ON public.student_documents(institute_id);
CREATE INDEX IF NOT EXISTS idx_student_documents_created_at   ON public.student_documents(created_at DESC);

-- ── attendance_sessions ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_institute_id ON public.attendance_sessions(institute_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_batch_id     ON public.attendance_sessions(batch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_session_date ON public.attendance_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_created_at   ON public.attendance_sessions(created_at DESC);

-- ── attendance_records ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_records_session_id   ON public.attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student_id   ON public.attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_institute_id ON public.attendance_records(institute_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_status       ON public.attendance_records(status);

-- ── fee_categories ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fee_categories_institute_id ON public.fee_categories(institute_id);
CREATE INDEX IF NOT EXISTS idx_fee_categories_is_active    ON public.fee_categories(is_active);

-- ── fee_structures ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fee_structures_institute_id ON public.fee_structures(institute_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_category_id  ON public.fee_structures(category_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_is_active    ON public.fee_structures(is_active);
CREATE INDEX IF NOT EXISTS idx_fee_structures_created_at   ON public.fee_structures(created_at DESC);

-- ── student_fees ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_fees_student_id   ON public.student_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_institute_id ON public.student_fees(institute_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_status       ON public.student_fees(status);
CREATE INDEX IF NOT EXISTS idx_student_fees_due_date     ON public.student_fees(due_date);
CREATE INDEX IF NOT EXISTS idx_student_fees_created_at   ON public.student_fees(created_at DESC);

-- ── fee_payments ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fee_payments_student_fee_id ON public.fee_payments(student_fee_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student_id     ON public.fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_institute_id   ON public.fee_payments(institute_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_payment_date   ON public.fee_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_fee_payments_created_at     ON public.fee_payments(created_at DESC);

-- ── fee_receipts ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fee_receipts_payment_id   ON public.fee_receipts(payment_id);
CREATE INDEX IF NOT EXISTS idx_fee_receipts_institute_id ON public.fee_receipts(institute_id);
CREATE INDEX IF NOT EXISTS idx_fee_receipts_generated_at ON public.fee_receipts(generated_at DESC);

-- ── security_events ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_security_events_institute_id ON public.security_events(institute_id);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id      ON public.security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type   ON public.security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity     ON public.security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at   ON public.security_events(created_at DESC);


-- ============================================================
-- SECTION 7: updated_at Triggers
-- ============================================================
-- All four triggers reuse the public.update_updated_at_column()
-- function that was created in migration 002.
-- DROP … IF EXISTS before CREATE ensures idempotency on re-runs.

-- courses
DROP TRIGGER IF EXISTS courses_set_updated_at ON public.courses;
CREATE TRIGGER courses_set_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- attendance_sessions
DROP TRIGGER IF EXISTS attendance_sessions_set_updated_at ON public.attendance_sessions;
CREATE TRIGGER attendance_sessions_set_updated_at
  BEFORE UPDATE ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- fee_structures
DROP TRIGGER IF EXISTS fee_structures_set_updated_at ON public.fee_structures;
CREATE TRIGGER fee_structures_set_updated_at
  BEFORE UPDATE ON public.fee_structures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- student_fees
DROP TRIGGER IF EXISTS student_fees_set_updated_at ON public.student_fees;
CREATE TRIGGER student_fees_set_updated_at
  BEFORE UPDATE ON public.student_fees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- SECTION 8: Row Level Security
-- ============================================================
-- Enable RLS on every new table then define policies.
--
-- Pattern applied consistently to each table:
--   super_admin_all_{table}  — FOR ALL;  super_admin bypasses all checks
--   admin_institute_{table}  — FOR ALL;  admin scoped to their institute
--   staff_read_{table}       — FOR SELECT; staff can read within institute
--
-- Exceptions:
--   student_fees / fee_payments — students can read their own records
--   attendance_records          — students can read their own records
--   student_courses             — students can read their own enrollments
--   student_documents           — students can read their own documents
--   fee_receipts                — admin-only SELECT; writes via SECURITY DEFINER RPC
--   security_events             — admin SELECT only; writes via server-side code
--
-- Idempotency: DROP POLICY IF EXISTS before every CREATE POLICY.

ALTER TABLE public.courses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_courses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_promotions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structures      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fees        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_receipts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events     ENABLE ROW LEVEL SECURITY;

-- ── courses ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "super_admin_all_courses"  ON public.courses;
DROP POLICY IF EXISTS "admin_institute_courses"  ON public.courses;
DROP POLICY IF EXISTS "staff_read_courses"       ON public.courses;
DROP POLICY IF EXISTS "student_read_courses"     ON public.courses;

CREATE POLICY "super_admin_all_courses"
  ON public.courses FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

CREATE POLICY "admin_institute_courses"
  ON public.courses FOR ALL
  USING     (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK(institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "staff_read_courses"
  ON public.courses FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

-- Students see only courses they are enrolled in
CREATE POLICY "student_read_courses"
  ON public.courses FOR SELECT
  USING (
    get_my_role() = 'student'
    AND id IN (
      SELECT sc.course_id
      FROM public.student_courses sc
      JOIN public.students s ON s.id = sc.student_id
      WHERE s.user_id = auth.uid()
    )
  );

-- ── student_courses ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "super_admin_all_student_courses" ON public.student_courses;
DROP POLICY IF EXISTS "admin_institute_student_courses" ON public.student_courses;
DROP POLICY IF EXISTS "staff_read_student_courses"      ON public.student_courses;
DROP POLICY IF EXISTS "student_read_own_courses"        ON public.student_courses;

CREATE POLICY "super_admin_all_student_courses"
  ON public.student_courses FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

CREATE POLICY "admin_institute_student_courses"
  ON public.student_courses FOR ALL
  USING     (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK(institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "staff_read_student_courses"
  ON public.student_courses FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

CREATE POLICY "student_read_own_courses"
  ON public.student_courses FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );

-- ── student_promotions ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "super_admin_all_student_promotions" ON public.student_promotions;
DROP POLICY IF EXISTS "admin_institute_student_promotions" ON public.student_promotions;
DROP POLICY IF EXISTS "staff_read_student_promotions"      ON public.student_promotions;

CREATE POLICY "super_admin_all_student_promotions"
  ON public.student_promotions FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

CREATE POLICY "admin_institute_student_promotions"
  ON public.student_promotions FOR ALL
  USING     (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK(institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "staff_read_student_promotions"
  ON public.student_promotions FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

-- ── student_documents ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "super_admin_all_student_documents" ON public.student_documents;
DROP POLICY IF EXISTS "admin_institute_student_documents" ON public.student_documents;
DROP POLICY IF EXISTS "staff_read_student_documents"      ON public.student_documents;
DROP POLICY IF EXISTS "student_read_own_documents"        ON public.student_documents;

CREATE POLICY "super_admin_all_student_documents"
  ON public.student_documents FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

CREATE POLICY "admin_institute_student_documents"
  ON public.student_documents FOR ALL
  USING     (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK(institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "staff_read_student_documents"
  ON public.student_documents FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

-- Students can view their own uploaded documents
CREATE POLICY "student_read_own_documents"
  ON public.student_documents FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );

-- ── attendance_sessions ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "super_admin_all_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "admin_institute_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "staff_read_attendance_sessions"      ON public.attendance_sessions;

CREATE POLICY "super_admin_all_attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

-- Admin has full CRUD; staff can mark attendance (INSERT/UPDATE also allowed)
CREATE POLICY "admin_institute_attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING     (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK(institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "staff_read_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

-- ── attendance_records ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "super_admin_all_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "admin_institute_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_read_attendance_records"      ON public.attendance_records;
DROP POLICY IF EXISTS "student_read_own_attendance"        ON public.attendance_records;

CREATE POLICY "super_admin_all_attendance_records"
  ON public.attendance_records FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

CREATE POLICY "admin_institute_attendance_records"
  ON public.attendance_records FOR ALL
  USING     (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK(institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "staff_read_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

-- Students can view their own attendance history
CREATE POLICY "student_read_own_attendance"
  ON public.attendance_records FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );

-- ── fee_categories ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "super_admin_all_fee_categories" ON public.fee_categories;
DROP POLICY IF EXISTS "admin_institute_fee_categories" ON public.fee_categories;
DROP POLICY IF EXISTS "staff_read_fee_categories"      ON public.fee_categories;

CREATE POLICY "super_admin_all_fee_categories"
  ON public.fee_categories FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

CREATE POLICY "admin_institute_fee_categories"
  ON public.fee_categories FOR ALL
  USING     (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK(institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "staff_read_fee_categories"
  ON public.fee_categories FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

-- ── fee_structures ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "super_admin_all_fee_structures" ON public.fee_structures;
DROP POLICY IF EXISTS "admin_institute_fee_structures" ON public.fee_structures;
DROP POLICY IF EXISTS "staff_read_fee_structures"      ON public.fee_structures;

CREATE POLICY "super_admin_all_fee_structures"
  ON public.fee_structures FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

CREATE POLICY "admin_institute_fee_structures"
  ON public.fee_structures FOR ALL
  USING     (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK(institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "staff_read_fee_structures"
  ON public.fee_structures FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

-- ── student_fees ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "super_admin_all_student_fees" ON public.student_fees;
DROP POLICY IF EXISTS "admin_institute_student_fees" ON public.student_fees;
DROP POLICY IF EXISTS "staff_read_student_fees"      ON public.student_fees;
DROP POLICY IF EXISTS "student_read_own_fees"        ON public.student_fees;

CREATE POLICY "super_admin_all_student_fees"
  ON public.student_fees FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

CREATE POLICY "admin_institute_student_fees"
  ON public.student_fees FOR ALL
  USING     (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK(institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "staff_read_student_fees"
  ON public.student_fees FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

-- Students can view their own fee obligations
CREATE POLICY "student_read_own_fees"
  ON public.student_fees FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );

-- ── fee_payments ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "super_admin_all_fee_payments" ON public.fee_payments;
DROP POLICY IF EXISTS "admin_institute_fee_payments" ON public.fee_payments;
DROP POLICY IF EXISTS "staff_read_fee_payments"      ON public.fee_payments;
DROP POLICY IF EXISTS "student_read_own_payments"    ON public.fee_payments;

CREATE POLICY "super_admin_all_fee_payments"
  ON public.fee_payments FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

CREATE POLICY "admin_institute_fee_payments"
  ON public.fee_payments FOR ALL
  USING     (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK(institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "staff_read_fee_payments"
  ON public.fee_payments FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

-- Students can view their own payment history
CREATE POLICY "student_read_own_payments"
  ON public.fee_payments FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );

-- ── fee_receipts ──────────────────────────────────────────────────────────────
-- INSERT is deliberately not exposed via RLS; only record_fee_payment()
-- (SECURITY DEFINER) can write receipt rows. Admins/super_admin read receipts
-- for audit; students are not granted receipt SELECT here because receipts
-- are surfaced via the payment record (receipt_number on fee_payments).

DROP POLICY IF EXISTS "super_admin_all_fee_receipts" ON public.fee_receipts;
DROP POLICY IF EXISTS "admin_institute_fee_receipts" ON public.fee_receipts;

CREATE POLICY "super_admin_all_fee_receipts"
  ON public.fee_receipts FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

-- Admin: SELECT only — writes are via the SECURITY DEFINER RPC
CREATE POLICY "admin_institute_fee_receipts"
  ON public.fee_receipts FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

-- ── security_events ───────────────────────────────────────────────────────────
-- Super-admin has full access; institute admins can read events scoped to them.
-- Writes come from server-side code / Edge Functions — not from the frontend.

DROP POLICY IF EXISTS "super_admin_all_security_events"  ON public.security_events;
DROP POLICY IF EXISTS "admin_institute_security_events"  ON public.security_events;

CREATE POLICY "super_admin_all_security_events"
  ON public.security_events FOR ALL
  USING     (is_super_admin())
  WITH CHECK(is_super_admin());

CREATE POLICY "admin_institute_security_events"
  ON public.security_events FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  );


-- ============================================================
-- SECTION 9: generate_receipt_number() RPC
-- ============================================================
-- Generates a human-readable, sequential receipt number scoped to one
-- institute.
--
-- Format: RCP-YYYYMM-NNNNN   (e.g. RCP-202501-00042)
--   • RCP     — constant prefix; identifies receipt type
--   • YYYYMM  — year+month of generation (for rough chronological ordering)
--   • NNNNN   — 5-digit zero-padded sequential counter per institute
--
-- Concurrency note:
--   Uses an advisory transaction lock per institute so two payments cannot
--   generate the same receipt number concurrently.

CREATE OR REPLACE FUNCTION public.generate_receipt_number(p_institute_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count      INTEGER;
  v_receipt_no TEXT;
  v_month_key  TEXT;
BEGIN
  -- Serialize receipt generation per institute for the duration of the txn.
  PERFORM pg_advisory_xact_lock(hashtext(p_institute_id::TEXT));

  v_month_key := to_char(NOW(), 'YYYYMM');

  SELECT COALESCE(
           MAX(
             (
               regexp_match(
                 receipt_number,
                 '^RCP-' || v_month_key || '-([0-9]{5})$'
               )
             )[1]::INTEGER
           ),
           0
         ) + 1
  INTO v_count
  FROM public.fee_payments
  WHERE institute_id = p_institute_id
    AND receipt_number LIKE 'RCP-' || v_month_key || '-%';

  v_receipt_no := 'RCP-' || v_month_key || '-' || lpad(v_count::text, 5, '0');
  RETURN v_receipt_no;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_receipt_number(UUID) TO authenticated;


-- ============================================================
-- SECTION 10: record_fee_payment() RPC
-- ============================================================
-- Atomic, SECURITY DEFINER payment processing in a single transaction.
--
-- Steps:
--   1. Verify caller is admin or super_admin.
--   2. Fetch the student_fee row and confirm it belongs to the caller's
--      institute (prevents cross-institute payment recording).
--   3. Sum prior payments to calculate the remaining balance.
--   4. Reject if p_amount exceeds the remaining balance (PAYMENT_OVERFLOW).
--   5. Generate a unique receipt number via generate_receipt_number().
--   6. INSERT into fee_payments (with receipt_number).
--   7. UPDATE student_fees.status → 'partial' or 'paid'.
--   8. INSERT JSONB snapshot into fee_receipts.
--   9. Log to activity_logs (errors silenced — logging never aborts payment).
--  10. Return JSON with payment_id, receipt_number, new_status, remaining_due.
--
-- Error codes embedded in EXCEPTION messages (parseable by the frontend):
--   PAYMENT_FORBIDDEN    — caller is not admin / super_admin
--   PAYMENT_NOT_FOUND    — fee record missing or belongs to another institute
--   PAYMENT_OVERFLOW     — amount exceeds remaining balance

CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_student_fee_id  UUID,
  p_amount          NUMERIC,
  p_payment_method  TEXT,
  p_payment_date    DATE,
  p_transaction_ref TEXT DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role  user_role;
  v_institute_id UUID;
  v_student_id   UUID;
  v_final_amount NUMERIC;
  v_paid_so_far  NUMERIC;
  v_remaining    NUMERIC;
  v_new_status   TEXT;
  v_receipt_no   TEXT;
  v_payment_id   UUID;
BEGIN
  -- ── 1. Security: verify caller is admin or super_admin ───────────────────
  SELECT role, institute_id
  INTO   v_caller_role, v_institute_id
  FROM   public.users
  WHERE  id = auth.uid();

  IF v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'PAYMENT_FORBIDDEN: Only admins can record payments.';
  END IF;

  -- ── 2. Retrieve fee details; confirm institute ownership ─────────────────
  SELECT final_amount, student_id
  INTO   v_final_amount, v_student_id
  FROM   public.student_fees
  WHERE  id = p_student_fee_id
    AND  institute_id = v_institute_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND: Fee record not found or does not belong to your institute.';
  END IF;

  -- ── 3. Calculate the amount paid so far ──────────────────────────────────
  SELECT COALESCE(SUM(amount), 0)
  INTO   v_paid_so_far
  FROM   public.fee_payments
  WHERE  student_fee_id = p_student_fee_id;

  v_remaining := v_final_amount - v_paid_so_far;

  -- ── 4. Guard: reject over-payments ───────────────────────────────────────
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'PAYMENT_OVERFLOW: Payment amount (%) exceeds remaining due (%).',
      p_amount, v_remaining;
  END IF;

  -- ── 5. Generate a unique receipt number ──────────────────────────────────
  v_receipt_no := public.generate_receipt_number(v_institute_id);

  -- ── 6. Insert the payment record ─────────────────────────────────────────
  INSERT INTO public.fee_payments (
    student_fee_id,
    student_id,
    institute_id,
    collected_by,
    amount,
    payment_method,
    payment_date,
    transaction_ref,
    notes,
    receipt_number
  ) VALUES (
    p_student_fee_id,
    v_student_id,
    v_institute_id,
    auth.uid(),
    p_amount,
    p_payment_method,
    p_payment_date,
    p_transaction_ref,
    p_notes,
    v_receipt_no
  )
  RETURNING id INTO v_payment_id;

  -- ── 7. Update student_fee status ─────────────────────────────────────────
  v_new_status := CASE
    WHEN (v_paid_so_far + p_amount) >= v_final_amount THEN 'paid'
    ELSE 'partial'
  END;

  UPDATE public.student_fees
  SET    status     = v_new_status,
         updated_at = NOW()
  WHERE  id = p_student_fee_id;

  -- ── 8. Insert fee_receipt JSONB snapshot ──────────────────────────────────
  INSERT INTO public.fee_receipts (
    payment_id,
    institute_id,
    receipt_number,
    receipt_data,
    generated_by
  ) VALUES (
    v_payment_id,
    v_institute_id,
    v_receipt_no,
    jsonb_build_object(
      'receipt_number', v_receipt_no,
      'payment_id',     v_payment_id,
      'amount',         p_amount,
      'payment_method', p_payment_method,
      'payment_date',   p_payment_date,
      'transaction_ref', p_transaction_ref,
      'student_fee_id', p_student_fee_id
    ),
    auth.uid()
  );

  -- ── 9. Activity log (logging failure must never abort the payment) ────────
  BEGIN
    INSERT INTO public.activity_logs (
      institute_id,
      user_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) VALUES (
      v_institute_id,
      auth.uid(),
      'fee.payment_recorded',
      'fee_payment',
      v_payment_id,
      jsonb_build_object(
        'amount',  p_amount,
        'receipt', v_receipt_no
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── 10. Return success payload ────────────────────────────────────────────
  RETURN json_build_object(
    'payment_id',     v_payment_id,
    'receipt_number', v_receipt_no,
    'new_status',     v_new_status,
    'remaining_due',  GREATEST(0, v_remaining - p_amount)
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '%', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, NUMERIC, TEXT, DATE, TEXT, TEXT) TO authenticated;
-- ============================================================
-- EduOS Migration 006 — Batch Management Upgrade
-- ============================================================
--
-- WHAT THIS MIGRATION DOES:
-- 1. Extends public.batches for full batch lifecycle management
-- 2. Backfills existing rows with safe defaults
-- 3. Adds constraints and indexes used by batch + attendance UI
--
-- IDEMPOTENT:
--   Uses IF NOT EXISTS and guarded updates where possible.
-- ============================================================

-- ============================================================
-- SECTION 1: Schema Additions
-- ============================================================

ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS batch_code  TEXT,
  ADD COLUMN IF NOT EXISTS course_name TEXT,
  ADD COLUMN IF NOT EXISTS start_date  DATE,
  ADD COLUMN IF NOT EXISTS end_date    DATE,
  ADD COLUMN IF NOT EXISTS capacity    INTEGER,
  ADD COLUMN IF NOT EXISTS status      TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- ============================================================
-- SECTION 2: Backfill Existing Data
-- ============================================================

UPDATE public.batches
SET batch_code = COALESCE(batch_code, UPPER(SUBSTRING(REPLACE(name, ' ', '') FROM 1 FOR 8)))
WHERE batch_code IS NULL;

UPDATE public.batches
SET course_name = COALESCE(course_name, name)
WHERE course_name IS NULL;

UPDATE public.batches
SET start_date = COALESCE(start_date, DATE_TRUNC('year', created_at)::DATE)
WHERE start_date IS NULL;

UPDATE public.batches
SET end_date = COALESCE(end_date, (DATE_TRUNC('year', created_at) + INTERVAL '1 year' - INTERVAL '1 day')::DATE)
WHERE end_date IS NULL;

UPDATE public.batches
SET capacity = COALESCE(capacity, 50)
WHERE capacity IS NULL;

UPDATE public.batches
SET status = COALESCE(status, CASE WHEN is_active THEN 'active' ELSE 'inactive' END)
WHERE status IS NULL;

-- ============================================================
-- SECTION 3: Constraints + Defaults
-- ============================================================

ALTER TABLE public.batches
  ALTER COLUMN batch_code SET NOT NULL,
  ALTER COLUMN course_name SET NOT NULL,
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN end_date SET NOT NULL,
  ALTER COLUMN capacity SET NOT NULL,
  ALTER COLUMN capacity SET DEFAULT 50,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'active';

-- Keep timeline valid
ALTER TABLE public.batches
  DROP CONSTRAINT IF EXISTS batches_dates_valid;

ALTER TABLE public.batches
  ADD CONSTRAINT batches_dates_valid CHECK (end_date >= start_date);

-- Bound capacity to a realistic operational range
ALTER TABLE public.batches
  DROP CONSTRAINT IF EXISTS batches_capacity_valid;

ALTER TABLE public.batches
  ADD CONSTRAINT batches_capacity_valid CHECK (capacity >= 1 AND capacity <= 1000);

-- Restrict statuses expected by the app
ALTER TABLE public.batches
  DROP CONSTRAINT IF EXISTS batches_status_valid;

ALTER TABLE public.batches
  ADD CONSTRAINT batches_status_valid CHECK (status IN ('active', 'inactive', 'archived'));

-- ============================================================
-- SECTION 4: Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_batches_status ON public.batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_archived_at ON public.batches(archived_at);
CREATE INDEX IF NOT EXISTS idx_batches_start_date ON public.batches(start_date);

-- Active codes should be unique per institute for operator clarity.
CREATE UNIQUE INDEX IF NOT EXISTS uq_batches_institute_batch_code_active
  ON public.batches(institute_id, batch_code)
  WHERE archived_at IS NULL;
-- ============================================================
-- EduOS Migration 007 — Staff Attendance Write Access
-- ============================================================
--
-- FIXES:
--   Staff users can mark attendance, but the previous RLS policy only
--   granted SELECT on public.attendance_records. That caused save attempts
--   to fail and the UI to fall back to the default 'present' state on reload.
--
-- This migration grants INSERT/UPDATE access for staff within their
-- institute so attendance changes persist correctly.
-- ============================================================

DROP POLICY IF EXISTS "staff_manage_attendance_records" ON public.attendance_records;

CREATE POLICY "staff_insert_attendance_records"
  ON public.attendance_records FOR INSERT
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

CREATE POLICY "staff_update_attendance_records"
  ON public.attendance_records FOR UPDATE
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'staff');
-- ============================================================================
-- Migration: Parent Creation and Student Linking During Admission
-- 
-- This migration extends the `admit_student` RPC to support automatic parent
-- creation and linking when admin provides parent details during admission.
--
-- Key features:
-- - Prevents duplicate parents by email + institute
-- - Reuses existing parents for multiple students
-- - Atomically creates student, parent, and links them
-- - Maintains multi-tenant isolation via institute_id
-- ============================================================================

-- ── Helper function: Create parent and link to student ──────────────────

CREATE OR REPLACE FUNCTION public.create_parent_and_link(
  p_institute_id UUID,
  p_student_id UUID,
  p_parent_name TEXT,
  p_parent_email TEXT,
  p_parent_phone TEXT,
  p_parent_occupation TEXT,
  p_parent_relation_type TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID;
  v_user_id UUID;
  v_existing_parent_id UUID;
BEGIN
  -- Check if parent with this email already exists in this institute
  SELECT p.id 
  INTO v_existing_parent_id
  FROM parents p
  JOIN users u ON p.user_id = u.id
  WHERE u.email = p_parent_email
    AND p.institute_id = p_institute_id
  LIMIT 1;
  
  IF v_existing_parent_id IS NOT NULL THEN
    -- Reuse existing parent
    v_parent_id := v_existing_parent_id;
  ELSE
    -- Create new auth user for parent
    -- Note: This should be done via Supabase admin API in the backend
    -- For now, we'll assume the user is created separately and passed in
    -- In production, you'll need to call supabase.auth.admin.createUser()
    
    -- Get the current user ID (should be set by backend service)
    -- For safety, we'll check if user already exists
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = p_parent_email
    LIMIT 1;
    
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'ADMIT_STUDENT_PARENT_AUTH_FAILED: Parent user must be created via auth service before calling this function';
    END IF;
    
    -- Create parent record
    INSERT INTO parents (institute_id, user_id, occupation)
    VALUES (p_institute_id, v_user_id, p_parent_occupation)
    RETURNING id INTO v_parent_id;
  END IF;
  
  -- Link parent to student
  INSERT INTO student_parents (student_id, parent_id, relation_type)
  VALUES (p_student_id, v_parent_id, p_parent_relation_type)
  ON CONFLICT (student_id, parent_id) DO NOTHING;
  
  RETURN v_parent_id;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'ADMIT_STUDENT_PARENT_CREATION_FAILED: %', SQLERRM;
END;
$$;


-- Drop any existing variant of admit_student (old signatures)
DROP FUNCTION IF EXISTS public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);

-- ── Updated admit_student RPC ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admit_student(
  p_institute_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_admission_no TEXT,
  p_batch_id UUID,
  p_emergency_contact JSONB,
  -- NEW: Parent creation parameters (all optional)
  p_parent_name TEXT DEFAULT NULL,
  p_parent_email TEXT DEFAULT NULL,
  p_parent_phone TEXT DEFAULT NULL,
  p_parent_occupation TEXT DEFAULT NULL,
  p_parent_relation_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
  v_parent_id UUID;
  v_user_id UUID;
  v_institute_exists BOOLEAN;
BEGIN
  -- Validate institute exists
  SELECT EXISTS(SELECT 1 FROM institutes WHERE id = p_institute_id)
  INTO v_institute_exists;
  
  IF NOT v_institute_exists THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_INVALID_INSTITUTE: The specified institute does not exist or is currently inactive.';
  END IF;
  
  -- Check for duplicate email in this institute
  IF EXISTS(SELECT 1 FROM users WHERE email = p_email AND institute_id = p_institute_id) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_DUPLICATE_EMAIL: A user with this email address already exists.';
  END IF;
  
  -- Check for duplicate admission number in this institute
  IF EXISTS(SELECT 1 FROM students WHERE admission_no = p_admission_no AND institute_id = p_institute_id) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_DUPLICATE_ADMISSION_NO: This admission number is already in use at this institute.';
  END IF;
  
  -- Validate batch if provided
  IF p_batch_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM batches WHERE id = p_batch_id AND institute_id = p_institute_id) THEN
      RAISE EXCEPTION 'ADMIT_STUDENT_INVALID_BATCH: The selected batch does not exist or does not belong to this institute.';
    END IF;
  END IF;
  
  -- Create auth user for student
  -- Note: In production, this should be done via Supabase admin API
  -- SELECT auth.create_user(...) INTO v_user_id;
  -- For now, we expect the user to be created separately
  
  -- Actually create the student auth user (example implementation)
  -- This requires the backend service to handle it properly
  SELECT auth.uid() INTO v_user_id;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_AUTH_FAILED: Unable to create student user account. Please try again.';
  END IF;
  
  -- Insert student record
  INSERT INTO students (
    institute_id,
    user_id,
    admission_no,
    batch_id,
    emergency_contact,
    status
  )
  VALUES (
    p_institute_id,
    v_user_id,
    p_admission_no,
    p_batch_id,
    p_emergency_contact,
    'active'
  )
  RETURNING id INTO v_student_id;
  
  -- Create and link parent if details provided
  IF p_parent_name IS NOT NULL AND p_parent_email IS NOT NULL THEN
    PERFORM create_parent_and_link(
      p_institute_id,
      v_student_id,
      p_parent_name,
      p_parent_email,
      p_parent_phone,
      p_parent_occupation,
      p_parent_relation_type
    );
  END IF;
  
  -- Return success response
  RETURN jsonb_build_object(
    'student_id', v_student_id,
    'admission_no', p_admission_no
  );
  
EXCEPTION WHEN OTHERS THEN
  -- Re-raise with meaningful error message
  IF SQLERRM LIKE '%ADMIT_STUDENT_%' THEN
    RAISE;
  ELSE
    RAISE EXCEPTION 'ADMIT_STUDENT_FAILED: %', SQLERRM;
  END IF;
END;
$$;

-- ── Database constraints and indexes ────────────────────────────────────

-- Ensure student_parents table has proper indexes
CREATE INDEX IF NOT EXISTS idx_student_parents_parent_id 
ON student_parents(parent_id);

CREATE INDEX IF NOT EXISTS idx_student_parents_student_id 
ON student_parents(student_id);

-- Unique constraint on student_id + parent_id (prevent duplicate links)
ALTER TABLE student_parents
DROP CONSTRAINT IF EXISTS unique_student_parent;

ALTER TABLE student_parents
ADD CONSTRAINT unique_student_parent
UNIQUE (student_id, parent_id);

-- ── RLS Policies for parent creation ────────────────────────────────────

-- Policy: Authenticated admins can create parents in their institute
DROP POLICY IF EXISTS "admin_can_create_parents" ON parents;

CREATE POLICY "admin_can_create_parents" ON parents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.institute_id = parents.institute_id
    AND users.role = 'admin'
  )
);

-- Policy: Authenticated admins can create student_parent links
DROP POLICY IF EXISTS "admin_can_link_parents" ON student_parents;

CREATE POLICY "admin_can_link_parents" ON student_parents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = student_parents.student_id
    AND s.institute_id = (
      SELECT institute_id FROM parents WHERE id = student_parents.parent_id
    )
  )
);

-- ── Grants for RPC execution ────────────────────────────────────────────

-- Grant execute on helper function to authenticated users
GRANT EXECUTE ON FUNCTION public.create_parent_and_link(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
TO authenticated;

-- Grant execute on main RPC to authenticated users
GRANT EXECUTE ON FUNCTION public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT)
TO authenticated;

-- ── Rollback instructions (if needed) ────────────────────────────────────
-- 
-- DROP FUNCTION IF EXISTS public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.create_parent_and_link(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
--
-- Then recreate the old admit_student function with original signature
-- ============================================================================
-- Migration 009 — admit_student() with correct student + parent flow
--
-- Fixes:
--   • Restores atomic auth.users + public.users + students insert (004 model)
--   • Parent data is never written to students — only to users/parents/
--     student_parents
--   • Reuses existing parent in the institute when email OR phone matches
--   • Drops broken 008 variants (wrong auth.uid() student linkage)
-- ============================================================================

-- Remove helper from 008 (optional; not used by new RPC)
DROP FUNCTION IF EXISTS public.create_parent_and_link(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

-- Drop every known overload of admit_student
-- PostgreSQL will not REPLACE a function when the return type changes (JSON vs JSONB),
-- so the 13-arg variant from migration 008 must be dropped explicitly.
DROP FUNCTION IF EXISTS public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admit_student(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);

-- ── admit_student — student admission + optional parent create/link ────────

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
  -- ── Security: caller must be admin of target institute (or super_admin) ───
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

  -- ── Student email uniqueness (global auth) ───────────────────────────────
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_student_email) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_DUPLICATE_EMAIL: A user with this email address already exists.';
  END IF;

  -- ── Admission number uniqueness (per institute) ───────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.students
     WHERE institute_id = p_institute_id
       AND lower(admission_no) = lower(trim(p_admission_no))
  ) THEN
    RAISE EXCEPTION 'ADMIT_STUDENT_DUPLICATE_ADMISSION_NO: This admission number is already in use.';
  END IF;

  -- ── Optional batch validation ─────────────────────────────────────────────
  IF p_batch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.batches b
       WHERE b.id = p_batch_id AND b.institute_id = p_institute_id
    ) THEN
      RAISE EXCEPTION 'ADMIT_STUDENT_INVALID_BATCH: The selected batch does not exist or does not belong to this institute.';
    END IF;
  END IF;

  v_student_user_id := gen_random_uuid();

  -- ── Step 1: auth user (student) — empty password until forgot-password ───
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
    '00000000-0000-0000-0000-000000000000',
    v_student_user_id,
    'authenticated',
    'authenticated',
    v_student_email,
    '',
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object(
      'name',         trim(p_name),
      'role',         'student',
      'institute_id', p_institute_id::text
    ),
    NOW(),
    NOW(),
    '', '', '', ''
  );

  -- ── Step 2: public.users (student) — upsert so trigger row gets phone/name ─
  INSERT INTO public.users (id, institute_id, role, name, email, phone, is_active)
  VALUES (
    v_student_user_id,
    p_institute_id,
    'student',
    trim(p_name),
    v_student_email,
    trim(p_phone),
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    institute_id = EXCLUDED.institute_id,
    role           = EXCLUDED.role,
    name           = EXCLUDED.name,
    email          = EXCLUDED.email,
    phone          = EXCLUDED.phone,
    is_active      = EXCLUDED.is_active;

  -- ── Step 3: students row — student fields ONLY ───────────────────────────
  INSERT INTO public.students (
    institute_id,
    user_id,
    admission_no,
    batch_id,
    aadhaar_masked,
    emergency_contact,
    status
  )
  VALUES (
    p_institute_id,
    v_student_user_id,
    trim(p_admission_no),
    p_batch_id,
    p_aadhaar_last4,
    p_emergency_contact,
    'active'
  )
  RETURNING id INTO v_student_id;

  -- ── Step 4: activity log (non-fatal) ──────────────────────────────────────
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
        'student_name',  trim(p_name),
        'admission_no',  trim(p_admission_no),
        'email',         v_student_email
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- ── Step 5: optional parent — separate users/parents/student_parents ───────
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

    -- 1) Reuse existing parents row in this institute (email OR phone)
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

    -- 2) Parent user profile exists but parents row missing — create parents row
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

    -- 3) Auth account exists globally — reuse institute parent (one parent → many children)
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

    -- 4) Brand-new parent account (email not registered anywhere)
    IF v_parent_id IS NULL THEN
      v_parent_user_id := gen_random_uuid();

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
        '00000000-0000-0000-0000-000000000000',
        v_parent_user_id,
        'authenticated',
        'authenticated',
        v_parent_email,
        '',
        NOW(),
        '{"provider": "email", "providers": ["email"]}',
        jsonb_build_object(
          'name',         v_parent_name,
          'role',         'parent',
          'institute_id', p_institute_id::text
        ),
        NOW(),
        NOW(),
        '', '', '', ''
      );

      INSERT INTO public.users (id, institute_id, role, name, email, phone, is_active)
      VALUES (
        v_parent_user_id,
        p_institute_id,
        'parent',
        v_parent_name,
        v_parent_email,
        v_parent_phone,
        TRUE
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
-- ============================================================
-- EduOS Migration 011 — Full LMS (Course Management & Learning System)
-- ============================================================
--
-- WHAT THIS MIGRATION DOES:
--
--  1.  lms_categories           — course subject categories
--  2.  lms_courses              — rich LMS course metadata
--  3.  lms_course_tags          — many-to-many tag associations
--  4.  lms_modules              — ordered course sections
--  5.  lms_lessons              — individual lessons (video/pdf/text/quiz/assignment)
--  6.  lms_lesson_materials     — supplementary materials per lesson
--  7.  lms_enrollments          — student ↔ course enrollment tracking
--  8.  lms_lesson_progress      — per-lesson completion tracking
--  9.  lms_course_progress      — aggregated progress (maintained by trigger)
-- 10.  lms_quizzes              — quiz definitions linked to lessons or courses
-- 11.  lms_quiz_questions       — MCQ / true-false / short-answer questions
-- 12.  lms_quiz_choices         — selectable answers for MCQ questions
-- 13.  lms_quiz_attempts        — student quiz attempt records
-- 14.  lms_quiz_attempt_answers — per-question answers within an attempt
-- 15.  lms_assignments          — teacher-issued assignments
-- 16.  lms_assignment_submissions — student file / text submissions
-- 17.  lms_certificates         — course-completion certificates (future-ready)
--
--  Includes: indexes, RLS policies, storage bucket declarations,
--            progress-aggregation trigger, updated_at triggers.
--
-- IDEMPOTENCY: uses IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS
-- DEPENDENCIES: Migrations 001–010 (institutes, users, students, batches,
--               update_updated_at_column trigger function)
-- ============================================================

-- ============================================================
-- SECTION 0 — Schema permissions (Supabase public schema guard)
-- ============================================================

GRANT USAGE, CREATE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================
-- SECTION 1 — Enums
-- ============================================================

DO $$ BEGIN
  CREATE TYPE lms_difficulty     AS ENUM ('beginner','intermediate','advanced','expert');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_visibility     AS ENUM ('public','institutional','private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_pricing        AS ENUM ('free','paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_course_status  AS ENUM ('draft','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_lesson_type    AS ENUM ('video','pdf','text','quiz','assignment','live');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_enroll_status  AS ENUM ('active','completed','dropped','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_quiz_qtype     AS ENUM ('mcq','true_false','short_answer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_attempt_status AS ENUM ('in_progress','submitted','graded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_sub_status     AS ENUM ('submitted','graded','returned','late');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SECTION 2 — lms_categories
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id  UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  slug          TEXT        NOT NULL,
  description   TEXT,
  color         TEXT        DEFAULT '#6366f1',   -- hex brand colour
  icon          TEXT        DEFAULT 'BookOpen',   -- lucide icon name
  position      INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institute_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lms_categories_institute ON public.lms_categories(institute_id);

-- ============================================================
-- SECTION 3 — lms_courses
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_courses (
  id                        UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id              UUID              NOT NULL REFERENCES public.institutes(id)  ON DELETE CASCADE,
  created_by                UUID              NOT NULL REFERENCES public.users(id),
  category_id               UUID              REFERENCES public.lms_categories(id)      ON DELETE SET NULL,

  -- Core metadata
  title                     TEXT              NOT NULL,
  subtitle                  TEXT,
  description               TEXT,
  slug                      TEXT              NOT NULL,

  -- Media
  thumbnail_url             TEXT,
  thumbnail_storage_path    TEXT,
  intro_video_url           TEXT,
  intro_video_storage_path  TEXT,

  -- Classification
  difficulty                lms_difficulty    NOT NULL DEFAULT 'beginner',
  language                  TEXT              NOT NULL DEFAULT 'English',
  tags                      TEXT[]            NOT NULL DEFAULT '{}',
  estimated_duration_mins   INTEGER           DEFAULT 0,

  -- Access control
  visibility                lms_visibility    NOT NULL DEFAULT 'institutional',
  pricing                   lms_pricing       NOT NULL DEFAULT 'free',
  price                     NUMERIC(10,2)     DEFAULT 0,

  -- Content structure (denormalised counters — kept in sync by triggers)
  total_modules             INTEGER           NOT NULL DEFAULT 0,
  total_lessons             INTEGER           NOT NULL DEFAULT 0,
  total_enrollments         INTEGER           NOT NULL DEFAULT 0,
  total_completions         INTEGER           NOT NULL DEFAULT 0,

  -- Publication
  status                    lms_course_status NOT NULL DEFAULT 'draft',
  is_featured               BOOLEAN           NOT NULL DEFAULT FALSE,
  published_at              TIMESTAMPTZ,

  -- Rich content
  prerequisites             TEXT[]            DEFAULT '{}',
  learning_outcomes         TEXT[]            DEFAULT '{}',

  -- Timestamps
  created_at                TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  UNIQUE (institute_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lms_courses_institute    ON public.lms_courses(institute_id);
CREATE INDEX IF NOT EXISTS idx_lms_courses_created_by  ON public.lms_courses(created_by);
CREATE INDEX IF NOT EXISTS idx_lms_courses_category    ON public.lms_courses(category_id);
CREATE INDEX IF NOT EXISTS idx_lms_courses_status      ON public.lms_courses(status);
CREATE INDEX IF NOT EXISTS idx_lms_courses_tags        ON public.lms_courses USING gin(tags);

-- ============================================================
-- SECTION 4 — lms_course_tags  (standalone tag registry)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_course_tag_registry (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  slug         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institute_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lms_tag_registry_institute ON public.lms_course_tag_registry(institute_id);

-- ============================================================
-- SECTION 5 — lms_modules (Course Sections)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_modules (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID        NOT NULL REFERENCES public.lms_courses(id)  ON DELETE CASCADE,
  institute_id UUID       NOT NULL REFERENCES public.institutes(id)   ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  position    INTEGER     NOT NULL DEFAULT 0,   -- 0-based display order
  is_published BOOLEAN    NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_modules_course    ON public.lms_modules(course_id);
CREATE INDEX IF NOT EXISTS idx_lms_modules_institute ON public.lms_modules(institute_id);

-- ============================================================
-- SECTION 6 — lms_lessons
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_lessons (
  id                    UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id             UUID             NOT NULL REFERENCES public.lms_modules(id)   ON DELETE CASCADE,
  course_id             UUID             NOT NULL REFERENCES public.lms_courses(id)   ON DELETE CASCADE,
  institute_id          UUID             NOT NULL REFERENCES public.institutes(id)    ON DELETE CASCADE,

  title                 TEXT             NOT NULL,
  description           TEXT,
  lesson_type           lms_lesson_type  NOT NULL DEFAULT 'video',
  position              INTEGER          NOT NULL DEFAULT 0,

  -- Access
  is_preview            BOOLEAN          NOT NULL DEFAULT FALSE,   -- free preview for non-enrolled
  is_published          BOOLEAN          NOT NULL DEFAULT FALSE,

  -- Video
  video_url             TEXT,                        -- external URL (YouTube, Vimeo)
  video_storage_path    TEXT,                        -- Supabase Storage path
  video_duration_secs   INTEGER          DEFAULT 0,

  -- Rich text content (for 'text' lesson type)
  content               TEXT,

  -- Timestamps
  created_at            TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_lessons_module    ON public.lms_lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_lms_lessons_course    ON public.lms_lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lms_lessons_institute ON public.lms_lessons(institute_id);
CREATE INDEX IF NOT EXISTS idx_lms_lessons_type      ON public.lms_lessons(lesson_type);

-- ============================================================
-- SECTION 7 — lms_lesson_materials (supplementary files)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_lesson_materials (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id        UUID        NOT NULL REFERENCES public.lms_lessons(id)  ON DELETE CASCADE,
  course_id        UUID        NOT NULL REFERENCES public.lms_courses(id)  ON DELETE CASCADE,
  institute_id     UUID        NOT NULL REFERENCES public.institutes(id)   ON DELETE CASCADE,
  uploaded_by      UUID        NOT NULL REFERENCES public.users(id),

  title            TEXT        NOT NULL,
  file_url         TEXT        NOT NULL,   -- signed-URL base path
  storage_path     TEXT        NOT NULL,
  file_type        TEXT        NOT NULL,   -- 'pdf','docx','pptx','image','zip','other'
  file_size_bytes  BIGINT      DEFAULT 0,
  is_downloadable  BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_materials_lesson    ON public.lms_lesson_materials(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lms_materials_course    ON public.lms_lesson_materials(course_id);
CREATE INDEX IF NOT EXISTS idx_lms_materials_institute ON public.lms_lesson_materials(institute_id);

-- ============================================================
-- SECTION 8 — lms_enrollments
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_enrollments (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID             NOT NULL REFERENCES public.lms_courses(id)  ON DELETE CASCADE,
  student_id      UUID             NOT NULL REFERENCES public.users(id)        ON DELETE CASCADE,
  institute_id    UUID             NOT NULL REFERENCES public.institutes(id)   ON DELETE CASCADE,
  enrolled_by     UUID             REFERENCES public.users(id),    -- admin/teacher who enrolled
  batch_id        UUID             REFERENCES public.batches(id),  -- bulk batch enrollment

  status          lms_enroll_status NOT NULL DEFAULT 'active',
  enrolled_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  dropped_at      TIMESTAMPTZ,

  -- Expiry (for time-limited access)
  expires_at      TIMESTAMPTZ,

  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  UNIQUE (course_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_lms_enrollments_course    ON public.lms_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_lms_enrollments_student   ON public.lms_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_enrollments_institute ON public.lms_enrollments(institute_id);
CREATE INDEX IF NOT EXISTS idx_lms_enrollments_batch     ON public.lms_enrollments(batch_id);
CREATE INDEX IF NOT EXISTS idx_lms_enrollments_status    ON public.lms_enrollments(status);

-- ============================================================
-- SECTION 9 — lms_lesson_progress
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_lesson_progress (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id     UUID        NOT NULL REFERENCES public.lms_enrollments(id) ON DELETE CASCADE,
  lesson_id         UUID        NOT NULL REFERENCES public.lms_lessons(id)     ON DELETE CASCADE,
  student_id        UUID        NOT NULL REFERENCES public.users(id)           ON DELETE CASCADE,
  course_id         UUID        NOT NULL REFERENCES public.lms_courses(id)     ON DELETE CASCADE,
  institute_id      UUID        NOT NULL REFERENCES public.institutes(id)      ON DELETE CASCADE,

  is_completed      BOOLEAN     NOT NULL DEFAULT FALSE,
  watch_seconds     INTEGER     NOT NULL DEFAULT 0,    -- video progress in seconds
  last_position_secs INTEGER    NOT NULL DEFAULT 0,    -- resume-point for video
  last_accessed_at  TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (enrollment_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lms_lp_enrollment ON public.lms_lesson_progress(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_lms_lp_lesson     ON public.lms_lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lms_lp_student    ON public.lms_lesson_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_lp_course     ON public.lms_lesson_progress(course_id);

-- ============================================================
-- SECTION 10 — lms_course_progress  (aggregated — maintained by trigger)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_course_progress (
  enrollment_id         UUID    PRIMARY KEY REFERENCES public.lms_enrollments(id) ON DELETE CASCADE,
  student_id            UUID    NOT NULL REFERENCES public.users(id),
  course_id             UUID    NOT NULL REFERENCES public.lms_courses(id),
  institute_id          UUID    NOT NULL REFERENCES public.institutes(id),

  completed_lessons     INTEGER NOT NULL DEFAULT 0,
  total_lessons         INTEGER NOT NULL DEFAULT 0,
  completion_pct        NUMERIC(5,2) NOT NULL DEFAULT 0,   -- 0.00 – 100.00
  total_watch_seconds   INTEGER NOT NULL DEFAULT 0,
  last_lesson_id        UUID    REFERENCES public.lms_lessons(id),
  last_accessed_at      TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_cp_student  ON public.lms_course_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_cp_course   ON public.lms_course_progress(course_id);

-- ============================================================
-- SECTION 11 — lms_quizzes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_quizzes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         UUID        NOT NULL REFERENCES public.lms_courses(id)   ON DELETE CASCADE,
  lesson_id         UUID        REFERENCES public.lms_lessons(id)            ON DELETE SET NULL,
  institute_id      UUID        NOT NULL REFERENCES public.institutes(id)    ON DELETE CASCADE,
  created_by        UUID        NOT NULL REFERENCES public.users(id),

  title             TEXT        NOT NULL,
  description       TEXT,
  time_limit_mins   INTEGER,                 -- NULL = unlimited
  passing_score     INTEGER     NOT NULL DEFAULT 70,   -- 0-100 %
  max_attempts      INTEGER     NOT NULL DEFAULT 3,
  shuffle_questions BOOLEAN     NOT NULL DEFAULT FALSE,
  show_answers      BOOLEAN     NOT NULL DEFAULT TRUE,  -- show correct answers after submit
  is_published      BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_quizzes_course    ON public.lms_quizzes(course_id);
CREATE INDEX IF NOT EXISTS idx_lms_quizzes_lesson    ON public.lms_quizzes(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lms_quizzes_institute ON public.lms_quizzes(institute_id);

-- ============================================================
-- SECTION 12 — lms_quiz_questions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_quiz_questions (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id       UUID           NOT NULL REFERENCES public.lms_quizzes(id)  ON DELETE CASCADE,
  question      TEXT           NOT NULL,
  question_type lms_quiz_qtype NOT NULL DEFAULT 'mcq',
  points        NUMERIC(5,2)   NOT NULL DEFAULT 1,
  position      INTEGER        NOT NULL DEFAULT 0,
  explanation   TEXT,                           -- shown after answer submission
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_qq_quiz ON public.lms_quiz_questions(quiz_id);

-- ============================================================
-- SECTION 13 — lms_quiz_choices
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_quiz_choices (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID        NOT NULL REFERENCES public.lms_quiz_questions(id) ON DELETE CASCADE,
  choice_text  TEXT        NOT NULL,
  is_correct   BOOLEAN     NOT NULL DEFAULT FALSE,
  position     INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lms_qc_question ON public.lms_quiz_choices(question_id);

-- ============================================================
-- SECTION 14 — lms_quiz_attempts
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_quiz_attempts (
  id            UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id       UUID              NOT NULL REFERENCES public.lms_quizzes(id)      ON DELETE CASCADE,
  enrollment_id UUID              NOT NULL REFERENCES public.lms_enrollments(id)  ON DELETE CASCADE,
  student_id    UUID              NOT NULL REFERENCES public.users(id)            ON DELETE CASCADE,
  institute_id  UUID              NOT NULL REFERENCES public.institutes(id)       ON DELETE CASCADE,

  score         NUMERIC(8,2)      NOT NULL DEFAULT 0,
  max_score     NUMERIC(8,2)      NOT NULL DEFAULT 0,
  percentage    NUMERIC(5,2)      NOT NULL DEFAULT 0,
  passed        BOOLEAN           NOT NULL DEFAULT FALSE,
  attempt_no    INTEGER           NOT NULL DEFAULT 1,

  status        lms_attempt_status NOT NULL DEFAULT 'in_progress',
  started_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  submitted_at  TIMESTAMPTZ,

  created_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_qa_quiz      ON public.lms_quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_lms_qa_student   ON public.lms_quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_qa_enroll    ON public.lms_quiz_attempts(enrollment_id);

-- ============================================================
-- SECTION 15 — lms_quiz_attempt_answers
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_quiz_attempt_answers (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id        UUID         NOT NULL REFERENCES public.lms_quiz_attempts(id)   ON DELETE CASCADE,
  question_id       UUID         NOT NULL REFERENCES public.lms_quiz_questions(id)  ON DELETE CASCADE,
  selected_choice_id UUID        REFERENCES public.lms_quiz_choices(id)             ON DELETE SET NULL,
  text_answer       TEXT,
  is_correct        BOOLEAN      NOT NULL DEFAULT FALSE,
  points_earned     NUMERIC(5,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lms_qaa_attempt  ON public.lms_quiz_attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_lms_qaa_question ON public.lms_quiz_attempt_answers(question_id);

-- ============================================================
-- SECTION 16 — lms_assignments
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_assignments (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id            UUID        NOT NULL REFERENCES public.lms_courses(id)   ON DELETE CASCADE,
  lesson_id            UUID        REFERENCES public.lms_lessons(id)            ON DELETE SET NULL,
  institute_id         UUID        NOT NULL REFERENCES public.institutes(id)    ON DELETE CASCADE,
  created_by           UUID        NOT NULL REFERENCES public.users(id),

  title                TEXT        NOT NULL,
  description          TEXT,
  instructions         TEXT,
  attachment_urls      TEXT[]      DEFAULT '{}',
  due_date             TIMESTAMPTZ,
  max_score            NUMERIC(8,2) DEFAULT 100,
  allow_late           BOOLEAN     NOT NULL DEFAULT FALSE,
  is_published         BOOLEAN     NOT NULL DEFAULT FALSE,
  accepted_file_types  TEXT[]      DEFAULT '{}',   -- ['pdf','docx','zip']

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_assign_course    ON public.lms_assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_lms_assign_lesson    ON public.lms_assignments(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lms_assign_institute ON public.lms_assignments(institute_id);

-- ============================================================
-- SECTION 17 — lms_assignment_submissions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_assignment_submissions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID          NOT NULL REFERENCES public.lms_assignments(id)   ON DELETE CASCADE,
  enrollment_id   UUID          NOT NULL REFERENCES public.lms_enrollments(id)   ON DELETE CASCADE,
  student_id      UUID          NOT NULL REFERENCES public.users(id)             ON DELETE CASCADE,
  institute_id    UUID          NOT NULL REFERENCES public.institutes(id)        ON DELETE CASCADE,

  file_urls       TEXT[]        DEFAULT '{}',
  storage_paths   TEXT[]        DEFAULT '{}',
  text_response   TEXT,

  status          lms_sub_status NOT NULL DEFAULT 'submitted',
  submitted_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  is_late         BOOLEAN        NOT NULL DEFAULT FALSE,

  grade           NUMERIC(8,2),
  feedback        TEXT,
  graded_by       UUID           REFERENCES public.users(id),
  graded_at       TIMESTAMPTZ,

  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_lms_sub_assignment ON public.lms_assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_lms_sub_student    ON public.lms_assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_sub_enrollment ON public.lms_assignment_submissions(enrollment_id);

-- ============================================================
-- SECTION 18 — lms_certificates
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_certificates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id    UUID        NOT NULL REFERENCES public.lms_enrollments(id)  ON DELETE CASCADE,
  student_id       UUID        NOT NULL REFERENCES public.users(id),
  course_id        UUID        NOT NULL REFERENCES public.lms_courses(id),
  institute_id     UUID        NOT NULL REFERENCES public.institutes(id),

  certificate_no   TEXT        NOT NULL,  -- human-readable cert number
  certificate_url  TEXT,                  -- Supabase Storage path for PDF
  certificate_data JSONB       DEFAULT '{}',

  issued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ,

  UNIQUE (enrollment_id),
  UNIQUE (certificate_no)
);

CREATE INDEX IF NOT EXISTS idx_lms_cert_student ON public.lms_certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_cert_course  ON public.lms_certificates(course_id);

-- ============================================================
-- SECTION 19 — updated_at triggers
-- (reuses update_updated_at_column() from migration 002)
-- ============================================================
DROP TRIGGER IF EXISTS trg_lms_categories_updated_at ON public.lms_categories;
CREATE TRIGGER trg_lms_categories_updated_at
  BEFORE UPDATE ON public.lms_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_courses_updated_at ON public.lms_courses;
CREATE TRIGGER trg_lms_courses_updated_at
  BEFORE UPDATE ON public.lms_courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_modules_updated_at ON public.lms_modules;
CREATE TRIGGER trg_lms_modules_updated_at
  BEFORE UPDATE ON public.lms_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_lessons_updated_at ON public.lms_lessons;
CREATE TRIGGER trg_lms_lessons_updated_at
  BEFORE UPDATE ON public.lms_lessons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_enrollments_updated_at ON public.lms_enrollments;
CREATE TRIGGER trg_lms_enrollments_updated_at
  BEFORE UPDATE ON public.lms_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_lp_updated_at ON public.lms_lesson_progress;
CREATE TRIGGER trg_lms_lp_updated_at
  BEFORE UPDATE ON public.lms_lesson_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_quizzes_updated_at ON public.lms_quizzes;
CREATE TRIGGER trg_lms_quizzes_updated_at
  BEFORE UPDATE ON public.lms_quizzes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_assignments_updated_at ON public.lms_assignments;
CREATE TRIGGER trg_lms_assignments_updated_at
  BEFORE UPDATE ON public.lms_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_sub_updated_at ON public.lms_assignment_submissions;
CREATE TRIGGER trg_lms_sub_updated_at
  BEFORE UPDATE ON public.lms_assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SECTION 20 — Denormalised counter triggers
-- ============================================================

-- ── Keep lms_courses.total_lessons in sync ───────────────────────────────────
CREATE OR REPLACE FUNCTION lms_sync_lesson_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.lms_courses
  SET
    total_lessons = (
      SELECT COUNT(*) FROM public.lms_lessons
      WHERE course_id = COALESCE(NEW.course_id, OLD.course_id)
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.course_id, OLD.course_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_lms_sync_lesson_count ON public.lms_lessons;
CREATE TRIGGER trg_lms_sync_lesson_count
  AFTER INSERT OR UPDATE OR DELETE ON public.lms_lessons
  FOR EACH ROW EXECUTE FUNCTION lms_sync_lesson_count();

-- ── Keep lms_courses.total_modules in sync ───────────────────────────────────
CREATE OR REPLACE FUNCTION lms_sync_module_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.lms_courses
  SET
    total_modules = (
      SELECT COUNT(*) FROM public.lms_modules
      WHERE course_id = COALESCE(NEW.course_id, OLD.course_id)
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.course_id, OLD.course_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_lms_sync_module_count ON public.lms_modules;
CREATE TRIGGER trg_lms_sync_module_count
  AFTER INSERT OR UPDATE OR DELETE ON public.lms_modules
  FOR EACH ROW EXECUTE FUNCTION lms_sync_module_count();

-- ── Keep lms_courses.total_enrollments in sync ───────────────────────────────
CREATE OR REPLACE FUNCTION lms_sync_enrollment_count()
RETURNS TRIGGER AS $$
DECLARE
  v_course_id UUID;
BEGIN
  v_course_id := COALESCE(NEW.course_id, OLD.course_id);
  UPDATE public.lms_courses
  SET
    total_enrollments = (
      SELECT COUNT(*) FROM public.lms_enrollments
      WHERE course_id = v_course_id AND status = 'active'
    ),
    total_completions = (
      SELECT COUNT(*) FROM public.lms_enrollments
      WHERE course_id = v_course_id AND status = 'completed'
    ),
    updated_at = NOW()
  WHERE id = v_course_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_lms_sync_enrollment_count ON public.lms_enrollments;
CREATE TRIGGER trg_lms_sync_enrollment_count
  AFTER INSERT OR UPDATE OR DELETE ON public.lms_enrollments
  FOR EACH ROW EXECUTE FUNCTION lms_sync_enrollment_count();

-- ── Upsert lms_course_progress when lesson progress changes ──────────────────
CREATE OR REPLACE FUNCTION lms_update_course_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_total    INTEGER;
  v_done     INTEGER;
  v_watch    INTEGER;
  v_pct      NUMERIC(5,2);
  v_enroll   RECORD;
BEGIN
  SELECT * INTO v_enroll
  FROM public.lms_enrollments
  WHERE id = COALESCE(NEW.enrollment_id, OLD.enrollment_id);

  SELECT COUNT(*)          INTO v_total
  FROM public.lms_lessons
  WHERE course_id = v_enroll.course_id AND is_published = TRUE;

  SELECT COUNT(*), COALESCE(SUM(watch_seconds),0)
  INTO v_done, v_watch
  FROM public.lms_lesson_progress
  WHERE enrollment_id = v_enroll.id AND is_completed = TRUE;

  v_pct := CASE WHEN v_total > 0 THEN ROUND((v_done::NUMERIC / v_total) * 100, 2) ELSE 0 END;

  INSERT INTO public.lms_course_progress
    (enrollment_id, student_id, course_id, institute_id,
     completed_lessons, total_lessons, completion_pct,
     total_watch_seconds, last_lesson_id, last_accessed_at, updated_at)
  VALUES
    (v_enroll.id, v_enroll.student_id, v_enroll.course_id, v_enroll.institute_id,
     v_done, v_total, v_pct,
     v_watch,
     COALESCE(NEW.lesson_id, OLD.lesson_id),
     NOW(), NOW())
  ON CONFLICT (enrollment_id) DO UPDATE
    SET completed_lessons   = EXCLUDED.completed_lessons,
        total_lessons       = EXCLUDED.total_lessons,
        completion_pct      = EXCLUDED.completion_pct,
        total_watch_seconds = EXCLUDED.total_watch_seconds,
        last_lesson_id      = EXCLUDED.last_lesson_id,
        last_accessed_at    = EXCLUDED.last_accessed_at,
        updated_at          = NOW();

  -- Auto-complete enrollment when 100 %
  IF v_pct >= 100 THEN
    UPDATE public.lms_enrollments
    SET status = 'completed', completed_at = NOW()
    WHERE id = v_enroll.id AND status = 'active';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_lms_update_course_progress ON public.lms_lesson_progress;
CREATE TRIGGER trg_lms_update_course_progress
  AFTER INSERT OR UPDATE ON public.lms_lesson_progress
  FOR EACH ROW EXECUTE FUNCTION lms_update_course_progress();

-- ============================================================
-- SECTION 21 — Row Level Security
-- ============================================================

ALTER TABLE public.lms_categories             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_courses                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_course_tag_registry    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_modules                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_lessons                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_lesson_materials       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_enrollments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_lesson_progress        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_course_progress        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_quizzes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_quiz_questions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_quiz_choices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_quiz_attempts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_quiz_attempt_answers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_assignments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_certificates           ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: is current user admin or staff of the same institute?
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lms_is_instructor()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role IN ('admin','staff')
    AND institute_id = get_my_institute_id()
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: is current user the creator/owner of a course? (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION lms_is_course_owner(p_course_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lms_courses WHERE id = p_course_id AND created_by = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_categories
-- ─────────────────────────────────────────────────────────────────────────────
-- Make policies idempotent: drop existing policies before creating
DROP POLICY IF EXISTS "lms_cat_super_admin" ON public.lms_categories;
DROP POLICY IF EXISTS "lms_cat_admin_manage" ON public.lms_categories;
DROP POLICY IF EXISTS "lms_cat_student_read" ON public.lms_categories;

DROP POLICY IF EXISTS "lms_course_super_admin" ON public.lms_courses;
DROP POLICY IF EXISTS "lms_course_admin_manage" ON public.lms_courses;
DROP POLICY IF EXISTS "lms_course_staff_own" ON public.lms_courses;
DROP POLICY IF EXISTS "lms_course_staff_read" ON public.lms_courses;
DROP POLICY IF EXISTS "lms_course_student_enrolled" ON public.lms_courses;

DROP POLICY IF EXISTS "lms_mod_super_admin" ON public.lms_modules;
DROP POLICY IF EXISTS "lms_mod_admin" ON public.lms_modules;
DROP POLICY IF EXISTS "lms_mod_staff_own" ON public.lms_modules;
DROP POLICY IF EXISTS "lms_mod_student_enrolled" ON public.lms_modules;

DROP POLICY IF EXISTS "lms_lesson_super_admin" ON public.lms_lessons;
DROP POLICY IF EXISTS "lms_lesson_admin" ON public.lms_lessons;
DROP POLICY IF EXISTS "lms_lesson_staff_own" ON public.lms_lessons;
DROP POLICY IF EXISTS "lms_lesson_student" ON public.lms_lessons;

DROP POLICY IF EXISTS "lms_mat_super_admin" ON public.lms_lesson_materials;
DROP POLICY IF EXISTS "lms_mat_admin" ON public.lms_lesson_materials;
DROP POLICY IF EXISTS "lms_mat_staff_own" ON public.lms_lesson_materials;
DROP POLICY IF EXISTS "lms_mat_student_enrolled" ON public.lms_lesson_materials;

DROP POLICY IF EXISTS "lms_enroll_super_admin" ON public.lms_enrollments;
DROP POLICY IF EXISTS "lms_enroll_admin" ON public.lms_enrollments;
DROP POLICY IF EXISTS "lms_enroll_staff_read" ON public.lms_enrollments;
DROP POLICY IF EXISTS "lms_enroll_student_own" ON public.lms_enrollments;

DROP POLICY IF EXISTS "lms_lp_super_admin" ON public.lms_lesson_progress;
DROP POLICY IF EXISTS "lms_lp_admin_read" ON public.lms_lesson_progress;
DROP POLICY IF EXISTS "lms_lp_staff_read" ON public.lms_lesson_progress;
DROP POLICY IF EXISTS "lms_lp_student_own" ON public.lms_lesson_progress;

DROP POLICY IF EXISTS "lms_cp_super_admin" ON public.lms_course_progress;
DROP POLICY IF EXISTS "lms_cp_admin_read" ON public.lms_course_progress;
DROP POLICY IF EXISTS "lms_cp_staff_read" ON public.lms_course_progress;
DROP POLICY IF EXISTS "lms_cp_student_own" ON public.lms_course_progress;

DROP POLICY IF EXISTS "lms_quiz_admin" ON public.lms_quizzes;
DROP POLICY IF EXISTS "lms_quiz_staff_own" ON public.lms_quizzes;
DROP POLICY IF EXISTS "lms_quiz_student_enrolled" ON public.lms_quizzes;

DROP POLICY IF EXISTS "lms_qq_read" ON public.lms_quiz_questions;
DROP POLICY IF EXISTS "lms_qq_manage" ON public.lms_quiz_questions;

DROP POLICY IF EXISTS "lms_qc_read" ON public.lms_quiz_choices;
DROP POLICY IF EXISTS "lms_qc_manage" ON public.lms_quiz_choices;

DROP POLICY IF EXISTS "lms_qa_admin_read" ON public.lms_quiz_attempts;
DROP POLICY IF EXISTS "lms_qa_staff_read" ON public.lms_quiz_attempts;
DROP POLICY IF EXISTS "lms_qa_student_own" ON public.lms_quiz_attempts;

DROP POLICY IF EXISTS "lms_qaa_student_own" ON public.lms_quiz_attempt_answers;
DROP POLICY IF EXISTS "lms_qaa_instructor_read" ON public.lms_quiz_attempt_answers;

DROP POLICY IF EXISTS "lms_assign_admin" ON public.lms_assignments;
DROP POLICY IF EXISTS "lms_assign_staff_own" ON public.lms_assignments;
DROP POLICY IF EXISTS "lms_assign_student_enrolled" ON public.lms_assignments;

DROP POLICY IF EXISTS "lms_sub_admin_read" ON public.lms_assignment_submissions;
DROP POLICY IF EXISTS "lms_sub_staff_grade" ON public.lms_assignment_submissions;
DROP POLICY IF EXISTS "lms_sub_student_own" ON public.lms_assignment_submissions;

DROP POLICY IF EXISTS "lms_cert_admin" ON public.lms_certificates;
DROP POLICY IF EXISTS "lms_cert_student_own" ON public.lms_certificates;

-- Storage object policies
DROP POLICY IF EXISTS "lms_video_upload" ON storage.objects;
DROP POLICY IF EXISTS "lms_video_read" ON storage.objects;
DROP POLICY IF EXISTS "lms_video_delete" ON storage.objects;
DROP POLICY IF EXISTS "lms_mat_upload" ON storage.objects;
DROP POLICY IF EXISTS "lms_mat_read" ON storage.objects;
DROP POLICY IF EXISTS "lms_mat_delete" ON storage.objects;
DROP POLICY IF EXISTS "lms_thumb_upload" ON storage.objects;
DROP POLICY IF EXISTS "lms_asub_upload" ON storage.objects;
DROP POLICY IF EXISTS "lms_asub_read" ON storage.objects;
CREATE POLICY "lms_cat_super_admin" ON public.lms_categories
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_cat_admin_manage" ON public.lms_categories
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() IN ('admin','staff'))
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() IN ('admin','staff'));

CREATE POLICY "lms_cat_student_read" ON public.lms_categories
  FOR SELECT USING (institute_id = get_my_institute_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_courses — instructors manage, students read published+enrolled
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_course_super_admin" ON public.lms_courses
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_course_admin_manage" ON public.lms_courses
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

-- Staff can create & edit their own courses
CREATE POLICY "lms_course_staff_own" ON public.lms_courses
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  );

-- Staff can read all courses in their institute (for course listing)
CREATE POLICY "lms_course_staff_read" ON public.lms_courses
  FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

-- Students can only read published courses they are enrolled in
CREATE POLICY "lms_course_student_enrolled" ON public.lms_courses
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND status = 'published'
    AND (
      visibility = 'institutional'
      OR id IN (
        SELECT course_id FROM public.lms_enrollments
        WHERE student_id = auth.uid() AND status IN ('active','completed')
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_modules — mirror course permissions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_mod_super_admin" ON public.lms_modules
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_mod_admin" ON public.lms_modules
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_mod_staff_own" ON public.lms_modules
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_owner(course_id)
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_owner(course_id)
  );

CREATE POLICY "lms_mod_student_enrolled" ON public.lms_modules
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND course_id IN (
      SELECT course_id FROM public.lms_enrollments
      WHERE student_id = auth.uid() AND status IN ('active','completed')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_lessons
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_lesson_super_admin" ON public.lms_lessons
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_lesson_admin" ON public.lms_lessons
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_lesson_staff_own" ON public.lms_lessons
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_owner(course_id)
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_owner(course_id)
  );

-- Students: see published lessons if enrolled, or is_preview = TRUE
CREATE POLICY "lms_lesson_student" ON public.lms_lessons
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND is_published = TRUE
    AND (
      is_preview = TRUE
      OR course_id IN (
        SELECT course_id FROM public.lms_enrollments
        WHERE student_id = auth.uid() AND status IN ('active','completed')
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_lesson_materials
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_mat_super_admin" ON public.lms_lesson_materials
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_mat_admin" ON public.lms_lesson_materials
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_mat_staff_own" ON public.lms_lesson_materials
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND uploaded_by = auth.uid()
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "lms_mat_student_enrolled" ON public.lms_lesson_materials
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND course_id IN (
      SELECT course_id FROM public.lms_enrollments
      WHERE student_id = auth.uid() AND status IN ('active','completed')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_enrollments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_enroll_super_admin" ON public.lms_enrollments
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_enroll_admin" ON public.lms_enrollments
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_enroll_staff_read" ON public.lms_enrollments
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_owner(course_id)
  );

CREATE POLICY "lms_enroll_student_own" ON public.lms_enrollments
  FOR SELECT
  USING (student_id = auth.uid() AND get_my_role() = 'student');

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_lesson_progress & lms_course_progress
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_lp_super_admin" ON public.lms_lesson_progress
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_lp_admin_read" ON public.lms_lesson_progress
  FOR SELECT USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_lp_staff_read" ON public.lms_lesson_progress
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_owner(course_id)
  );

CREATE POLICY "lms_lp_student_own" ON public.lms_lesson_progress
  FOR ALL
  USING (student_id = auth.uid() AND get_my_role() = 'student')
  WITH CHECK (student_id = auth.uid() AND get_my_role() = 'student');

CREATE POLICY "lms_cp_super_admin" ON public.lms_course_progress
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_cp_admin_read" ON public.lms_course_progress
  FOR SELECT USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_cp_staff_read" ON public.lms_course_progress
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_owner(course_id)
  );

CREATE POLICY "lms_cp_student_own" ON public.lms_course_progress
  FOR ALL
  USING (student_id = auth.uid() AND get_my_role() = 'student')
  WITH CHECK (student_id = auth.uid() AND get_my_role() = 'student');

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_quizzes, lms_quiz_questions, lms_quiz_choices
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_quiz_admin" ON public.lms_quizzes
  FOR ALL USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_quiz_staff_own" ON public.lms_quizzes
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  );

CREATE POLICY "lms_quiz_student_enrolled" ON public.lms_quizzes
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND is_published = TRUE
    AND course_id IN (
      SELECT course_id FROM public.lms_enrollments
      WHERE student_id = auth.uid() AND status IN ('active','completed')
    )
  );

-- Questions & choices: follow quiz permissions (simplified — join-based)
CREATE POLICY "lms_qq_read" ON public.lms_quiz_questions
  FOR SELECT USING (
    quiz_id IN (
      SELECT id FROM public.lms_quizzes
      WHERE institute_id = get_my_institute_id()
    )
  );

CREATE POLICY "lms_qq_manage" ON public.lms_quiz_questions
  FOR ALL
  USING (
    quiz_id IN (
      SELECT id FROM public.lms_quizzes
      WHERE institute_id = get_my_institute_id()
      AND (get_my_role() = 'admin' OR created_by = auth.uid())
    )
  )
  WITH CHECK (
    quiz_id IN (
      SELECT id FROM public.lms_quizzes
      WHERE institute_id = get_my_institute_id()
      AND (get_my_role() = 'admin' OR created_by = auth.uid())
    )
  );

CREATE POLICY "lms_qc_read" ON public.lms_quiz_choices
  FOR SELECT USING (
    question_id IN (
      SELECT q.id FROM public.lms_quiz_questions q
      JOIN public.lms_quizzes qz ON qz.id = q.quiz_id
      WHERE qz.institute_id = get_my_institute_id()
    )
  );

CREATE POLICY "lms_qc_manage" ON public.lms_quiz_choices
  FOR ALL
  USING (
    question_id IN (
      SELECT q.id FROM public.lms_quiz_questions q
      JOIN public.lms_quizzes qz ON qz.id = q.quiz_id
      WHERE qz.institute_id = get_my_institute_id()
      AND (get_my_role() = 'admin' OR qz.created_by = auth.uid())
    )
  )
  WITH CHECK (
    question_id IN (
      SELECT q.id FROM public.lms_quiz_questions q
      JOIN public.lms_quizzes qz ON qz.id = q.quiz_id
      WHERE qz.institute_id = get_my_institute_id()
      AND (get_my_role() = 'admin' OR qz.created_by = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_quiz_attempts & lms_quiz_attempt_answers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_qa_admin_read" ON public.lms_quiz_attempts
  FOR SELECT USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_qa_staff_read" ON public.lms_quiz_attempts
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND quiz_id IN (
      SELECT id FROM public.lms_quizzes WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "lms_qa_student_own" ON public.lms_quiz_attempts
  FOR ALL
  USING (student_id = auth.uid() AND get_my_role() = 'student')
  WITH CHECK (student_id = auth.uid() AND get_my_role() = 'student');

CREATE POLICY "lms_qaa_student_own" ON public.lms_quiz_attempt_answers
  FOR ALL
  USING (
    attempt_id IN (
      SELECT id FROM public.lms_quiz_attempts WHERE student_id = auth.uid()
    )
  )
  WITH CHECK (
    attempt_id IN (
      SELECT id FROM public.lms_quiz_attempts WHERE student_id = auth.uid()
    )
  );

CREATE POLICY "lms_qaa_instructor_read" ON public.lms_quiz_attempt_answers
  FOR SELECT
  USING (
    attempt_id IN (
      SELECT a.id FROM public.lms_quiz_attempts a
      JOIN public.lms_quizzes q ON q.id = a.quiz_id
      WHERE q.institute_id = get_my_institute_id()
      AND (get_my_role() = 'admin' OR q.created_by = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_assignments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_assign_admin" ON public.lms_assignments
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_assign_staff_own" ON public.lms_assignments
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  );

CREATE POLICY "lms_assign_student_enrolled" ON public.lms_assignments
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND is_published = TRUE
    AND course_id IN (
      SELECT course_id FROM public.lms_enrollments
      WHERE student_id = auth.uid() AND status IN ('active','completed')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_assignment_submissions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_sub_admin_read" ON public.lms_assignment_submissions
  FOR SELECT USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_sub_staff_grade" ON public.lms_assignment_submissions
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND assignment_id IN (
      SELECT id FROM public.lms_assignments WHERE created_by = auth.uid()
    )
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND assignment_id IN (
      SELECT id FROM public.lms_assignments WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "lms_sub_student_own" ON public.lms_assignment_submissions
  FOR ALL
  USING (student_id = auth.uid() AND get_my_role() = 'student')
  WITH CHECK (student_id = auth.uid() AND get_my_role() = 'student');

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_certificates
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_cert_admin" ON public.lms_certificates
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_cert_student_own" ON public.lms_certificates
  FOR SELECT USING (student_id = auth.uid());

-- ============================================================
-- SECTION 22 — Storage Bucket Declarations
-- (Run via Supabase Dashboard / CLI — buckets are not DDL)
-- These INSERT statements create the buckets if they do not exist.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('lms-course-videos',
   'lms-course-videos',
   FALSE,
   5368709120,   -- 5 GB per file
   ARRAY['video/mp4','video/webm','video/ogg','video/quicktime']),

  ('lms-course-materials',
   'lms-course-materials',
   FALSE,
   104857600,    -- 100 MB per file
   ARRAY['application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-powerpoint',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/zip','image/png','image/jpeg','image/webp']),

  ('lms-thumbnails',
   'lms-thumbnails',
   TRUE,         -- public thumbnails are OK (no PII)
   5242880,      -- 5 MB per file
   ARRAY['image/png','image/jpeg','image/webp','image/gif']),

  ('lms-assignment-submissions',
   'lms-assignment-submissions',
   FALSE,
   52428800,     -- 50 MB per file
   ARRAY['application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/zip','image/png','image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS: each file path must be prefixed with institute_id ────────────

-- VIDEOS
CREATE POLICY "lms_video_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lms-course-videos'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

CREATE POLICY "lms_video_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lms-course-videos'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
  );

CREATE POLICY "lms_video_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lms-course-videos'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

-- MATERIALS
CREATE POLICY "lms_mat_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lms-course-materials'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

CREATE POLICY "lms_mat_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lms-course-materials'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
  );

CREATE POLICY "lms_mat_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lms-course-materials'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

-- THUMBNAILS (public bucket — storage path still scoped by institute)
CREATE POLICY "lms_thumb_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lms-thumbnails'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

-- ASSIGNMENT SUBMISSIONS
CREATE POLICY "lms_asub_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lms-assignment-submissions'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND get_my_role() IN ('student','admin','staff')
  );

CREATE POLICY "lms_asub_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lms-assignment-submissions'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
  );

-- ============================================================
-- SECTION 23 — Utility RPCs
-- ============================================================

-- get_lms_analytics: quick admin/staff summary for a course
CREATE OR REPLACE FUNCTION get_lms_course_analytics(p_course_id UUID)
RETURNS TABLE (
  total_enrollments   BIGINT,
  active_enrollments  BIGINT,
  completions         BIGINT,
  avg_completion_pct  NUMERIC,
  avg_quiz_score      NUMERIC,
  total_submissions   BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(e.id)                                          AS total_enrollments,
    COUNT(e.id) FILTER (WHERE e.status = 'active')      AS active_enrollments,
    COUNT(e.id) FILTER (WHERE e.status = 'completed')   AS completions,
    ROUND(AVG(cp.completion_pct), 2)                    AS avg_completion_pct,
    ROUND(AVG(qa.percentage), 2)                        AS avg_quiz_score,
    COUNT(DISTINCT sub.id)                              AS total_submissions
  FROM public.lms_enrollments          e
  LEFT JOIN public.lms_course_progress cp  ON cp.enrollment_id = e.id
  LEFT JOIN public.lms_quiz_attempts   qa  ON qa.enrollment_id = e.id
  LEFT JOIN public.lms_assignment_submissions sub ON sub.enrollment_id = e.id
  WHERE e.course_id = p_course_id
    AND e.institute_id = get_my_institute_id();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- END OF MIGRATION 011
-- ============================================================
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
-- ============================================================
-- EduOS Migration 012 — Fix RLS helper recursion
-- ============================================================
-- Ensures helper functions that read public.users bypass RLS
-- to avoid policy recursion errors (e.g., "infinite recursion").
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_institute_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT institute_id
  FROM public.users
  WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT role
  FROM public.users
  WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'super_admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.lms_is_instructor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role IN ('admin','staff')
      AND institute_id = get_my_institute_id()
  )
$$;
-- ============================================================
-- EduOS Migration 013 — Fix LMS RLS Recursion
-- ============================================================
-- Replaces direct table queries inside RLS policies with
-- SECURITY DEFINER functions to break infinite recursion
-- between lms_courses and lms_enrollments.
-- ============================================================

-- 1. Helper function for course creator check
CREATE OR REPLACE FUNCTION public.lms_is_course_creator(p_course_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lms_courses
    WHERE id = p_course_id
      AND created_by = auth.uid()
  )
$$;

-- 2. Helper function for course enrollment check
CREATE OR REPLACE FUNCTION public.lms_is_course_student(p_course_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lms_enrollments
    WHERE course_id = p_course_id
      AND student_id = auth.uid()
      AND status IN ('active', 'completed')
  )
$$;

-- 3. Update lms_courses policy
DROP POLICY IF EXISTS "lms_course_student_enrolled" ON public.lms_courses;
CREATE POLICY "lms_course_student_enrolled" ON public.lms_courses
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND status = 'published'
    AND (
      visibility = 'institutional'
      OR public.lms_is_course_student(id)
    )
  );

-- 4. Update lms_modules policies
DROP POLICY IF EXISTS "lms_mod_staff_own" ON public.lms_modules;
CREATE POLICY "lms_mod_staff_own" ON public.lms_modules
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  );

DROP POLICY IF EXISTS "lms_mod_student_enrolled" ON public.lms_modules;
CREATE POLICY "lms_mod_student_enrolled" ON public.lms_modules
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND public.lms_is_course_student(course_id)
  );

-- 5. Update lms_lessons policies
DROP POLICY IF EXISTS "lms_lesson_staff_own" ON public.lms_lessons;
CREATE POLICY "lms_lesson_staff_own" ON public.lms_lessons
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  );

DROP POLICY IF EXISTS "lms_lesson_student" ON public.lms_lessons;
CREATE POLICY "lms_lesson_student" ON public.lms_lessons
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND is_published = TRUE
    AND (
      is_preview = TRUE
      OR public.lms_is_course_student(course_id)
    )
  );

-- 6. Update lms_lesson_materials policies
DROP POLICY IF EXISTS "lms_mat_student_enrolled" ON public.lms_lesson_materials;
CREATE POLICY "lms_mat_student_enrolled" ON public.lms_lesson_materials
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND public.lms_is_course_student(course_id)
  );

-- 7. Update lms_enrollments policies
DROP POLICY IF EXISTS "lms_enroll_staff_read" ON public.lms_enrollments;
CREATE POLICY "lms_enroll_staff_read" ON public.lms_enrollments
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  );

-- 8. Update lms_lesson_progress & lms_course_progress
DROP POLICY IF EXISTS "lms_lp_staff_read" ON public.lms_lesson_progress;
CREATE POLICY "lms_lp_staff_read" ON public.lms_lesson_progress
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  );

DROP POLICY IF EXISTS "lms_cp_staff_read" ON public.lms_course_progress;
CREATE POLICY "lms_cp_staff_read" ON public.lms_course_progress
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  );

-- 9. Update lms_quizzes & assignments policies
DROP POLICY IF EXISTS "lms_quiz_student_enrolled" ON public.lms_quizzes;
CREATE POLICY "lms_quiz_student_enrolled" ON public.lms_quizzes
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND is_published = TRUE
    AND public.lms_is_course_student(course_id)
  );

DROP POLICY IF EXISTS "lms_assign_student_enrolled" ON public.lms_assignments;
CREATE POLICY "lms_assign_student_enrolled" ON public.lms_assignments
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND is_published = TRUE
    AND public.lms_is_course_student(course_id)
  );
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
-- ============================================================================
-- EduOS Migration 014 — Fee & Billing System Expansion
-- ============================================================================
--
-- This migration upgrades the existing fee stack into a full ERP billing model:
--   - fee_structures: richer metadata for templates and batch/course scoping
--   - student_fees: parent linkage, concessions, waivers, installment metadata
--   - fee_installments: schedule rows for installment-aware billing
--   - fee_payments / fee_receipts: parent linkage for fast parent visibility
--   - RLS and helper functions for institute / parent isolation
--
-- The existing fee tables from migration 005 are preserved and expanded so
-- existing dashboards keep working while the new relations become available.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Schema expansion
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS fee_name TEXT,
  ADD COLUMN IF NOT EXISTS fee_code TEXT,
  ADD COLUMN IF NOT EXISTS fee_type TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS installment_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS late_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurring_type TEXT NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS course_id UUID,
  ADD COLUMN IF NOT EXISTS installment_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.student_fees
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.parents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scholarship_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS concession_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waiver_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS installment_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_due_date DATE,
  ADD COLUMN IF NOT EXISTS bill_number TEXT,
  ADD COLUMN IF NOT EXISTS fee_type TEXT;

ALTER TABLE public.fee_payments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.parents(id) ON DELETE SET NULL;

ALTER TABLE public.fee_receipts
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.parents(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.fee_installments (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  student_fee_id   UUID          NOT NULL REFERENCES public.student_fees(id) ON DELETE CASCADE,
  institute_id     UUID          NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  installment_no   INTEGER       NOT NULL,
  due_date         DATE          NOT NULL,
  amount           NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  paid_amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status           TEXT          NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(student_fee_id, installment_no)
);

-- Backfill templates and assignment rows where possible.
UPDATE public.fee_structures
SET
  fee_name = COALESCE(fee_name, name),
  fee_code = COALESCE(fee_code, UPPER(REPLACE(name, ' ', '_'))),
  fee_type = COALESCE(fee_type, COALESCE(name, 'custom')),
  recurring_type = COALESCE(recurring_type, frequency),
  installment_count = CASE
    WHEN installment_count IS NULL OR installment_count < 1 THEN 1
    WHEN frequency = 'monthly' THEN GREATEST(installment_count, 12)
    WHEN frequency = 'quarterly' THEN GREATEST(installment_count, 4)
    ELSE GREATEST(installment_count, 1)
  END;

UPDATE public.student_fees sf
SET
  fee_type = COALESCE(sf.fee_type, fs.fee_type, fs.name),
  parent_id = COALESCE(
    sf.parent_id,
    (
      SELECT sp.parent_id
      FROM public.student_parents sp
      WHERE sp.student_id = sf.student_id
      ORDER BY sp.parent_id ASC
      LIMIT 1
    )
  ),
  installment_count = COALESCE(sf.installment_count, fs.installment_count, 1),
  next_due_date = COALESCE(sf.next_due_date, sf.due_date),
  bill_number = COALESCE(sf.bill_number, 'BILL-' || substr(sf.id::text, 1, 8))
FROM public.fee_structures fs
WHERE fs.id = sf.fee_structure_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Constraints / indexes
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fee_structures
  DROP CONSTRAINT IF EXISTS fee_structures_late_fee_nonnegative;

ALTER TABLE public.fee_structures
  ADD CONSTRAINT fee_structures_late_fee_nonnegative CHECK (late_fee >= 0);

ALTER TABLE public.student_fees
  DROP CONSTRAINT IF EXISTS student_fees_adjustments_nonnegative;

ALTER TABLE public.student_fees
  ADD CONSTRAINT student_fees_adjustments_nonnegative CHECK (
    scholarship_amount >= 0 AND concession_amount >= 0 AND waiver_amount >= 0
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_structures_institute_fee_code
  ON public.fee_structures(institute_id, fee_code)
  WHERE fee_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fee_structures_batch_id ON public.fee_structures(batch_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_course_id ON public.fee_structures(course_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_fee_type ON public.fee_structures(fee_type);

CREATE INDEX IF NOT EXISTS idx_student_fees_parent_id ON public.student_fees(parent_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_bill_number ON public.student_fees(bill_number);
CREATE INDEX IF NOT EXISTS idx_student_fees_next_due_date ON public.student_fees(next_due_date);
CREATE INDEX IF NOT EXISTS idx_student_fees_fee_type ON public.student_fees(fee_type);

CREATE INDEX IF NOT EXISTS idx_fee_payments_parent_id ON public.fee_payments(parent_id);
CREATE INDEX IF NOT EXISTS idx_fee_receipts_parent_id ON public.fee_receipts(parent_id);
CREATE INDEX IF NOT EXISTS idx_fee_installments_student_fee_id ON public.fee_installments(student_fee_id);
CREATE INDEX IF NOT EXISTS idx_fee_installments_institute_id ON public.fee_installments(institute_id);
CREATE INDEX IF NOT EXISTS idx_fee_installments_due_date ON public.fee_installments(due_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Helper functions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_primary_parent_id(p_student_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.parent_id
  FROM public.student_parents sp
  WHERE sp.student_id = p_student_id
  ORDER BY sp.parent_id ASC
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.resolve_primary_parent_id(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_fee_installment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.paid_amount >= NEW.amount THEN
    NEW.status := 'paid';
  ELSIF NEW.paid_amount > 0 THEN
    NEW.status := 'partial';
  ELSE
    NEW.status := 'pending';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_installments_sync_status ON public.fee_installments;
CREATE TRIGGER fee_installments_sync_status
  BEFORE INSERT OR UPDATE ON public.fee_installments
  FOR EACH ROW EXECUTE FUNCTION public.sync_fee_installment_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Installment schedule generator
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_fee_installments(
  p_student_fee_id UUID,
  p_total_amount NUMERIC,
  p_due_date DATE,
  p_installment_count INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining NUMERIC := p_total_amount;
  v_installment_amount NUMERIC;
  v_i INTEGER;
  v_installments INTEGER := GREATEST(COALESCE(p_installment_count, 1), 1);
BEGIN
  DELETE FROM public.fee_installments WHERE student_fee_id = p_student_fee_id;

  IF v_installments = 1 THEN
    INSERT INTO public.fee_installments (student_fee_id, institute_id, installment_no, due_date, amount)
    SELECT id, institute_id, 1, p_due_date, p_total_amount
    FROM public.student_fees
    WHERE id = p_student_fee_id;
    RETURN;
  END IF;

  v_installment_amount := ROUND(p_total_amount / v_installments, 2);

  FOR v_i IN 1..v_installments LOOP
    IF v_i = v_installments THEN
      v_installment_amount := v_remaining;
    END IF;

    INSERT INTO public.fee_installments (student_fee_id, institute_id, installment_no, due_date, amount)
    SELECT
      sf.id,
      sf.institute_id,
      v_i,
      (p_due_date + ((v_i - 1) * INTERVAL '30 days'))::date,
      GREATEST(v_installment_amount, 0)
    FROM public.student_fees sf
    WHERE sf.id = p_student_fee_id;

    v_remaining := GREATEST(v_remaining - v_installment_amount, 0);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_fee_installments(UUID, NUMERIC, DATE, INTEGER) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) RLS policies for parent visibility
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fee_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_fee_installments" ON public.fee_installments;
DROP POLICY IF EXISTS "admin_institute_fee_installments" ON public.fee_installments;
DROP POLICY IF EXISTS "parent_read_linked_fee_installments" ON public.fee_installments;
DROP POLICY IF EXISTS "student_read_own_fee_installments" ON public.fee_installments;

CREATE POLICY "super_admin_all_fee_installments"
  ON public.fee_installments FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "admin_institute_fee_installments"
  ON public.fee_installments FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  );

CREATE POLICY "student_read_own_fee_installments"
  ON public.fee_installments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_fees sf
      JOIN public.students s ON s.id = sf.student_id
      JOIN public.users u ON u.id = s.user_id
      WHERE sf.id = fee_installments.student_fee_id
        AND u.id = auth.uid()
    )
  );

CREATE POLICY "parent_read_linked_fee_installments"
  ON public.fee_installments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_fees sf
      JOIN public.student_parents sp ON sp.student_id = sf.student_id
      JOIN public.parents p ON p.id = sp.parent_id
      JOIN public.users u ON u.id = p.user_id
      WHERE sf.id = fee_installments.student_fee_id
        AND u.id = auth.uid()
    )
  );

-- Parent-aware visibility for fee tables.
DROP POLICY IF EXISTS "parent_read_linked_student_fees" ON public.student_fees;
CREATE POLICY "parent_read_linked_student_fees"
  ON public.student_fees FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_parents sp
      JOIN public.parents p ON p.id = sp.parent_id
      JOIN public.users u ON u.id = p.user_id
      WHERE sp.student_id = student_fees.student_id
        AND u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "parent_read_linked_fee_payments" ON public.fee_payments;
CREATE POLICY "parent_read_linked_fee_payments"
  ON public.fee_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_parents sp
      JOIN public.parents p ON p.id = sp.parent_id
      JOIN public.users u ON u.id = p.user_id
      WHERE sp.student_id = fee_payments.student_id
        AND u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "parent_read_linked_fee_receipts" ON public.fee_receipts;
CREATE POLICY "parent_read_linked_fee_receipts"
  ON public.fee_receipts FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_fees sf
      JOIN public.student_parents sp ON sp.student_id = sf.student_id
      JOIN public.parents p ON p.id = sp.parent_id
      JOIN public.users u ON u.id = p.user_id
      WHERE sf.id = (
        SELECT fp.student_fee_id
        FROM public.fee_payments fp
        WHERE fp.id = fee_receipts.payment_id
      )
        AND u.id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Refresh install-time defaults for existing rows
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.fee_structures
SET fee_name = COALESCE(fee_name, name),
    fee_code = COALESCE(fee_code, UPPER(REPLACE(name, ' ', '_'))),
    fee_type = COALESCE(fee_type, name),
    recurring_type = COALESCE(recurring_type, frequency),
    installment_allowed = COALESCE(installment_allowed, FALSE),
    late_fee = COALESCE(late_fee, 0),
    installment_count = COALESCE(NULLIF(installment_count, 0), 1)
WHERE TRUE;

UPDATE public.student_fees
SET parent_id = COALESCE(parent_id, public.resolve_primary_parent_id(student_id)),
    scholarship_amount = COALESCE(scholarship_amount, 0),
    concession_amount = COALESCE(concession_amount, 0),
    waiver_amount = COALESCE(waiver_amount, 0),
    installment_count = COALESCE(NULLIF(installment_count, 0), 1),
    next_due_date = COALESCE(next_due_date, due_date),
    bill_number = COALESCE(bill_number, 'BILL-' || substr(id::text, 1, 8)),
    fee_type = COALESCE(fee_type, 'custom')
WHERE TRUE;
-- Fix for storage policies to allow upsert (SELECT and UPDATE)

-- VIDEOS
DROP POLICY IF EXISTS "lms_video_update" ON storage.objects;
CREATE POLICY "lms_video_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lms-course-videos'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

-- MATERIALS
DROP POLICY IF EXISTS "lms_mat_update" ON storage.objects;
CREATE POLICY "lms_mat_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lms-course-materials'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

-- THUMBNAILS
DROP POLICY IF EXISTS "lms_thumb_update" ON storage.objects;
CREATE POLICY "lms_thumb_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lms-thumbnails'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

DROP POLICY IF EXISTS "lms_thumb_read" ON storage.objects;
CREATE POLICY "lms_thumb_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lms-thumbnails'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
  );

-- SUBMISSIONS
DROP POLICY IF EXISTS "lms_asub_update" ON storage.objects;
CREATE POLICY "lms_asub_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lms-assignment-submissions'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND get_my_role() IN ('student','admin','staff')
  );
-- ============================================================
-- EduOS Migration 015 — LMS course form fixes
-- ============================================================
-- 1. Allow students to read published public courses without enrollment
-- 2. Allow staff to enroll students in courses they created
-- ============================================================

-- 1. Public visibility: students can browse published public courses
DROP POLICY IF EXISTS "lms_course_student_enrolled" ON public.lms_courses;
CREATE POLICY "lms_course_student_enrolled" ON public.lms_courses
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND status = 'published'
    AND (
      visibility = 'public'
      OR visibility = 'institutional'
      OR public.lms_is_course_student(id)
    )
  );

-- Students can browse all published courses in their institute (catalog view)
CREATE POLICY "lms_course_student_browse_published" ON public.lms_courses
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND status = 'published'
  );

-- 2. Staff can manage enrollments for their own courses
CREATE POLICY "lms_enroll_staff_manage_own" ON public.lms_enrollments
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  );
-- Parent portal read access for linked child analytics.
--
-- These policies expose read-only access for parents to the data needed by the
-- parent dashboard: batches, courses, linked enrollments, attendance history,
-- student history, and uploaded documents.

-- ── batches ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "parent_read_linked_batches" ON public.batches;

CREATE POLICY "parent_read_linked_batches"
  ON public.batches FOR SELECT
  USING (
    id IN (
      SELECT DISTINCT s.batch_id
      FROM public.students s
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
        AND s.batch_id IS NOT NULL
    )
  );

-- ── courses ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "parent_read_linked_courses" ON public.courses;

CREATE POLICY "parent_read_linked_courses"
  ON public.courses FOR SELECT
  USING (
    id IN (
      SELECT DISTINCT sc.course_id
      FROM public.student_courses sc
      JOIN public.students s ON s.id = sc.student_id
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── student_courses ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "parent_read_linked_student_courses" ON public.student_courses;

CREATE POLICY "parent_read_linked_student_courses"
  ON public.student_courses FOR SELECT
  USING (
    student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── student_documents ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "parent_read_linked_student_documents" ON public.student_documents;

CREATE POLICY "parent_read_linked_student_documents"
  ON public.student_documents FOR SELECT
  USING (
    student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── student_history ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "parent_read_linked_student_history" ON public.student_history;

CREATE POLICY "parent_read_linked_student_history"
  ON public.student_history FOR SELECT
  USING (
    student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── attendance_records ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "parent_read_linked_attendance_records" ON public.attendance_records;

CREATE POLICY "parent_read_linked_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (
    student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── attendance_sessions ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "parent_read_linked_attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "parent_read_linked_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    id IN (
      SELECT DISTINCT ar.session_id
      FROM public.attendance_records ar
      JOIN public.students s ON s.id = ar.student_id
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );
-- Drop the existing constraint
ALTER TABLE public.lms_course_progress 
  DROP CONSTRAINT IF EXISTS lms_course_progress_last_lesson_id_fkey;

-- Re-add it with ON DELETE SET NULL
ALTER TABLE public.lms_course_progress
  ADD CONSTRAINT lms_course_progress_last_lesson_id_fkey 
  FOREIGN KEY (last_lesson_id) 
  REFERENCES public.lms_lessons(id) 
  ON DELETE SET NULL;
-- ============================================================
-- EduOS Migration 016 — Fix lesson materials upload for staff
-- Staff can manage materials on courses they created (not only rows they uploaded).
-- ============================================================

DROP POLICY IF EXISTS "lms_mat_staff_own" ON public.lms_lesson_materials;

CREATE POLICY "lms_mat_staff_own" ON public.lms_lesson_materials
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND public.lms_is_course_creator(course_id)
  );
-- ============================================================================
-- Migration 016 — Resilient Profiles & Self-Healing Triggers
-- ============================================================================
--
-- GOAL:
--  Ensure that every user created in auth.users with a specific role (parent, 
--  student, staff) automatically has their corresponding sub-profile record 
--  created in public.parents, public.students, or public.staff.
--
--  This prevents "Profile not found" errors if an RPC fails or if users are 
--  created manually via the Supabase dashboard.
--
-- ============================================================================

SET LOCAL ROLE postgres;

-- ── 1. Update handle_new_user Trigger ───────────────────────────────────────
--
-- Makes the trigger role-aware so it auto-populates sub-profile tables.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role         public.user_role;
  v_institute_id UUID;
  v_name         TEXT;
BEGIN
  v_role         := COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'student');
  v_institute_id := (NEW.raw_user_meta_data->>'institute_id')::UUID;
  v_name         := COALESCE(NEW.raw_user_meta_data->>'name', NEW.email);

  -- ── Self-registration path ──────────────────────────────────────────────
  -- institute_id is NOT known at signUp time for the register-institute
  -- flow. The register_institute() RPC handles this path atomically 
  -- after auth.signUp() returns. Skip here to avoid NOT NULL failures.
  IF v_institute_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Ensure public.users entry exists
  INSERT INTO public.users (id, institute_id, role, name, email, is_active)
  VALUES (NEW.id, v_institute_id, v_role, v_name, NEW.email, TRUE)
  ON CONFLICT (id) DO UPDATE SET
    institute_id = COALESCE(EXCLUDED.institute_id, users.institute_id),
    role         = EXCLUDED.role,
    name         = EXCLUDED.name,
    email        = EXCLUDED.email;

  -- Role-based auto-population (Self-healing)
  IF v_role = 'parent' THEN
    INSERT INTO public.parents (institute_id, user_id)
    VALUES (v_institute_id, NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    
  ELSIF v_role = 'staff' THEN
    INSERT INTO public.staff (institute_id, user_id)
    VALUES (v_institute_id, NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    
  -- Note: Students usually need an admission number, so we don't auto-create 
  -- them here as it might result in records missing required data. 
  -- Admission numbers are best handled by the dedicated RPC.
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. Self-Healing Script ──────────────────────────────────────────────────
--
-- Fix existing orphaned users who have the role but no profile record.

-- Fix orphaned parents
INSERT INTO public.parents (institute_id, user_id)
SELECT institute_id, id
  FROM public.users
 WHERE role = 'parent'
   AND id NOT IN (SELECT user_id FROM public.parents)
ON CONFLICT (user_id) DO NOTHING;

-- Fix orphaned staff
INSERT INTO public.staff (institute_id, user_id)
SELECT institute_id, id
  FROM public.users
 WHERE role = 'staff'
   AND id NOT IN (SELECT user_id FROM public.staff)
ON CONFLICT (user_id) DO NOTHING;

-- ── 3. Verification ─────────────────────────────────────────────────────────
-- Ensure RLS allows parents to see their own records (sanity check)

DROP POLICY IF EXISTS "parent_read_own" ON public.parents;
CREATE POLICY "parent_read_own"
  ON public.parents FOR SELECT
  USING (user_id = auth.uid());
-- ============================================================
-- EduOS Migration 017 — Complete Staff Management System
-- ============================================================

-- ── 1. Enhance staff table ───────────────────────────────────
-- Safely add columns to the existing staff table
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS qualification TEXT,
  ADD COLUMN IF NOT EXISTS joining_date DATE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- ── 2. Create roles table ────────────────────────────────────
-- Drop if exists to "replace with new" as requested
DROP TABLE IF EXISTS public.roles CASCADE;
CREATE TABLE public.roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  permissions  JSONB NOT NULL DEFAULT '[]', -- Array of permission strings
  is_custom    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(institute_id, name)
);

-- ── 3. Create staff_assignments table ────────────────────────
-- Drop if exists to "replace with new" as requested
DROP TABLE IF EXISTS public.staff_assignments CASCADE;
CREATE TABLE public.staff_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  staff_id     UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  course_name  TEXT, 
  batch_id     UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  subject_name TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Row Level Security (RLS) ──────────────────────────────
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_assignments ENABLE ROW LEVEL SECURITY;

-- Roles policies
-- Correct DROP POLICY syntax: DROP POLICY [IF EXISTS] name ON table
DROP POLICY IF EXISTS "super_admin_all_roles" ON public.roles;
CREATE POLICY "super_admin_all_roles" ON public.roles FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "admin_manage_roles" ON public.roles;
CREATE POLICY "admin_manage_roles" ON public.roles FOR ALL USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

DROP POLICY IF EXISTS "staff_read_roles" ON public.roles;
CREATE POLICY "staff_read_roles" ON public.roles FOR SELECT USING (institute_id = get_my_institute_id());

-- Staff assignments policies
DROP POLICY IF EXISTS "super_admin_all_assignments" ON public.staff_assignments;
CREATE POLICY "super_admin_all_assignments" ON public.staff_assignments FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "admin_manage_assignments" ON public.staff_assignments;
CREATE POLICY "admin_manage_assignments" ON public.staff_assignments FOR ALL USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

DROP POLICY IF EXISTS "staff_read_assignments" ON public.staff_assignments;
CREATE POLICY "staff_read_assignments" ON public.staff_assignments FOR SELECT USING (institute_id = get_my_institute_id());

-- ── 5. admit_staff() RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_staff_profile(
  p_user_id       UUID,
  p_institute_id  UUID,
  p_name          TEXT,
  p_email         TEXT,
  p_phone         TEXT,
  p_designation   TEXT,
  p_department    TEXT,
  p_qualification TEXT,
  p_joining_date  DATE,
  p_role_name     TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  -- 1. Insert into public.users (handle_new_user trigger may have already done this)
  INSERT INTO public.users (id, institute_id, role, name, email, phone, is_active)
  VALUES (p_user_id, p_institute_id, 'staff', p_name, p_email, p_phone, TRUE)
  ON CONFLICT (id) DO UPDATE SET
    phone = EXCLUDED.phone,
    name = EXCLUDED.name;

  -- 2. Insert into public.staff
  INSERT INTO public.staff (
    institute_id,
    user_id,
    designation,
    department,
    qualification,
    joining_date,
    is_active
  )
  VALUES (
    p_institute_id,
    p_user_id,
    p_designation,
    p_department,
    p_qualification,
    p_joining_date,
    TRUE
  )
  RETURNING id INTO v_staff_id;

  -- 3. Log activity
  INSERT INTO public.activity_logs (
    institute_id, user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_institute_id,
    auth.uid(),
    'staff.admitted',
    'staff',
    v_staff_id,
    jsonb_build_object(
      'name', p_name,
      'email', p_email,
      'role', p_role_name
    )
  );

  RETURN json_build_object('staff_id', v_staff_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_staff_profile TO authenticated;

-- ── 6. Updated Staff Policies ────────────────────────────────
-- Grant admin full access to staff within their institute
DROP POLICY IF EXISTS "admin_institute_staff" ON public.staff;
CREATE POLICY "admin_institute_staff"
  ON public.staff FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

-- Staff can read their own record
DROP POLICY IF EXISTS "staff_read_own" ON public.staff;
CREATE POLICY "staff_read_own"
  ON public.staff FOR SELECT
  USING (user_id = auth.uid());

-- Staff can read other staff in the same institute (for collaboration)
DROP POLICY IF EXISTS "staff_read_institute_staff" ON public.staff;
CREATE POLICY "staff_read_institute_staff"
  ON public.staff FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');
-- ============================================================
-- EduOS Migration 017 — Student self-enrollment
-- Allows students to enroll in published public/institutional courses.
-- ============================================================

CREATE POLICY "lms_enroll_student_self" ON public.lms_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
    AND enrolled_by = auth.uid()
    AND course_id IN (
      SELECT id FROM public.lms_courses
      WHERE institute_id = get_my_institute_id()
        AND status = 'published'
        AND visibility IN ('public', 'institutional')
    )
  );

-- Students may update their own enrollment row (e.g. re-activate via upsert path)
CREATE POLICY "lms_enroll_student_self_update" ON public.lms_enrollments
  FOR UPDATE TO authenticated
  USING (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
  )
  WITH CHECK (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
    AND status IN ('active', 'completed')
  );
-- ============================================================
-- EduOS Migration 018 — Schedule / Timetable Management System
-- ============================================================
-- Tables: subjects, sections, rooms, schedules, schedule_exceptions
-- RPCs: check_schedule_conflicts, duplicate_week_schedules
-- RLS: admin write, staff/student/parent scoped read
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE schedule_type AS ENUM ('regular', 'exam', 'break', 'lunch', 'event');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE schedule_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE schedule_exception_type AS ENUM ('holiday', 'cancelled', 'rescheduled', 'event');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Subjects catalog ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subjects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  code         TEXT,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institute_id, name)
);

-- ── Sections (divisions within a batch) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  batch_id     UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, name)
);

-- ── Rooms ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  room_name    TEXT NOT NULL,
  capacity     INTEGER,
  building     TEXT,
  floor        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institute_id, room_name)
);

-- ── Schedules (timetable slots) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  batch_id     UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  section_id   UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  subject_id   UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id   UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  room_id      UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  type         schedule_type NOT NULL DEFAULT 'regular',
  status       schedule_status NOT NULL DEFAULT 'draft',
  title        TEXT,
  notes        TEXT,
  week_label   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schedules_valid_time CHECK (end_time > start_time)
);

-- ── Schedule exceptions (holidays, cancellations, events) ─────────────────────
CREATE TABLE IF NOT EXISTS public.schedule_exceptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  batch_id     UUID REFERENCES public.batches(id) ON DELETE CASCADE,
  schedule_id  UUID REFERENCES public.schedules(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  type         schedule_exception_type NOT NULL DEFAULT 'holiday',
  title        TEXT NOT NULL,
  description  TEXT,
  replacement_start TIME,
  replacement_end   TIME,
  is_all_day   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_subjects_institute ON public.subjects (institute_id);
CREATE INDEX IF NOT EXISTS idx_sections_batch ON public.sections (batch_id);
CREATE INDEX IF NOT EXISTS idx_rooms_institute ON public.rooms (institute_id);
CREATE INDEX IF NOT EXISTS idx_schedules_institute_batch ON public.schedules (institute_id, batch_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_schedules_teacher_day ON public.schedules (teacher_id, day_of_week) WHERE teacher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedules_room_day ON public.schedules (room_id, day_of_week) WHERE room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedules_status ON public.schedules (institute_id, status);
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_date ON public.schedule_exceptions (institute_id, exception_date);

-- ── updated_at triggers ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS subjects_set_updated_at ON public.subjects;
CREATE TRIGGER subjects_set_updated_at
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS sections_set_updated_at ON public.sections;
CREATE TRIGGER sections_set_updated_at
  BEFORE UPDATE ON public.sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS rooms_set_updated_at ON public.rooms;
CREATE TRIGGER rooms_set_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS schedules_set_updated_at ON public.schedules;
CREATE TRIGGER schedules_set_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS schedule_exceptions_set_updated_at ON public.schedule_exceptions;
CREATE TRIGGER schedule_exceptions_set_updated_at
  BEFORE UPDATE ON public.schedule_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Conflict detection helper ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.times_overlap(
  a_start TIME, a_end TIME,
  b_start TIME, b_end TIME
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT a_start < b_end AND b_start < a_end;
$$;

CREATE OR REPLACE FUNCTION public.check_schedule_conflicts(
  p_institute_id UUID,
  p_batch_id UUID,
  p_section_id UUID,
  p_teacher_id UUID,
  p_room_id UUID,
  p_day_of_week SMALLINT,
  p_start_time TIME,
  p_end_time TIME,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflicts JSONB := '[]'::JSONB;
  v_row RECORD;
BEGIN
  IF p_end_time <= p_start_time THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'type', 'invalid_time',
      'message', 'End time must be after start time.'
    ));
  END IF;

  -- Teacher double-booking
  IF p_teacher_id IS NOT NULL THEN
    FOR v_row IN
      SELECT s.id, s.start_time, s.end_time, b.name AS batch_name
      FROM public.schedules s
      JOIN public.batches b ON b.id = s.batch_id
      WHERE s.institute_id = p_institute_id
        AND s.teacher_id = p_teacher_id
        AND s.day_of_week = p_day_of_week
        AND s.status <> 'archived'
        AND (p_exclude_id IS NULL OR s.id <> p_exclude_id)
        AND public.times_overlap(s.start_time, s.end_time, p_start_time, p_end_time)
    LOOP
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'type', 'teacher',
        'schedule_id', v_row.id,
        'message', format('Teacher already assigned %s–%s (%s).', v_row.start_time, v_row.end_time, v_row.batch_name)
      ));
    END LOOP;
  END IF;

  -- Room conflict
  IF p_room_id IS NOT NULL THEN
    FOR v_row IN
      SELECT s.id, s.start_time, s.end_time, b.name AS batch_name
      FROM public.schedules s
      JOIN public.batches b ON b.id = s.batch_id
      WHERE s.institute_id = p_institute_id
        AND s.room_id = p_room_id
        AND s.day_of_week = p_day_of_week
        AND s.status <> 'archived'
        AND (p_exclude_id IS NULL OR s.id <> p_exclude_id)
        AND public.times_overlap(s.start_time, s.end_time, p_start_time, p_end_time)
    LOOP
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'type', 'room',
        'schedule_id', v_row.id,
        'message', format('Room booked %s–%s (%s).', v_row.start_time, v_row.end_time, v_row.batch_name)
      ));
    END LOOP;
  END IF;

  -- Batch / section overlap
  FOR v_row IN
    SELECT s.id, s.start_time, s.end_time, sec.name AS section_name
    FROM public.schedules s
    LEFT JOIN public.sections sec ON sec.id = s.section_id
    WHERE s.institute_id = p_institute_id
      AND s.batch_id = p_batch_id
      AND s.day_of_week = p_day_of_week
      AND s.status <> 'archived'
      AND (p_exclude_id IS NULL OR s.id <> p_exclude_id)
      AND public.times_overlap(s.start_time, s.end_time, p_start_time, p_end_time)
      AND (
        p_section_id IS NULL
        OR s.section_id IS NULL
        OR s.section_id = p_section_id
      )
  LOOP
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'type', 'batch',
      'schedule_id', v_row.id,
      'message', format('Class overlap %s–%s%s.', v_row.start_time, v_row.end_time,
        CASE WHEN v_row.section_name IS NOT NULL THEN ' (section ' || v_row.section_name || ')' ELSE '' END)
    ));
  END LOOP;

  RETURN v_conflicts;
END;
$$;

-- Duplicate previous week schedules for a batch
CREATE OR REPLACE FUNCTION public.duplicate_week_schedules(
  p_institute_id UUID,
  p_source_batch_id UUID,
  p_target_batch_id UUID DEFAULT NULL,
  p_week_label TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_batch UUID := COALESCE(p_target_batch_id, p_source_batch_id);
  v_count INTEGER := 0;
BEGIN
  IF get_my_role() NOT IN ('admin', 'super_admin') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.schedules (
    institute_id, batch_id, section_id, subject_id, teacher_id, room_id,
    day_of_week, start_time, end_time, type, status, title, notes, week_label
  )
  SELECT
    institute_id, v_target_batch, section_id, subject_id, teacher_id, room_id,
    day_of_week, start_time, end_time, type, 'draft', title, notes, p_week_label
  FROM public.schedules
  WHERE institute_id = p_institute_id
    AND batch_id = p_source_batch_id
    AND status <> 'archived';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN json_build_object('duplicated', v_count, 'target_batch_id', v_target_batch);
END;
$$;

-- Publish all draft schedules for a batch
CREATE OR REPLACE FUNCTION public.publish_batch_schedule(
  p_institute_id UUID,
  p_batch_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF get_my_role() NOT IN ('admin', 'super_admin') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.schedules
  SET status = 'published'
  WHERE institute_id = p_institute_id
    AND batch_id = p_batch_id
    AND status = 'draft';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN json_build_object('published', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_schedule_conflicts TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_week_schedules TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_batch_schedule TO authenticated;

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;

-- subjects
DROP POLICY IF EXISTS "super_admin_all_subjects" ON public.subjects;
CREATE POLICY "super_admin_all_subjects" ON public.subjects FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "admin_manage_subjects" ON public.subjects;
CREATE POLICY "admin_manage_subjects" ON public.subjects FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

DROP POLICY IF EXISTS "institute_read_subjects" ON public.subjects;
CREATE POLICY "institute_read_subjects" ON public.subjects FOR SELECT
  USING (institute_id = get_my_institute_id());

-- sections
DROP POLICY IF EXISTS "super_admin_all_sections" ON public.sections;
CREATE POLICY "super_admin_all_sections" ON public.sections FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "admin_manage_sections" ON public.sections;
CREATE POLICY "admin_manage_sections" ON public.sections FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

DROP POLICY IF EXISTS "institute_read_sections" ON public.sections;
CREATE POLICY "institute_read_sections" ON public.sections FOR SELECT
  USING (institute_id = get_my_institute_id());

-- rooms
DROP POLICY IF EXISTS "super_admin_all_rooms" ON public.rooms;
CREATE POLICY "super_admin_all_rooms" ON public.rooms FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "admin_manage_rooms" ON public.rooms;
CREATE POLICY "admin_manage_rooms" ON public.rooms FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

DROP POLICY IF EXISTS "institute_read_rooms" ON public.rooms;
CREATE POLICY "institute_read_rooms" ON public.rooms FOR SELECT
  USING (institute_id = get_my_institute_id());

-- schedules
DROP POLICY IF EXISTS "super_admin_all_schedules" ON public.schedules;
CREATE POLICY "super_admin_all_schedules" ON public.schedules FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "admin_manage_schedules" ON public.schedules;
CREATE POLICY "admin_manage_schedules" ON public.schedules FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

DROP POLICY IF EXISTS "staff_read_own_schedules" ON public.schedules;
CREATE POLICY "staff_read_own_schedules" ON public.schedules FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND status = 'published'
    AND teacher_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "staff_read_institute_schedules" ON public.schedules;
CREATE POLICY "staff_read_institute_schedules" ON public.schedules FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff' AND status = 'published');

DROP POLICY IF EXISTS "student_read_batch_schedules" ON public.schedules;
CREATE POLICY "student_read_batch_schedules" ON public.schedules FOR SELECT
  USING (
    status = 'published'
    AND batch_id IN (
      SELECT batch_id FROM public.students
      WHERE user_id = auth.uid() AND batch_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "parent_read_child_schedules" ON public.schedules;
CREATE POLICY "parent_read_child_schedules" ON public.schedules FOR SELECT
  USING (
    status = 'published'
    AND batch_id IN (
      SELECT DISTINCT s.batch_id
      FROM public.students s
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid() AND s.batch_id IS NOT NULL
    )
  );

-- schedule_exceptions
DROP POLICY IF EXISTS "super_admin_all_schedule_exceptions" ON public.schedule_exceptions;
CREATE POLICY "super_admin_all_schedule_exceptions" ON public.schedule_exceptions FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "admin_manage_schedule_exceptions" ON public.schedule_exceptions;
CREATE POLICY "admin_manage_schedule_exceptions" ON public.schedule_exceptions FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

DROP POLICY IF EXISTS "institute_read_schedule_exceptions" ON public.schedule_exceptions;
CREATE POLICY "institute_read_schedule_exceptions" ON public.schedule_exceptions FOR SELECT
  USING (institute_id = get_my_institute_id());

DROP POLICY IF EXISTS "parent_read_schedule_exceptions" ON public.schedule_exceptions;
CREATE POLICY "parent_read_schedule_exceptions" ON public.schedule_exceptions FOR SELECT
  USING (
    institute_id IN (
      SELECT institute_id FROM public.parents WHERE user_id = auth.uid()
    )
    AND (
      batch_id IS NULL
      OR batch_id IN (
        SELECT DISTINCT s.batch_id
        FROM public.students s
        JOIN public.student_parents sp ON sp.student_id = s.id
        JOIN public.parents p ON p.id = sp.parent_id
        WHERE p.user_id = auth.uid() AND s.batch_id IS NOT NULL
      )
    )
  );
-- ============================================================
-- EduOS Migration 018 — Student lesson visibility for enrolled courses
-- Enrolled students can read all lessons in their course (not only is_published).
-- Preview lessons remain gated for non-enrolled visitors on published courses.
-- Backfill is_published for existing published-course content.
-- ============================================================

DROP POLICY IF EXISTS "lms_lesson_student" ON public.lms_lessons;
CREATE POLICY "lms_lesson_student" ON public.lms_lessons
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND (
      public.lms_is_course_student(course_id)
      OR (
        is_preview = TRUE
        AND is_published = TRUE
        AND course_id IN (
          SELECT id FROM public.lms_courses
          WHERE institute_id = get_my_institute_id()
            AND status = 'published'
            AND visibility IN ('public', 'institutional')
        )
      )
    )
  );

-- Ensure published courses expose curriculum to students
UPDATE public.lms_lessons l
SET is_published = TRUE, updated_at = NOW()
FROM public.lms_courses c
WHERE l.course_id = c.id
  AND c.status = 'published'
  AND l.is_published = FALSE;

UPDATE public.lms_modules m
SET is_published = TRUE, updated_at = NOW()
FROM public.lms_courses c
WHERE m.course_id = c.id
  AND c.status = 'published'
  AND m.is_published = FALSE;
-- Additional indexes for dashboard / list query performance (idempotent)

CREATE INDEX IF NOT EXISTS idx_students_institute_status ON public.students (institute_id, status);
CREATE INDEX IF NOT EXISTS idx_students_batch ON public.students (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON public.attendance_records (student_id, marked_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_fees_student_status ON public.student_fees (student_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_institute_active ON public.staff (institute_id) WHERE is_active IS TRUE;
-- ============================================================
-- EduOS Migration 019 — Student access to lesson materials, quizzes, assignments
-- Enrolled students can read content without per-item is_published gates.
-- ============================================================

-- Materials (use enrollment helper from 013)
DROP POLICY IF EXISTS "lms_mat_student_enrolled" ON public.lms_lesson_materials;
CREATE POLICY "lms_mat_student_enrolled" ON public.lms_lesson_materials
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND public.lms_is_course_student(course_id)
  );

-- Quizzes — enrolled students see course quizzes (draft quiz flag optional for admins)
DROP POLICY IF EXISTS "lms_quiz_student_enrolled" ON public.lms_quizzes;
CREATE POLICY "lms_quiz_student_enrolled" ON public.lms_quizzes
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND public.lms_is_course_student(course_id)
  );

-- Assignments
DROP POLICY IF EXISTS "lms_assign_student_enrolled" ON public.lms_assignments;
CREATE POLICY "lms_assign_student_enrolled" ON public.lms_assignments
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND public.lms_is_course_student(course_id)
  );

-- Backfill publish flags for published courses
UPDATE public.lms_quizzes q
SET is_published = TRUE, updated_at = NOW()
FROM public.lms_courses c
WHERE q.course_id = c.id
  AND c.status = 'published'
  AND q.is_published = FALSE;

UPDATE public.lms_assignments a
SET is_published = TRUE, updated_at = NOW()
FROM public.lms_courses c
WHERE a.course_id = c.id
  AND c.status = 'published'
  AND a.is_published = FALSE;
-- ============================================================
-- EduOS Migration 020 — Analytics & Reporting (aggregated RPCs)
-- ============================================================

CREATE OR REPLACE FUNCTION public.analytics_can_access_institute(p_institute_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_super_admin()
    OR (get_my_institute_id() = p_institute_id AND get_my_role() IN ('admin', 'staff'));
$$;

CREATE OR REPLACE FUNCTION public.analytics_can_access_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id
      AND (
        is_super_admin()
        OR (get_my_role() = 'admin' AND s.institute_id = get_my_institute_id())
        OR (get_my_role() = 'staff' AND s.institute_id = get_my_institute_id())
        OR (get_my_role() = 'student' AND s.user_id = auth.uid())
        OR (
          get_my_role() = 'parent'
          AND s.id IN (
            SELECT sp.student_id FROM public.student_parents sp
            JOIN public.parents p ON p.id = sp.parent_id
            WHERE p.user_id = auth.uid()
          )
        )
      )
  );
$$;

-- Institute-wide KPI bundle
CREATE OR REPLACE FUNCTION public.get_institute_analytics_overview(
  p_institute_id UUID,
  p_batch_id UUID DEFAULT NULL,
  p_date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_att_total INTEGER := 0;
  v_att_present INTEGER := 0;
  v_collected NUMERIC := 0;
  v_pending NUMERIC := 0;
  v_overdue NUMERIC := 0;
BEGIN
  IF NOT public.analytics_can_access_institute(p_institute_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))::INTEGER
  INTO v_att_total, v_att_present
  FROM public.attendance_records ar
  JOIN public.attendance_sessions s ON s.id = ar.session_id
  WHERE s.institute_id = p_institute_id
    AND (p_batch_id IS NULL OR s.batch_id = p_batch_id)
    AND s.session_date BETWEEN p_date_from AND p_date_to;

  SELECT COALESCE(SUM(fp.amount), 0) INTO v_collected
  FROM public.fee_payments fp
  JOIN public.student_fees sf ON sf.id = fp.student_fee_id
  JOIN public.students st ON st.id = sf.student_id
  WHERE fp.institute_id = p_institute_id
    AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
    AND fp.payment_date BETWEEN p_date_from AND p_date_to;

  SELECT
    COALESCE(SUM(GREATEST(sf.final_amount - COALESCE(paid.total, 0), 0)) FILTER (WHERE sf.status IN ('pending', 'partial')), 0),
    COALESCE(SUM(GREATEST(sf.final_amount - COALESCE(paid.total, 0), 0)) FILTER (WHERE sf.status = 'overdue'), 0)
  INTO v_pending, v_overdue
  FROM public.student_fees sf
  JOIN public.students st ON st.id = sf.student_id
  LEFT JOIN (
    SELECT student_fee_id, SUM(amount) AS total
    FROM public.fee_payments
    WHERE institute_id = p_institute_id
    GROUP BY student_fee_id
  ) paid ON paid.student_fee_id = sf.id
  WHERE sf.institute_id = p_institute_id;

  RETURN jsonb_build_object(
    'students', jsonb_build_object(
      'total', (
        SELECT COUNT(*)
        FROM public.students
        WHERE institute_id = p_institute_id
          AND (p_batch_id IS NULL OR batch_id = p_batch_id)
      ),
      'active', (
        SELECT COUNT(*)
        FROM public.students
        WHERE institute_id = p_institute_id
          AND status = 'active'
          AND (p_batch_id IS NULL OR batch_id = p_batch_id)
      )
    ),
    'staff', jsonb_build_object(
      'total', (
        SELECT COUNT(DISTINCT sa.staff_id)
        FROM public.staff_assignments sa
        JOIN public.staff s ON s.id = sa.staff_id
        WHERE sa.institute_id = p_institute_id
          AND s.is_active IS TRUE
          AND (p_batch_id IS NULL OR sa.batch_id = p_batch_id)
      ),
      'assignments', (
        SELECT COUNT(*)
        FROM public.staff_assignments sa
        JOIN public.staff s ON s.id = sa.staff_id
        WHERE sa.institute_id = p_institute_id
          AND s.is_active IS TRUE
          AND (p_batch_id IS NULL OR sa.batch_id = p_batch_id)
      )
    ),
    'parents', jsonb_build_object(
      'total', (
        SELECT COUNT(DISTINCT sp.parent_id)
        FROM public.student_parents sp
        JOIN public.students st ON st.id = sp.student_id
        WHERE st.institute_id = p_institute_id
          AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
      )
    ),
    'batches', jsonb_build_object(
      'total', (
        SELECT COUNT(*)
        FROM public.batches
        WHERE institute_id = p_institute_id
          AND (p_batch_id IS NULL OR id = p_batch_id)
      ),
      'active', (
        SELECT COUNT(*)
        FROM public.batches
        WHERE institute_id = p_institute_id
          AND is_active = TRUE
          AND (p_batch_id IS NULL OR id = p_batch_id)
      )
    ),
    'attendance', jsonb_build_object(
      'total_records', v_att_total,
      'present_or_late', v_att_present,
      'rate', CASE WHEN v_att_total > 0 THEN ROUND((v_att_present::NUMERIC / v_att_total) * 100) ELSE 0 END
    ),
    'fees', jsonb_build_object(
      'collected_in_range', v_collected,
      'pending', v_pending,
      'overdue', v_overdue
    ),
    'schedules', jsonb_build_object(
      'published', (
        SELECT COUNT(*)
        FROM public.schedules
        WHERE institute_id = p_institute_id
          AND status = 'published'
          AND (p_batch_id IS NULL OR batch_id = p_batch_id)
      ),
      'draft', (
        SELECT COUNT(*)
        FROM public.schedules
        WHERE institute_id = p_institute_id
          AND status = 'draft'
          AND (p_batch_id IS NULL OR batch_id = p_batch_id)
      ),
      'exam_slots', (
        SELECT COUNT(*)
        FROM public.schedules
        WHERE institute_id = p_institute_id
          AND type = 'exam'
          AND (p_batch_id IS NULL OR batch_id = p_batch_id)
      )
    ),
    'courses', jsonb_build_object(
      'enrollments_active', (
        SELECT COUNT(*)
        FROM public.student_courses sc
        JOIN public.students st ON st.id = sc.student_id
        WHERE sc.institute_id = p_institute_id
          AND sc.status = 'active'
          AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
      )
    )
  );
END;
$$;

-- Attendance trends + batch breakdown
CREATE OR REPLACE FUNCTION public.get_institute_attendance_analytics(
  p_institute_id UUID,
  p_batch_id UUID DEFAULT NULL,
  p_date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.analytics_can_access_institute(p_institute_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN jsonb_build_object(
    'daily_trend', COALESCE((
      SELECT jsonb_agg(row ORDER BY row->>'date')
      FROM (
        SELECT jsonb_build_object(
          'date', s.session_date,
          'label', to_char(s.session_date, 'Mon DD'),
          'present', COUNT(*) FILTER (WHERE ar.status = 'present'),
          'absent', COUNT(*) FILTER (WHERE ar.status = 'absent'),
          'late', COUNT(*) FILTER (WHERE ar.status = 'late'),
          'leave', COUNT(*) FILTER (WHERE ar.status = 'leave'),
          'total', COUNT(*),
          'percentage', CASE WHEN COUNT(*) > 0
            THEN ROUND((COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))::NUMERIC / COUNT(*)) * 100)
            ELSE 0 END
        ) AS row
        FROM public.attendance_sessions s
        JOIN public.attendance_records ar ON ar.session_id = s.id
        WHERE s.institute_id = p_institute_id
          AND s.session_date BETWEEN p_date_from AND p_date_to
          AND (p_batch_id IS NULL OR s.batch_id = p_batch_id)
        GROUP BY s.session_date
        ORDER BY s.session_date
        LIMIT 60
      ) t
    ), '[]'::JSONB),
    'batch_breakdown', COALESCE((
      SELECT jsonb_agg(row ORDER BY (row->>'rate')::INTEGER DESC)
      FROM (
        SELECT jsonb_build_object(
          'batch_id', b.id,
          'batch_name', b.name,
          'total', COUNT(ar.id),
          'present', COUNT(*) FILTER (WHERE ar.status IN ('present', 'late')),
          'rate', CASE WHEN COUNT(ar.id) > 0
            THEN ROUND((COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))::NUMERIC / COUNT(ar.id)) * 100)
            ELSE 0 END
        ) AS row
        FROM public.batches b
        LEFT JOIN public.attendance_sessions s ON s.batch_id = b.id
          AND s.institute_id = p_institute_id
          AND s.session_date BETWEEN p_date_from AND p_date_to
        LEFT JOIN public.attendance_records ar ON ar.session_id = s.id
        WHERE b.institute_id = p_institute_id
          AND (p_batch_id IS NULL OR b.id = p_batch_id)
        GROUP BY b.id, b.name
        HAVING COUNT(ar.id) > 0 OR p_batch_id IS NOT NULL
      ) t
    ), '[]'::JSONB),
    'status_distribution', COALESCE((
      SELECT jsonb_build_object(
        'present', COUNT(*) FILTER (WHERE ar.status = 'present'),
        'absent', COUNT(*) FILTER (WHERE ar.status = 'absent'),
        'late', COUNT(*) FILTER (WHERE ar.status = 'late'),
        'leave', COUNT(*) FILTER (WHERE ar.status = 'leave')
      )
      FROM public.attendance_records ar
      JOIN public.attendance_sessions s ON s.id = ar.session_id
      WHERE s.institute_id = p_institute_id
        AND s.session_date BETWEEN p_date_from AND p_date_to
        AND (p_batch_id IS NULL OR s.batch_id = p_batch_id)
    ), '{}'::JSONB)
  );
END;
$$;

-- Fee analytics
CREATE OR REPLACE FUNCTION public.get_institute_fee_analytics(
  p_institute_id UUID,
  p_batch_id UUID DEFAULT NULL,
  p_date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '180 days')::DATE,
  p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.analytics_can_access_institute(p_institute_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN jsonb_build_object(
    'status_distribution', COALESCE((
      SELECT jsonb_object_agg(status, cnt)
      FROM (
        SELECT sf.status, COUNT(*)::INTEGER AS cnt
        FROM public.student_fees sf
        JOIN public.students st ON st.id = sf.student_id
        WHERE sf.institute_id = p_institute_id
          AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
        GROUP BY sf.status
      ) s
    ), '{}'::JSONB),
    'monthly_revenue', COALESCE((
      SELECT jsonb_agg(row ORDER BY row->>'month')
      FROM (
        SELECT jsonb_build_object(
          'month', to_char(fp.payment_date, 'YYYY-MM'),
          'label', to_char(fp.payment_date, 'Mon YYYY'),
          'amount', SUM(fp.amount)
        ) AS row
        FROM public.fee_payments fp
        JOIN public.student_fees sf ON sf.id = fp.student_fee_id
        JOIN public.students st ON st.id = sf.student_id
        WHERE fp.institute_id = p_institute_id
          AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
          AND fp.payment_date BETWEEN p_date_from AND p_date_to
        GROUP BY to_char(fp.payment_date, 'YYYY-MM'), to_char(fp.payment_date, 'Mon YYYY')
        ORDER BY to_char(fp.payment_date, 'YYYY-MM')
        LIMIT 12
      ) t
    ), '[]'::JSONB),
    'totals', jsonb_build_object(
      'collected', (
        SELECT COALESCE(SUM(fp.amount), 0)
        FROM public.fee_payments fp
        JOIN public.student_fees sf ON sf.id = fp.student_fee_id
        JOIN public.students st ON st.id = sf.student_id
        WHERE fp.institute_id = p_institute_id
          AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
          AND fp.payment_date BETWEEN p_date_from AND p_date_to
      ),
      'pending', (
        SELECT COALESCE(SUM(GREATEST(sf.final_amount - COALESCE(paid.total, 0), 0)), 0)
        FROM public.student_fees sf
        JOIN public.students st ON st.id = sf.student_id
        LEFT JOIN (
          SELECT student_fee_id, SUM(amount) AS total FROM public.fee_payments
          WHERE institute_id = p_institute_id GROUP BY student_fee_id
        ) paid ON paid.student_fee_id = sf.id
        WHERE sf.institute_id = p_institute_id
          AND sf.status IN ('pending', 'partial')
          AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
      ),
      'overdue', (
        SELECT COALESCE(SUM(GREATEST(sf.final_amount - COALESCE(paid.total, 0), 0)), 0)
        FROM public.student_fees sf
        JOIN public.students st ON st.id = sf.student_id
        LEFT JOIN (
          SELECT student_fee_id, SUM(amount) AS total FROM public.fee_payments
          WHERE institute_id = p_institute_id GROUP BY student_fee_id
        ) paid ON paid.student_fee_id = sf.id
        WHERE sf.institute_id = p_institute_id
          AND sf.status = 'overdue'
          AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
      )
    )
  );
END;
$$;

-- Schedule / staff workload
CREATE OR REPLACE FUNCTION public.get_institute_schedule_analytics(
  p_institute_id UUID,
  p_batch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.analytics_can_access_institute(p_institute_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN jsonb_build_object(
    'by_type', COALESCE((
      SELECT jsonb_object_agg(type, cnt)
      FROM (
        SELECT type::TEXT, COUNT(*)::INTEGER AS cnt
        FROM public.schedules
        WHERE institute_id = p_institute_id
          AND status = 'published'
          AND (p_batch_id IS NULL OR batch_id = p_batch_id)
        GROUP BY type
      ) t
    ), '{}'::JSONB),
    'teacher_workload', COALESCE((
      SELECT jsonb_agg(row ORDER BY (row->>'slots')::INTEGER DESC)
      FROM (
        SELECT jsonb_build_object(
          'staff_id', st.id,
          'name', u.name,
          'slots', COUNT(sch.id)
        ) AS row
        FROM public.schedules sch
        JOIN public.staff st ON st.id = sch.teacher_id
        JOIN public.users u ON u.id = st.user_id
        WHERE sch.institute_id = p_institute_id
          AND sch.status = 'published'
          AND (p_batch_id IS NULL OR sch.batch_id = p_batch_id)
        GROUP BY st.id, u.name
        ORDER BY COUNT(sch.id) DESC
        LIMIT 10
      ) t
    ), '[]'::JSONB)
  );
END;
$$;

-- Per-student analytics (parent / student / admin)
CREATE OR REPLACE FUNCTION public.get_student_analytics(
  p_student_id UUID,
  p_date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '90 days')::DATE,
  p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institute_id UUID;
  v_att_total INTEGER := 0;
  v_att_present INTEGER := 0;
BEGIN
  IF NOT public.analytics_can_access_student(p_student_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT institute_id INTO v_institute_id FROM public.students WHERE id = p_student_id;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))
  INTO v_att_total, v_att_present
  FROM public.attendance_records ar
  JOIN public.attendance_sessions s ON s.id = ar.session_id
  WHERE ar.student_id = p_student_id
    AND s.session_date BETWEEN p_date_from AND p_date_to;

  RETURN jsonb_build_object(
    'student_id', p_student_id,
    'attendance', jsonb_build_object(
      'total', v_att_total,
      'present_or_late', v_att_present,
      'rate', CASE WHEN v_att_total > 0 THEN ROUND((v_att_present::NUMERIC / v_att_total) * 100) ELSE 0 END,
      'weekly_trend', COALESCE((
        SELECT jsonb_agg(row ORDER BY row->>'period')
        FROM (
          SELECT jsonb_build_object(
            'period', s.session_date,
            'label', to_char(s.session_date, 'Dy'),
            'present', COUNT(*) FILTER (WHERE ar.status = 'present'),
            'absent', COUNT(*) FILTER (WHERE ar.status = 'absent'),
            'late', COUNT(*) FILTER (WHERE ar.status = 'late'),
            'leave', COUNT(*) FILTER (WHERE ar.status = 'leave'),
            'total', COUNT(*),
            'percentage', CASE WHEN COUNT(*) > 0
              THEN ROUND((COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))::NUMERIC / COUNT(*)) * 100)
              ELSE 0 END
          ) AS row
          FROM public.attendance_records ar
          JOIN public.attendance_sessions s ON s.id = ar.session_id
          WHERE ar.student_id = p_student_id
            AND s.session_date BETWEEN p_date_from AND p_date_to
          GROUP BY s.session_date
          ORDER BY s.session_date DESC
          LIMIT 14
        ) t
      ), '[]'::JSONB)
    ),
    'courses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'course_name', c.name,
        'status', sc.status,
        'enrolled_at', sc.enrolled_at
      ))
      FROM public.student_courses sc
      JOIN public.courses c ON c.id = sc.course_id
      WHERE sc.student_id = p_student_id
    ), '[]'::JSONB),
    'fees', COALESCE((
      SELECT jsonb_build_object(
        'total_due', COALESCE(SUM(sf.final_amount), 0),
        'total_paid', COALESCE(SUM(sf.paid_so_far), 0),
        'pending_count', COUNT(*) FILTER (WHERE sf.status IN ('pending', 'partial', 'overdue'))
      )
      FROM public.student_fees sf
      WHERE sf.student_id = p_student_id
    ), '{}'::JSONB),
    'insights', jsonb_build_array(
      CASE WHEN v_att_total > 0 AND (v_att_present::NUMERIC / v_att_total) < 0.75
        THEN 'Attendance is below 75% — consider follow-up with guardians.'
        ELSE 'Attendance is within acceptable range.'
      END
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_institute_analytics_overview(UUID, UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_institute_attendance_analytics(UUID, UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_institute_fee_analytics(UUID, UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_institute_schedule_analytics(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_analytics(UUID, DATE, DATE) TO authenticated;
-- ============================================================
-- EduOS Migration 021 — Teacher Students (scoped access + RPCs)
-- ============================================================

-- ── Helpers ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_staff_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.staff s
  WHERE s.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.teacher_assigned_batch_ids(p_staff_id UUID DEFAULT NULL)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT batch_id
  FROM (
    SELECT sa.batch_id
    FROM public.staff_assignments sa
    WHERE sa.staff_id = COALESCE(p_staff_id, public.get_my_staff_id())
      AND sa.batch_id IS NOT NULL
    UNION
    SELECT sch.batch_id
    FROM public.schedules sch
    WHERE sch.teacher_id = COALESCE(p_staff_id, public.get_my_staff_id())
      AND sch.status = 'published'
  ) batches
  WHERE batch_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_access_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR (
      public.get_my_role() = 'admin'
      AND EXISTS (
        SELECT 1
        FROM public.students st
        WHERE st.id = p_student_id
          AND st.institute_id = public.get_my_institute_id()
      )
    )
    OR (
      public.get_my_role() = 'staff'
      AND EXISTS (
        SELECT 1
        FROM public.students st
        WHERE st.id = p_student_id
          AND st.institute_id = public.get_my_institute_id()
          AND st.batch_id IN (SELECT public.teacher_assigned_batch_ids(public.get_my_staff_id()))
      )
    )
    OR (
      public.get_my_role() = 'student'
      AND EXISTS (
        SELECT 1 FROM public.students st
        WHERE st.id = p_student_id AND st.user_id = auth.uid()
      )
    )
    OR (
      public.get_my_role() = 'parent'
      AND EXISTS (
        SELECT 1
        FROM public.student_parents sp
        JOIN public.parents p ON p.id = sp.parent_id
        WHERE sp.student_id = p_student_id
          AND p.user_id = auth.uid()
      )
    );
$$;

-- Tighten student read access for staff (assigned batches only)
DROP POLICY IF EXISTS "staff_read_institute_students" ON public.students;

CREATE POLICY "staff_read_assigned_students"
  ON public.students FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND batch_id IN (SELECT public.teacher_assigned_batch_ids(public.get_my_staff_id()))
  );

-- Scoped analytics for teachers
CREATE OR REPLACE FUNCTION public.analytics_can_access_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.teacher_can_access_student(p_student_id);
$$;

-- ── Teacher student list (paginated, filterable) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_teacher_students(
  p_staff_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_batch_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_attendance_min NUMERIC DEFAULT NULL,
  p_attendance_max NUMERIC DEFAULT NULL,
  p_performance TEXT DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_institute_id UUID;
  v_result JSONB;
BEGIN
  v_staff_id := COALESCE(p_staff_id, public.get_my_staff_id());

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff profile not found';
  END IF;

  IF public.get_my_role() = 'staff' AND v_staff_id <> public.get_my_staff_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.get_my_role() NOT IN ('staff', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT institute_id INTO v_institute_id
  FROM public.staff
  WHERE id = v_staff_id;

  IF v_institute_id IS NULL OR (
    public.get_my_role() = 'admin'
    AND v_institute_id <> public.get_my_institute_id()
    AND NOT public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  WITH base AS (
    SELECT
      st.id,
      st.admission_no,
      st.status,
      st.batch_id,
      st.emergency_contact,
      st.created_at,
      u.name,
      u.email,
      u.phone,
      u.avatar_url,
      b.name AS batch_name,
      COALESCE(att.rate, 0) AS attendance_rate,
      CASE
        WHEN COALESCE(att.rate, 0) >= 85 THEN 'excellent'
        WHEN COALESCE(att.rate, 0) >= 70 THEN 'good'
        WHEN att.total > 0 THEN 'needs_attention'
        ELSE 'unknown'
      END AS performance_status
    FROM public.students st
    JOIN public.users u ON u.id = st.user_id
    LEFT JOIN public.batches b ON b.id = st.batch_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::INTEGER AS total,
        CASE
          WHEN COUNT(*) > 0 THEN ROUND(
            (COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))::NUMERIC / COUNT(*)) * 100
          )
          ELSE 0
        END AS rate
      FROM public.attendance_records ar
      JOIN public.attendance_sessions s ON s.id = ar.session_id
      WHERE ar.student_id = st.id
        AND s.session_date >= (CURRENT_DATE - INTERVAL '90 days')::DATE
    ) att ON TRUE
    WHERE st.institute_id = v_institute_id
      AND st.batch_id IN (SELECT public.teacher_assigned_batch_ids(v_staff_id))
      AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
      AND (p_status IS NULL OR st.status::TEXT = p_status)
      AND (
        p_search IS NULL
        OR p_search = ''
        OR st.admission_no ILIKE '%' || p_search || '%'
        OR u.name ILIKE '%' || p_search || '%'
        OR u.email ILIKE '%' || p_search || '%'
      )
      AND (
        p_attendance_min IS NULL
        OR COALESCE(att.rate, 0) >= p_attendance_min
      )
      AND (
        p_attendance_max IS NULL
        OR COALESCE(att.rate, 0) <= p_attendance_max
      )
      AND (
        p_performance IS NULL
        OR p_performance = ''
        OR (
          p_performance = 'excellent' AND COALESCE(att.rate, 0) >= 85
        )
        OR (
          p_performance = 'good'
          AND COALESCE(att.rate, 0) >= 70
          AND COALESCE(att.rate, 0) < 85
        )
        OR (
          p_performance = 'needs_attention'
          AND att.total > 0
          AND COALESCE(att.rate, 0) < 70
        )
        OR (
          p_performance = 'unknown' AND COALESCE(att.total, 0) = 0
        )
      )
  ),
  counted AS (
    SELECT COUNT(*)::INTEGER AS cnt FROM base
  ),
  paged AS (
    SELECT *
    FROM base
    ORDER BY name
    LIMIT COALESCE(p_page_size, 20)
    OFFSET GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 20), 0)
  )
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(row_to_json(p)::JSONB) FROM paged p), '[]'::JSONB),
    'meta', jsonb_build_object(
      'page', COALESCE(p_page, 1),
      'page_size', COALESCE(p_page_size, 20),
      'total', (SELECT cnt FROM counted),
      'total_pages', GREATEST(
        1,
        CEIL((SELECT cnt FROM counted)::NUMERIC / NULLIF(COALESCE(p_page_size, 20), 0))
      )
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ── Teacher remark RPC (staff on assigned students) ───────────────────────────

CREATE OR REPLACE FUNCTION public.add_student_remark(
  p_student_id UUID,
  p_remark TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institute_id UUID;
  v_trimmed TEXT;
BEGIN
  v_trimmed := TRIM(p_remark);

  IF v_trimmed IS NULL OR length(v_trimmed) < 3 THEN
    RAISE EXCEPTION 'Remark must be at least 3 characters';
  END IF;

  IF length(v_trimmed) > 500 THEN
    RAISE EXCEPTION 'Remark must be at most 500 characters';
  END IF;

  IF NOT public.teacher_can_access_student(p_student_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.get_my_role() NOT IN ('admin', 'staff', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT institute_id INTO v_institute_id
  FROM public.students
  WHERE id = p_student_id;

  INSERT INTO public.student_history (
    student_id,
    institute_id,
    action,
    remark,
    changed_by
  ) VALUES (
    p_student_id,
    v_institute_id,
    'remark_added',
    v_trimmed,
    auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_staff_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_assigned_batch_ids TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_access_student TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_students TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_student_remark TO authenticated;
-- ============================================================
-- EduOS Migration 022 — batches.description (optional)
-- ============================================================
-- Run this when you want the Description field on batch forms to persist.
-- The app works without this column (description is not queried until added).

ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.batches.description IS 'Optional operator notes about the batch.';
-- ============================================================
-- EduOS Migration 023 — students.batch_id → batches FK
-- ============================================================
-- PostgREST / Supabase embed syntax (batch:batches(...)) requires a
-- declared foreign key. Migration 001 created batch_id without REFERENCES.
-- This migration adds the FK so relationship hints work in the API.

-- Clear orphan batch references before adding the constraint
UPDATE public.students st
SET batch_id = NULL
WHERE batch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.batches b WHERE b.id = st.batch_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_batch_id_fkey'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_batch_id_fkey
      FOREIGN KEY (batch_id)
      REFERENCES public.batches(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_students_batch_id ON public.students(batch_id);

COMMENT ON CONSTRAINT students_batch_id_fkey ON public.students IS
  'Enables PostgREST embed students → batches for batch assignment UI.';
-- ============================================================
-- EduOS Migration 024 — Repair orphan attendance_sessions.batch_id
-- ============================================================
-- Sessions created before batch_id was returned in API selects may still
-- have a valid batch_id in the database. This migration only fixes rows
-- where batch_id IS NULL and the institute has exactly one active batch
-- (safe single-batch institutes).

UPDATE public.attendance_sessions s
SET batch_id = only_batch.id
FROM (
  SELECT institute_id, (array_agg(id ORDER BY created_at DESC))[1] AS id
  FROM public.batches
  WHERE COALESCE(is_active, TRUE) = TRUE
  GROUP BY institute_id
  HAVING COUNT(*) = 1
) only_batch
WHERE s.batch_id IS NULL
  AND s.institute_id = only_batch.institute_id;

-- For institutes with multiple batches, orphan sessions must be recreated
-- or batch_id set manually in Supabase.

CREATE INDEX IF NOT EXISTS idx_attendance_sessions_batch_id
  ON public.attendance_sessions(batch_id)
  WHERE batch_id IS NOT NULL;
-- ============================================================
-- EduOS Migration 025 — Staff Batch Assignments + Attendance Scope
-- ============================================================
--
-- WHY:
-- 1) staff_assignments already acts as the teacher/staff-to-batch relationship.
-- 2) We need explicit batch-only assignment rows (course_name + subject_name = NULL)
--    with uniqueness and metadata for assignment management from staff details.
-- 3) Staff attendance access must be limited to assigned batches.
--
-- NOTES:
-- - This migration keeps existing course assignment rows untouched.
-- - "Batch assignment" rows are represented as:
--     course_name IS NULL AND subject_name IS NULL AND batch_id IS NOT NULL
-- ============================================================

-- ── 1) staff_assignments hardening ──────────────────────────────────────────

ALTER TABLE public.staff_assignments
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.staff_assignments
SET assigned_at = COALESCE(assigned_at, created_at, NOW())
WHERE assigned_at IS NULL;

ALTER TABLE public.staff_assignments
  ALTER COLUMN assigned_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_staff_assignments_staff_id
  ON public.staff_assignments(staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_assignments_batch_id
  ON public.staff_assignments(batch_id)
  WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_assignments_assigned_at
  ON public.staff_assignments(assigned_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_batch_only_assignment
  ON public.staff_assignments(staff_id, batch_id)
  WHERE batch_id IS NOT NULL
    AND course_name IS NULL
    AND subject_name IS NULL;

-- ── 2) Coordinator write access for assignments ─────────────────────────────
-- Coordinators are represented in staff.designation (e.g. "Coordinator").

DROP POLICY IF EXISTS "coordinator_manage_assignments" ON public.staff_assignments;

CREATE POLICY "coordinator_manage_assignments"
  ON public.staff_assignments
  FOR ALL
  USING (
    institute_id = public.get_my_institute_id()
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.institute_id = public.staff_assignments.institute_id
        AND s.is_active IS TRUE
        AND COALESCE(s.designation, '') ILIKE '%coordinator%'
    )
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.institute_id = public.staff_assignments.institute_id
        AND s.is_active IS TRUE
        AND COALESCE(s.designation, '') ILIKE '%coordinator%'
    )
  );

-- ── 3) Attendance policies scoped to assigned batches for staff ────────────

DROP POLICY IF EXISTS "staff_read_attendance_sessions" ON public.attendance_sessions;
CREATE POLICY "staff_read_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND (
      EXISTS (
        SELECT 1 FROM public.staff_assignments sa
        WHERE sa.staff_id = public.get_my_staff_id()
          AND sa.batch_id = attendance_sessions.batch_id
      )
      OR EXISTS (
        SELECT 1 FROM public.schedules sch
        WHERE sch.teacher_id = public.get_my_staff_id()
          AND sch.batch_id = attendance_sessions.batch_id
          AND sch.status = 'published'
      )
    )
  );

DROP POLICY IF EXISTS "staff_read_attendance_records" ON public.attendance_records;
CREATE POLICY "staff_read_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND EXISTS (
      SELECT 1
      FROM public.attendance_sessions s
      WHERE s.id = attendance_records.session_id
        AND (
          EXISTS (
            SELECT 1 FROM public.staff_assignments sa
            WHERE sa.staff_id = public.get_my_staff_id()
              AND sa.batch_id = s.batch_id
          )
          OR EXISTS (
            SELECT 1 FROM public.schedules sch
            WHERE sch.teacher_id = public.get_my_staff_id()
              AND sch.batch_id = s.batch_id
              AND sch.status = 'published'
          )
        )
    )
  );

DROP POLICY IF EXISTS "staff_insert_attendance_records" ON public.attendance_records;
CREATE POLICY "staff_insert_attendance_records"
  ON public.attendance_records FOR INSERT
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND EXISTS (
      SELECT 1
      FROM public.attendance_sessions s
      WHERE s.id = attendance_records.session_id
        AND (
          EXISTS (
            SELECT 1 FROM public.staff_assignments sa
            WHERE sa.staff_id = public.get_my_staff_id()
              AND sa.batch_id = s.batch_id
          )
          OR EXISTS (
            SELECT 1 FROM public.schedules sch
            WHERE sch.teacher_id = public.get_my_staff_id()
              AND sch.batch_id = s.batch_id
              AND sch.status = 'published'
          )
        )
    )
  );

DROP POLICY IF EXISTS "staff_update_attendance_records" ON public.attendance_records;
CREATE POLICY "staff_update_attendance_records"
  ON public.attendance_records FOR UPDATE
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND EXISTS (
      SELECT 1
      FROM public.attendance_sessions s
      WHERE s.id = attendance_records.session_id
        AND (
          EXISTS (
            SELECT 1 FROM public.staff_assignments sa
            WHERE sa.staff_id = public.get_my_staff_id()
              AND sa.batch_id = s.batch_id
          )
          OR EXISTS (
            SELECT 1 FROM public.schedules sch
            WHERE sch.teacher_id = public.get_my_staff_id()
              AND sch.batch_id = s.batch_id
              AND sch.status = 'published'
          )
        )
    )
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND EXISTS (
      SELECT 1
      FROM public.attendance_sessions s
      WHERE s.id = attendance_records.session_id
        AND (
          EXISTS (
            SELECT 1 FROM public.staff_assignments sa
            WHERE sa.staff_id = public.get_my_staff_id()
              AND sa.batch_id = s.batch_id
          )
          OR EXISTS (
            SELECT 1 FROM public.schedules sch
            WHERE sch.teacher_id = public.get_my_staff_id()
              AND sch.batch_id = s.batch_id
              AND sch.status = 'published'
          )
        )
    )
  );

-- ── 4) Fix parent_read_linked_attendance_sessions to avoid RLS recursion ────

-- The parent_read_linked_attendance_sessions policy from migration 015 causes
-- infinite recursion because it queries attendance_records (which has RLS 
-- policies that reference attendance_sessions). Rewrite to directly join 
-- students/parents without triggering nested RLS evaluation.

DROP POLICY IF EXISTS "parent_read_linked_attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "parent_read_linked_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    batch_id IN (
      SELECT DISTINCT s.batch_id
      FROM public.students s
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
        AND s.batch_id IS NOT NULL
    )
  );
-- ============================================================
-- EduOS Migration 026 — Fix Attendance RLS Recursion
-- ============================================================
--
-- WHY:
-- The "infinite recursion" error in attendance_sessions occurs because 
-- policies for one table query another table whose policies query the first.
--
-- FIX:
-- We rewrite the policies to use SECURITY DEFINER helper functions. 
-- These functions run with superuser privileges and bypass RLS, 
-- effectively breaking the circular dependency chain.
-- ============================================================

-- ── 1) Helper Function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.staff_has_batch_access(p_batch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_assignments sa
    WHERE sa.staff_id = public.get_my_staff_id()
      AND sa.batch_id = p_batch_id
    UNION
    SELECT 1 FROM public.schedules sch
    WHERE sch.teacher_id = public.get_my_staff_id()
      AND sch.batch_id = p_batch_id
      AND sch.status = 'published'
  );
$$;

-- ── 2) Fix attendance_sessions ──────────────────────────────────────────────

DROP POLICY IF EXISTS "staff_read_attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "staff_read_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access(batch_id)
  );

-- ── 3) Fix attendance_records ────────────────────────────────────────────────

DROP POLICY IF EXISTS "staff_read_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_insert_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_update_attendance_records" ON public.attendance_records;

-- READ
CREATE POLICY "staff_read_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access(
      (SELECT batch_id FROM public.attendance_sessions WHERE id = session_id)
    )
  );

-- INSERT
CREATE POLICY "staff_insert_attendance_records"
  ON public.attendance_records FOR INSERT
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access(
      (SELECT batch_id FROM public.attendance_sessions WHERE id = session_id)
    )
  );

-- UPDATE
CREATE POLICY "staff_update_attendance_records"
  ON public.attendance_records FOR UPDATE
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access(
      (SELECT batch_id FROM public.attendance_sessions WHERE id = session_id)
    )
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access(
      (SELECT batch_id FROM public.attendance_sessions WHERE id = session_id)
    )
  );

-- ── 4) Fix parent policy (Final check) ──────────────────────────────────────

-- Migration 025 already fixed parent_read_linked_attendance_sessions 
-- to join students/parents directly. Ensure it's safe.
-- It queries 'students', which has RLS.
-- Let's make a SECURITY DEFINER helper for it too to be 100% safe.

CREATE OR REPLACE FUNCTION public.parent_has_batch_access(p_batch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.student_parents sp ON sp.student_id = s.id
    JOIN public.parents p ON p.id = sp.parent_id
    WHERE p.user_id = auth.uid()
      AND s.batch_id = p_batch_id
  );
$$;

DROP POLICY IF EXISTS "parent_read_linked_attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "parent_read_linked_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (public.parent_has_batch_access(batch_id));
-- ============================================================
-- EduOS Migration 027 — Ultimate Attendance RLS Fix
-- ============================================================
-- 
-- WHY:
-- The "infinite recursion" error in attendance_sessions is caused by 
-- policies that cross-reference attendance_sessions and attendance_records.
-- Even if a user is an Admin, ALL policies (including Parent ones) 
-- are evaluated, and if any of them contain a looping subquery, 
-- the entire request fails.
--
-- FIX:
-- 1. Use SECURITY DEFINER functions for ALL cross-table checks.
-- 2. Ensure NO policy on attendance_sessions queries attendance_records.
-- 3. Ensure NO policy on attendance_records queries attendance_sessions directly.
-- 4. Drop every possible historical policy name to ensure a clean state.
-- ============================================================

-- ── 1. Helper Functions (SECURITY DEFINER) ──────────────────────────────────

-- Get session's batch_id without triggering RLS
CREATE OR REPLACE FUNCTION public.get_session_batch_id(p_session_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT batch_id FROM public.attendance_sessions WHERE id = p_session_id;
$$;

-- Check if staff has access to a batch
CREATE OR REPLACE FUNCTION public.staff_has_batch_access_v2(p_batch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_assignments sa
    WHERE sa.staff_id = public.get_my_staff_id()
      AND sa.batch_id = p_batch_id
    UNION
    SELECT 1 FROM public.schedules sch
    WHERE sch.teacher_id = public.get_my_staff_id()
      AND sch.batch_id = p_batch_id
      AND sch.status = 'published'
  );
$$;

-- Check if parent has access to a batch
CREATE OR REPLACE FUNCTION public.parent_has_batch_access_v2(p_batch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.student_parents sp ON sp.student_id = s.id
    JOIN public.parents p ON p.id = sp.parent_id
    WHERE p.user_id = auth.uid()
      AND s.batch_id = p_batch_id
  );
$$;

-- ── 2. Clean up ALL historical policies ──────────────────────────────────────

-- attendance_sessions
DROP POLICY IF EXISTS "super_admin_all_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "admin_institute_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "staff_read_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "parent_read_linked_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "parent_read_attendance_sessions" ON public.attendance_sessions;

-- attendance_records
DROP POLICY IF EXISTS "super_admin_all_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "admin_institute_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_read_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_insert_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_update_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_manage_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "student_read_own_attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "parent_read_linked_attendance_records" ON public.attendance_records;

-- ── 3. Re-implement Clean Policies ───────────────────────────────────────────

-- ── ATTENDANCE_SESSIONS ──

-- Super Admin
CREATE POLICY "super_admin_all_attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Admin
CREATE POLICY "admin_institute_attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin')
  WITH CHECK (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

-- Staff
CREATE POLICY "staff_read_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    institute_id = public.get_my_institute_id() 
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(batch_id)
  );

-- Parent
CREATE POLICY "parent_read_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    public.get_my_role() = 'parent' 
    AND public.parent_has_batch_access_v2(batch_id)
  );


-- ── ATTENDANCE_RECORDS ──

-- Super Admin
CREATE POLICY "super_admin_all_attendance_records"
  ON public.attendance_records FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Admin
CREATE POLICY "admin_institute_attendance_records"
  ON public.attendance_records FOR ALL
  USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin')
  WITH CHECK (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

-- Staff (READ)
CREATE POLICY "staff_read_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(public.get_session_batch_id(session_id))
  );

-- Staff (INSERT/UPDATE)
CREATE POLICY "staff_write_attendance_records"
  ON public.attendance_records FOR ALL
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(public.get_session_batch_id(session_id))
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(public.get_session_batch_id(session_id))
  );

-- Student
CREATE POLICY "student_read_own_attendance"
  ON public.attendance_records FOR SELECT
  USING (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  );

-- Parent
CREATE POLICY "parent_read_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (
    public.get_my_role() = 'parent'
    AND student_id IN (
      SELECT sp.student_id 
      FROM public.student_parents sp
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );
-- ============================================================
-- EduOS Migration 028 — Final Attendance Recursion Fix
-- ============================================================
-- WHY: 
-- Even with SECURITY DEFINER functions, PostgreSQL RLS can sometimes 
-- trigger infinite recursion when policies cross-reference tables 
-- (attendance_records -> attendance_sessions -> attendance_records).
--
-- THE ULTIMATE FIX:
-- 1. Add batch_id directly to attendance_records.
-- 2. This allows attendance_records policies to check batch access 
--    WITHOUT querying the attendance_sessions table at all.
-- 3. This completely breaks the circular dependency.

-- 1. Add batch_id to attendance_records
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE;

-- 2. Populate batch_id from attendance_sessions
UPDATE public.attendance_records ar
SET batch_id = s.batch_id
FROM public.attendance_sessions s
WHERE ar.session_id = s.id AND ar.batch_id IS NULL;

-- 3. Make batch_id NOT NULL for future records
-- (Note: We do this after populating to avoid errors)
-- ALTER TABLE public.attendance_records ALTER COLUMN batch_id SET NOT NULL; 
-- ^ Commented out just in case there are orphaned records, but ideally should be NOT NULL.

-- 4. Create an index for performance
CREATE INDEX IF NOT EXISTS idx_attendance_records_batch_id ON public.attendance_records(batch_id);

-- 5. Drop ALL existing policies to start fresh
-- attendance_sessions
DROP POLICY IF EXISTS "super_admin_all_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "admin_institute_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "staff_read_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "parent_read_linked_attendance_sessions" ON public.attendance_sessions;
DROP POLICY IF EXISTS "parent_read_attendance_sessions" ON public.attendance_sessions;

-- attendance_records
DROP POLICY IF EXISTS "super_admin_all_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "admin_institute_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_read_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_insert_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_update_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_write_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "staff_manage_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "student_read_own_attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "parent_read_linked_attendance_records" ON public.attendance_records;
DROP POLICY IF EXISTS "parent_read_attendance_records" ON public.attendance_records;

-- 6. Re-implement Clean Policies WITHOUT cross-table joins

-- ── ATTENDANCE_SESSIONS ──

-- Super Admin
CREATE POLICY "super_admin_all_attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Admin
CREATE POLICY "admin_institute_attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin')
  WITH CHECK (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

-- Staff
CREATE POLICY "staff_read_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    institute_id = public.get_my_institute_id() 
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(batch_id)
  );

CREATE POLICY "staff_write_attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING (
    institute_id = public.get_my_institute_id() 
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(batch_id)
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id() 
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(batch_id)
  );

-- Parent
CREATE POLICY "parent_read_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    public.get_my_role() = 'parent' 
    AND public.parent_has_batch_access_v2(batch_id)
  );


-- ── ATTENDANCE_RECORDS ──

-- Super Admin
CREATE POLICY "super_admin_all_attendance_records"
  ON public.attendance_records FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Admin
CREATE POLICY "admin_institute_attendance_records"
  ON public.attendance_records FOR ALL
  USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin')
  WITH CHECK (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

-- Staff (READ)
-- NOW USES batch_id FROM THE TABLE ITSELF! NO JOIN!
CREATE POLICY "staff_read_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(batch_id)
  );

-- Staff (INSERT/UPDATE/DELETE)
CREATE POLICY "staff_write_attendance_records"
  ON public.attendance_records FOR ALL
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(batch_id)
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND public.staff_has_batch_access_v2(batch_id)
  );

-- Parent (READ)
CREATE POLICY "parent_read_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (
    public.get_my_role() = 'parent'
    AND public.parent_has_batch_access_v2(batch_id)
  );

-- Student (READ own)
CREATE POLICY "student_read_own_attendance"
  ON public.attendance_records FOR SELECT
  USING (
    public.get_my_role() = 'student'
    AND student_id IN (
      SELECT id FROM public.students WHERE user_id = auth.uid()
    )
  );
-- ============================================================
-- EduOS Migration 029 — Daily Study Logs System
-- ============================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.daily_study_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    attachment_url TEXT,
    log_date DATE NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'submitted', -- 'submitted'
    is_late BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE, -- Snapshot at last update, but RLS will use function
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, log_date)
);

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_study_logs_student_id ON public.daily_study_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_batch_id ON public.daily_study_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_institute_id ON public.daily_study_logs(institute_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_log_date ON public.daily_study_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_study_logs_composite_batch_date ON public.daily_study_logs(batch_id, log_date);
CREATE INDEX IF NOT EXISTS idx_study_logs_composite_student_date ON public.daily_study_logs(student_id, log_date);

-- 3. Helper Functions

-- Check if a log date is locked (past next day 11:59 PM)
CREATE OR REPLACE FUNCTION public.is_study_log_locked(p_log_date DATE)
RETURNS BOOLEAN AS $$
BEGIN
    -- Locked if current time is past the next day's 23:59:59
    RETURN NOW() > (p_log_date + INTERVAL '1 day' + INTERVAL '23 hours 59 minutes 59 seconds');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Trigger to handle late flag and locked snapshot
CREATE OR REPLACE FUNCTION public.trg_handle_study_log_metadata()
RETURNS TRIGGER AS $$
BEGIN
    -- Set is_late if submitted_at date is after log_date
    IF NEW.submitted_at::DATE > NEW.log_date THEN
        NEW.is_late := TRUE;
    ELSE
        NEW.is_late := FALSE;
    END IF;

    -- Update is_locked snapshot (useful for quick filtering, though RLS uses function)
    NEW.is_locked := public.is_study_log_locked(NEW.log_date);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_study_log_metadata
    BEFORE INSERT OR UPDATE ON public.daily_study_logs
    FOR EACH ROW EXECUTE FUNCTION public.trg_handle_study_log_metadata();

-- 4. RLS Policies

ALTER TABLE public.daily_study_logs ENABLE ROW LEVEL SECURITY;

-- Super Admin
CREATE POLICY "super_admin_all_study_logs"
    ON public.daily_study_logs FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Admin
CREATE POLICY "admin_institute_study_logs"
    ON public.daily_study_logs FOR ALL
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin')
    WITH CHECK (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

-- Staff (Read only for assigned batches)
CREATE POLICY "staff_read_assigned_study_logs"
    ON public.daily_study_logs FOR SELECT
    USING (
        institute_id = public.get_my_institute_id()
        AND public.get_my_role() = 'staff'
        AND public.staff_has_batch_access_v2(batch_id)
    );

-- Student (Read own)
CREATE POLICY "student_read_own_study_logs"
    ON public.daily_study_logs FOR SELECT
    USING (
        public.get_my_role() = 'student'
        AND student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    );

-- Student (Insert/Update own, only if not locked)
CREATE POLICY "student_manage_own_study_logs"
    ON public.daily_study_logs FOR ALL
    USING (
        public.get_my_role() = 'student'
        AND student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
        AND NOT public.is_study_log_locked(log_date)
    )
    WITH CHECK (
        public.get_my_role() = 'student'
        AND student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
        AND NOT public.is_study_log_locked(log_date)
        AND log_date <= CURRENT_DATE -- Cannot log for future
    );

-- 5. RPC for Staff Dashboard (Performance optimized)
-- Returns student info + their logs for a date range in a single call
CREATE OR REPLACE FUNCTION public.get_batch_study_logs_report(
    p_batch_id UUID,
    p_date_from DATE,
    p_date_to DATE
)
RETURNS TABLE (
    student_id UUID,
    student_name TEXT,
    logs JSONB
) AS $$
BEGIN
    -- Authorization check
    IF NOT (
        public.is_super_admin() OR 
        (public.get_my_role() = 'admin' AND (SELECT institute_id FROM public.batches WHERE id = p_batch_id) = public.get_my_institute_id()) OR
        (public.get_my_role() = 'staff' AND public.staff_has_batch_access_v2(p_batch_id))
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT 
        s.id AS student_id,
        u.name AS student_name,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', l.id,
                    'title', l.title,
                    'description', l.description,
                    'log_date', l.log_date,
                    'submitted_at', l.submitted_at,
                    'is_late', l.is_late,
                    'is_locked', l.is_locked,
                    'attachment_url', l.attachment_url
                )
            ) FILTER (WHERE l.id IS NOT NULL),
            '[]'::jsonb
        ) AS logs
    FROM public.students s
    JOIN public.users u ON u.id = s.user_id
    LEFT JOIN public.daily_study_logs l ON l.student_id = s.id 
        AND l.log_date BETWEEN p_date_from AND p_date_to
    WHERE s.batch_id = p_batch_id
      AND s.status = 'active'
    GROUP BY s.id, u.name
    ORDER BY u.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
-- ============================================================
-- EduOS Migration 030 — Batch-Specific Daily Study Logs
-- ============================================================

-- 1. Fix the uniqueness constraint
-- We need to drop the old unique constraint and add the new one.
-- Assuming the previous constraint was named daily_study_logs_student_id_log_date_key (default name)
ALTER TABLE public.daily_study_logs 
DROP CONSTRAINT IF EXISTS daily_study_logs_student_id_log_date_key;

-- Add the proper composite unique constraint: student + batch + date
-- This allows one log per batch per day for a student.
ALTER TABLE public.daily_study_logs
ADD CONSTRAINT daily_study_logs_student_batch_date_key UNIQUE (student_id, batch_id, log_date);

-- 2. Update the RPC for Staff Dashboard to be strictly batch-scoped
-- The existing RPC already takes p_batch_id, but let's ensure it's robust.
CREATE OR REPLACE FUNCTION public.get_batch_study_logs_report(
    p_batch_id UUID,
    p_date_from DATE,
    p_date_to DATE
)
RETURNS TABLE (
    student_id UUID,
    student_name TEXT,
    logs JSONB
) AS $$
BEGIN
    -- Authorization check: Admin or Staff with batch access
    IF NOT (
        public.is_super_admin() OR 
        (public.get_my_role() = 'admin' AND (SELECT institute_id FROM public.batches WHERE id = p_batch_id) = public.get_my_institute_id()) OR
        (public.get_my_role() = 'staff' AND public.staff_has_batch_access_v2(p_batch_id))
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT 
        s.id AS student_id,
        u.name AS student_name,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', l.id,
                    'title', l.title,
                    'description', l.description,
                    'log_date', l.log_date,
                    'submitted_at', l.submitted_at,
                    'is_late', l.is_late,
                    'is_locked', l.is_locked,
                    'attachment_url', l.attachment_url,
                    'batch_id', l.batch_id
                )
            ) FILTER (WHERE l.id IS NOT NULL),
            '[]'::jsonb
        ) AS logs
    FROM public.students s
    JOIN public.users u ON u.id = s.user_id
    -- This join is CRITICAL: it only pulls logs FOR THIS SPECIFIC BATCH
    LEFT JOIN public.daily_study_logs l ON l.student_id = s.id 
        AND l.batch_id = p_batch_id
        AND l.log_date BETWEEN p_date_from AND p_date_to
    WHERE s.batch_id = p_batch_id -- In our current schema, students have a primary batch_id
      -- OR s.id IN (SELECT student_id FROM batch_students WHERE batch_id = p_batch_id) -- Use this if you have a many-to-many junction table
      AND s.status = 'active'
    GROUP BY s.id, u.name
    ORDER BY u.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. Policy update: Ensure student can only log for their assigned batches
-- We need to update the INSERT policy to check batch assignment.
DROP POLICY IF EXISTS "student_manage_own_study_logs" ON public.daily_study_logs;

CREATE POLICY "student_manage_own_study_logs"
    ON public.daily_study_logs FOR ALL
    USING (
        public.get_my_role() = 'student'
        AND student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
        AND NOT public.is_study_log_locked(log_date)
    )
    WITH CHECK (
        public.get_my_role() = 'student'
        AND student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
        -- Ensure the student is actually in the batch they are logging for
        AND (
            (SELECT batch_id FROM public.students WHERE user_id = auth.uid()) = batch_id
            -- OR student_id IN (SELECT student_id FROM batch_students WHERE batch_id = batch_id) -- If many-to-many
        )
        AND NOT public.is_study_log_locked(log_date)
        AND log_date <= CURRENT_DATE
    );
-- ============================================================
-- EduOS Migration 031 — Data Integrity: One Active Batch Per Course
-- ============================================================

-- ── 1. Create student_batch_assignments junction ───────────────────────────
-- This replaces the single students.batch_id column and allows
-- many-to-many Student <-> Batch relationships properly.
-- Each assignment is linked to a course to enforce the business rule.

CREATE TABLE IF NOT EXISTS public.student_batch_assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id    UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    batch_id      UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
    course_id     UUID REFERENCES public.courses(id) ON DELETE CASCADE, -- Made nullable to allow migration
    institute_id  UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by   UUID REFERENCES public.users(id),
    
    -- BUSINESS RULE: ONE ACTIVE BATCH PER COURSE PER STUDENT
    -- (PostgreSQL allows multiple NULLs in UNIQUE constraints)
    UNIQUE (student_id, course_id)
);

-- Add course_id to batches if not exists
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sba_student_id ON public.student_batch_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_sba_batch_id   ON public.student_batch_assignments(batch_id);
CREATE INDEX IF NOT EXISTS idx_sba_course_id  ON public.student_batch_assignments(course_id);

-- ── 2. Migrate existing data ────────────────────────────────────────────────
-- Move current students.batch_id into the junction table.
-- We need to find the course_id for each batch.

DO $$
BEGIN
    -- Only migrate if student_batch_assignments is empty
    IF NOT EXISTS (SELECT 1 FROM public.student_batch_assignments) THEN
        INSERT INTO public.student_batch_assignments (student_id, batch_id, course_id, institute_id)
        SELECT 
            s.id as student_id,
            s.batch_id,
            b.course_id, -- Assuming batch has course_id from previous context/assumptions
            s.institute_id
        FROM public.students s
        JOIN public.batches b ON b.id = s.batch_id
        WHERE s.batch_id IS NOT NULL;
    END IF;
END $$;

-- ── 3. Helper for safe student transfer ─────────────────────────────────────
-- Moves a student from one batch to another within the SAME course.
-- Preserves history by updating the junction table instead of deleting.

CREATE OR REPLACE FUNCTION public.transfer_student_batch(
    p_student_id UUID,
    p_new_batch_id UUID,
    p_assigned_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_course_id UUID;
    v_institute_id UUID;
    v_old_batch_id UUID;
BEGIN
    -- 1. Get metadata for new batch
    SELECT course_id, institute_id INTO v_new_course_id, v_institute_id
    FROM public.batches WHERE id = p_new_batch_id;

    IF v_new_course_id IS NULL THEN
        RAISE EXCEPTION 'Invalid target batch';
    END IF;

    -- 2. Authorization check (Admin/Staff with batch access)
    IF NOT (
        public.is_super_admin() OR 
        (public.get_my_role() = 'admin' AND v_institute_id = public.get_my_institute_id()) OR
        (public.get_my_role() = 'staff' AND public.staff_has_batch_access_v2(p_new_batch_id))
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- 3. Perform the shift (atomic)
    -- This handles the UNIQUE(student_id, course_id) constraint automatically
    INSERT INTO public.student_batch_assignments (
        student_id, batch_id, course_id, institute_id, assigned_by
    )
    VALUES (
        p_student_id, p_new_batch_id, v_new_course_id, v_institute_id, p_assigned_by
    )
    ON CONFLICT (student_id, course_id) 
    DO UPDATE SET 
        batch_id = EXCLUDED.batch_id,
        assigned_at = NOW(),
        assigned_by = EXCLUDED.assigned_by
    RETURNING (SELECT batch_id FROM public.student_batch_assignments WHERE student_id = p_student_id AND course_id = v_new_course_id) INTO v_old_batch_id;

    -- 4. Log the action
    INSERT INTO public.student_history (
        student_id, institute_id, changed_by, action, old_value, new_value, remark
    )
    VALUES (
        p_student_id, v_institute_id, p_assigned_by, 'batch_transfer',
        jsonb_build_object('batch_id', v_old_batch_id),
        jsonb_build_object('batch_id', p_new_batch_id),
        'Student transferred to new batch for course.'
    );

    RETURN jsonb_build_object('success', true, 'new_batch_id', p_new_batch_id);
END;
$$;

-- ── 4. Fix RLS for the new junction table ───────────────────────────────────
ALTER TABLE public.student_batch_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_sba" ON public.student_batch_assignments FOR ALL
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "staff_read_assigned_sba" ON public.student_batch_assignments FOR SELECT
    USING (public.get_my_role() = 'staff' AND public.staff_has_batch_access_v2(batch_id));

CREATE POLICY "student_read_own_sba" ON public.student_batch_assignments FOR SELECT
    USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

-- ── 5. Update attendance_sessions query helper ──────────────────────────────
-- Ensure it looks at current assignments for the active list,
-- but old records remain valid.

CREATE OR REPLACE FUNCTION public.get_active_batch_students(p_batch_id UUID)
RETURNS SETOF public.students
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT s.*
    FROM public.students s
    JOIN public.student_batch_assignments sba ON sba.student_id = s.id
    WHERE sba.batch_id = p_batch_id AND sba.is_active = TRUE;
$$;
-- ============================================================
-- EduOS Migration 032 — Fix RLS for Study Logs and Assignments
-- ============================================================

-- 1. Fix Daily Study Logs RLS (Fully qualified to avoid ambiguity)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "student_manage_own_study_logs" ON public.daily_study_logs;

CREATE POLICY "student_manage_own_study_logs"
    ON public.daily_study_logs FOR ALL
    USING (
        public.get_my_role() = 'student'
        AND daily_study_logs.student_id IN (SELECT students.id FROM public.students WHERE students.user_id = auth.uid())
        AND NOT public.is_study_log_locked(daily_study_logs.log_date)
    )
    WITH CHECK (
        public.get_my_role() = 'student'
        AND daily_study_logs.student_id IN (SELECT students.id FROM public.students WHERE students.user_id = auth.uid())
        -- Ensure the student is assigned to this batch
        AND (
            (SELECT students.batch_id FROM public.students WHERE students.user_id = auth.uid()) = daily_study_logs.batch_id
            OR 
            EXISTS (
                SELECT 1 FROM public.student_batch_assignments sba
                JOIN public.students s ON s.id = sba.student_id
                WHERE s.user_id = auth.uid() 
                  AND sba.batch_id = daily_study_logs.batch_id
                  AND sba.is_active = TRUE
            )
        )
        AND NOT public.is_study_log_locked(daily_study_logs.log_date)
        AND daily_study_logs.log_date <= CURRENT_DATE
    );

DROP POLICY IF EXISTS "student_read_own_study_logs" ON public.daily_study_logs;

CREATE POLICY "student_read_own_study_logs"
    ON public.daily_study_logs FOR SELECT
    USING (
        public.get_my_role() = 'student'
        AND daily_study_logs.student_id IN (SELECT students.id FROM public.students WHERE students.user_id = auth.uid())
    );


-- 2. Fix Batches RLS
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "student_read_own_batch" ON public.batches;

CREATE POLICY "student_read_own_batch"
  ON public.batches FOR SELECT
  USING (
    public.get_my_role() = 'student'
    AND (
      batches.id IN (
        SELECT students.batch_id
        FROM public.students
        WHERE students.user_id = auth.uid()
          AND students.batch_id IS NOT NULL
      )
      OR
      batches.id IN (
        SELECT sba.batch_id
        FROM public.student_batch_assignments sba
        JOIN public.students s ON s.id = sba.student_id
        WHERE s.user_id = auth.uid()
          AND sba.is_active = TRUE
      )
    )
  );


-- 3. Fix Courses RLS
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "student_read_courses" ON public.courses;

CREATE POLICY "student_read_courses"
  ON public.courses FOR SELECT
  USING (
    public.get_my_role() = 'student'
    AND (
      courses.id IN (
        SELECT sc.course_id
        FROM public.student_courses sc
        JOIN public.students s ON s.id = sc.student_id
        WHERE s.user_id = auth.uid()
      )
      OR
      courses.id IN (
        SELECT sba.course_id
        FROM public.student_batch_assignments sba
        JOIN public.students s ON s.id = sba.student_id
        WHERE s.user_id = auth.uid()
          AND sba.is_active = TRUE
      )
    )
  );


-- 4. Update RPC for Staff Dashboard (Explicit column qualification to fix ambiguity)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_batch_study_logs_report(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION public.get_batch_study_logs_report(
    p_batch_id UUID,
    p_date_from DATE,
    p_date_to DATE
)
RETURNS TABLE (
    student_id UUID,
    student_name TEXT,
    logs JSONB
) AS $$
BEGIN
    -- Authorization check: Admin or Staff with batch access
    IF NOT (
        public.is_super_admin() OR 
        (public.get_my_role() = 'admin' AND (SELECT batches.institute_id FROM public.batches WHERE batches.id = p_batch_id) = public.get_my_institute_id()) OR
        (public.get_my_role() = 'staff' AND public.staff_has_batch_access_v2(p_batch_id))
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT 
        s.id AS student_id,
        u.name AS student_name,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', l.id,
                    'title', l.title,
                    'description', l.description,
                    'log_date', l.log_date,
                    'submitted_at', l.submitted_at,
                    'is_late', l.is_late,
                    'is_locked', l.is_locked,
                    'attachment_url', l.attachment_url,
                    'batch_id', l.batch_id
                )
            ) FILTER (WHERE l.id IS NOT NULL),
            '[]'::jsonb
        ) AS logs
    FROM public.students s
    JOIN public.users u ON u.id = s.user_id
    -- Pull logs FOR THIS SPECIFIC BATCH
    LEFT JOIN public.daily_study_logs l ON l.student_id = s.id 
        AND l.batch_id = p_batch_id
        AND l.log_date BETWEEN p_date_from AND p_date_to
    WHERE (
        s.batch_id = p_batch_id 
        OR EXISTS (
            SELECT 1 FROM public.student_batch_assignments sba 
            WHERE sba.student_id = s.id 
              AND sba.batch_id = p_batch_id 
              AND sba.is_active = TRUE
        )
    )
      AND s.status = 'active'
    GROUP BY s.id, u.name
    ORDER BY u.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
-- ============================================================
-- EduOS Migration 033 — Assignment Management System
-- ============================================================

-- ── 1. Enums ────────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE assignment_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE submission_status AS ENUM ('pending', 'submitted', 'late', 'reviewed', 'graded', 'resubmit_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add resubmit_requested to enum if it doesn't exist yet (safe to run multiple times)
DO $$ BEGIN
    ALTER TYPE submission_status ADD VALUE IF NOT EXISTS 'resubmit_requested';
EXCEPTION WHEN others THEN NULL; END $$;

-- ── 2. Tables ───────────────────────────────────────────────────────────────

-- 1. Main Assignments Table
CREATE TABLE IF NOT EXISTS public.assignments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id      UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    created_by        UUID NOT NULL REFERENCES public.users(id),
    title             TEXT NOT NULL,
    description       TEXT, -- Rich text content
    instructions      TEXT,
    total_marks       NUMERIC(10,2) DEFAULT 100,
    due_date          TIMESTAMPTZ,
    status            assignment_status NOT NULL DEFAULT 'draft',
    allow_late        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Assignment Assignees (Junction Table for Students)
CREATE TABLE IF NOT EXISTS public.assignment_assignees (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id     UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id        UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    institute_id      UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    assigned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(assignment_id, student_id)
);

-- 3. Assignment Resources (Files attached by Admin)
CREATE TABLE IF NOT EXISTS public.assignment_resources (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id     UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    institute_id      UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    file_name         TEXT NOT NULL,
    file_url          TEXT NOT NULL,
    storage_path      TEXT NOT NULL,
    file_type         TEXT,
    file_size         BIGINT,
    uploaded_by       UUID NOT NULL REFERENCES public.users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Assignment Submissions (Student work)
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id     UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id        UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    institute_id      UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    content           TEXT, -- Optional text submission
    status            submission_status NOT NULL DEFAULT 'submitted',
    submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_late           BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Grading & Feedback (integrated to keep it separate from LMS lessons)
    grade             NUMERIC(10,2),
    feedback          TEXT,
    graded_at         TIMESTAMPTZ,
    graded_by         UUID REFERENCES public.users(id),
    
    UNIQUE(assignment_id, student_id)
);

-- 5. Submission Files
CREATE TABLE IF NOT EXISTS public.submission_files (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id     UUID NOT NULL REFERENCES public.assignment_submissions(id) ON DELETE CASCADE,
    institute_id      UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    file_name         TEXT NOT NULL,
    file_url          TEXT NOT NULL,
    storage_path      TEXT NOT NULL,
    file_type         TEXT,
    file_size         BIGINT,
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Storage Buckets ───────────────────────────────────────────────────────
-- Supabase handles buckets via SQL or UI. We'll declare the policy-driven access here.
-- Buckets: 'assignment-resources', 'assignment-submissions'

-- ── 4. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assignments_institute ON public.assignments(institute_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status    ON public.assignments(status);
CREATE INDEX IF NOT EXISTS idx_assignees_student    ON public.assignment_assignees(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON public.assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student    ON public.assignment_submissions(student_id);

-- ── 5. RLS Policies ─────────────────────────────────────────────────────────
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;

-- Assignments Policies
CREATE POLICY "admin_manage_assignments" ON public.assignments FOR ALL
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "student_read_assigned_assignments" ON public.assignments FOR SELECT
    USING (
        assignments.id IN (
            SELECT assignment_id FROM public.assignment_assignees aa
            JOIN public.students s ON s.id = aa.student_id
            WHERE s.user_id = auth.uid()
        )
    );

-- Assignees Policies
CREATE POLICY "admin_manage_assignees" ON public.assignment_assignees FOR ALL
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "student_read_own_assignment_link" ON public.assignment_assignees FOR SELECT
    USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

-- Submissions Policies
CREATE POLICY "admin_read_all_submissions" ON public.assignment_submissions FOR SELECT
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "admin_grade_submissions" ON public.assignment_submissions FOR UPDATE
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "student_manage_own_submission" ON public.assignment_submissions FOR ALL
    USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()))
    WITH CHECK (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

-- File Policies (Resources & Submissions)
CREATE POLICY "admin_manage_resources" ON public.assignment_resources FOR ALL
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "student_read_resources" ON public.assignment_resources FOR SELECT
    USING (assignment_id IN (
        SELECT assignment_id FROM public.assignment_assignees aa
        JOIN public.students s ON s.id = aa.student_id
        WHERE s.user_id = auth.uid()
    ));

CREATE POLICY "admin_read_submission_files" ON public.submission_files FOR SELECT
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "student_manage_own_submission_files" ON public.submission_files FOR ALL
    USING (submission_id IN (
        SELECT sub.id FROM public.assignment_submissions sub
        JOIN public.students s ON s.id = sub.student_id
        WHERE s.user_id = auth.uid()
    ));

-- ── 6. Triggers ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS assignments_set_updated_at ON public.assignments;
CREATE TRIGGER assignments_set_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
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
) TO authenticated;-- ============================================================
-- EduOS Migration 034 — Assignment Storage Buckets
-- ============================================================

-- 1. Create Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('assignment-resources', 'assignment-resources', true),
    ('assignment-submissions', 'assignment-submissions', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Assignment Resources Policies (Public Read, Admin Write)
CREATE POLICY "Public Access to Resources" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'assignment-resources');

CREATE POLICY "Admins can upload resources" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'assignment-resources' 
        AND (storage.foldername(name))[1] = get_my_institute_id()::text
        AND get_my_role() = 'admin'
    );

CREATE POLICY "Admins can update resources" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'assignment-resources' 
        AND (storage.foldername(name))[1] = get_my_institute_id()::text
        AND get_my_role() = 'admin'
    );

CREATE POLICY "Admins can delete resources" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'assignment-resources' 
        AND (storage.foldername(name))[1] = get_my_institute_id()::text
        AND get_my_role() = 'admin'
    );

-- 3. Assignment Submissions Policies (Admin/Staff Read, Student Own Write)
CREATE POLICY "Admins and Staff can view submissions" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'assignment-submissions'
        AND (storage.foldername(name))[1] = get_my_institute_id()::text
        AND get_my_role() IN ('admin', 'staff')
    );

CREATE POLICY "Students can view own submissions" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'assignment-submissions'
        AND (storage.foldername(name))[1] = get_my_institute_id()::text
        AND get_my_role() = 'student'
        -- Verification of own folder structure is handled via path logic in service
    );

CREATE POLICY "Students can upload submissions" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'assignment-submissions'
        AND (storage.foldername(name))[1] = get_my_institute_id()::text
        AND get_my_role() = 'student'
    );

CREATE POLICY "Students can update own submissions" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'assignment-submissions'
        AND (storage.foldername(name))[1] = get_my_institute_id()::text
        AND get_my_role() = 'student'
    );
-- ============================================================
-- EduOS Migration 035 — Fix fee receipt number race condition
-- ============================================================
--
-- Purpose:
--   Make fee receipt generation concurrency-safe without changing the
--   existing UI or payment flow.
--
-- What it does:
--   1. Replaces generate_receipt_number() with a PostgreSQL sequence-
--      backed, atomic generator.
--   2. Replaces record_fee_payment() with a small retry loop so a rare
--      duplicate-key failure is regenerated automatically.
--
-- Notes:
--   - Preserves the existing receipt format: RCP-YYYYMM-000001
--   - Keeps the unique constraint on fee_payments.receipt_number intact
--   - Repairs only missing receipt numbers, without changing valid existing ones
-- ============================================================

-- Helper state: single PostgreSQL sequence for global uniqueness.
CREATE SEQUENCE IF NOT EXISTS public.fee_receipt_sequence
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO CYCLE;

-- Backfill sequence to the highest existing receipt suffix so old data is
-- preserved and the next generated receipt never reuses a value.
DO $$
DECLARE
  v_max_receipt_no BIGINT;
BEGIN
  SELECT COALESCE(
    MAX((regexp_match(receipt_number, '^RCP-[0-9]{6}-([0-9]+)$'))[1]::BIGINT),
    0
  )
  INTO v_max_receipt_no
  FROM public.fee_payments
  WHERE receipt_number ~ '^RCP-[0-9]{6}-[0-9]+$';

  IF v_max_receipt_no > 0 THEN
    PERFORM setval('public.fee_receipt_sequence', v_max_receipt_no, true);
  ELSE
    PERFORM setval('public.fee_receipt_sequence', 1, false);
  END IF;
END $$;

-- Helper: generate the next available receipt number for an institute.
-- Uses a PostgreSQL sequence, which is atomic and safe under concurrency.
CREATE OR REPLACE FUNCTION public.generate_receipt_number(p_institute_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sequence_value BIGINT;
  v_receipt_no     TEXT;
BEGIN
  v_sequence_value := nextval('public.fee_receipt_sequence');
  v_receipt_no := 'RCP-' || to_char(NOW(), 'YYYYMM') || '-' || lpad(v_sequence_value::text, 6, '0');
  RAISE NOTICE 'Generated receipt number %, sequence %, institute %', v_receipt_no, v_sequence_value, p_institute_id;
  RETURN v_receipt_no;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_receipt_number(UUID) TO authenticated;

-- Backfill any missing receipt numbers safely before enforcing NOT NULL.
DO $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT id, institute_id
    FROM public.fee_payments
    WHERE receipt_number IS NULL OR btrim(receipt_number) = ''
    ORDER BY created_at, id
  LOOP
    UPDATE public.fee_payments
    SET receipt_number = public.generate_receipt_number(v_row.institute_id)
    WHERE id = v_row.id;
  END LOOP;
END $$;

-- Enforce non-null receipt numbers for all future and existing payments.
ALTER TABLE public.fee_payments
  ALTER COLUMN receipt_number SET NOT NULL;

-- Atomic fee payment processing with retry protection for receipt collisions.
CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_student_fee_id  UUID,
  p_amount          NUMERIC,
  p_payment_method  TEXT,
  p_payment_date    DATE,
  p_transaction_ref TEXT DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role  user_role;
  v_institute_id UUID;
  v_student_id   UUID;
  v_final_amount NUMERIC;
  v_paid_so_far  NUMERIC;
  v_remaining    NUMERIC;
  v_new_status   TEXT;
  v_receipt_no   TEXT;
  v_sequence_no  BIGINT;
  v_payment_id   UUID;
  v_attempt      INTEGER;
BEGIN
  -- 1) Verify caller is allowed to record payments.
  SELECT role, institute_id
  INTO   v_caller_role, v_institute_id
  FROM   public.users
  WHERE  id = auth.uid();

  IF v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'PAYMENT_FORBIDDEN: Only admins can record payments.';
  END IF;

  -- 2) Retrieve fee details and confirm institute ownership.
  SELECT final_amount, student_id
  INTO   v_final_amount, v_student_id
  FROM   public.student_fees
  WHERE  id = p_student_fee_id
    AND  institute_id = v_institute_id;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND: Fee record not found or does not belong to your institute.';
  END IF;

  -- 3) Calculate amount already paid.
  SELECT COALESCE(SUM(amount), 0)
  INTO   v_paid_so_far
  FROM   public.fee_payments
  WHERE  student_fee_id = p_student_fee_id;

  v_remaining := v_final_amount - v_paid_so_far;

  -- 4) Reject over-payments.
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'PAYMENT_OVERFLOW: Payment amount (%) exceeds remaining due (%).',
      p_amount, v_remaining;
  END IF;

  -- 5-10) Generate receipt and write payment/receipt with retry.
  FOR v_attempt IN 1..3 LOOP
    BEGIN
    v_receipt_no := public.generate_receipt_number(v_institute_id);
    v_sequence_no := split_part(v_receipt_no, '-', 3)::BIGINT;

    INSERT INTO public.fee_payments (
      student_fee_id,
      student_id,
      institute_id,
      collected_by,
      amount,
      payment_method,
      payment_date,
      transaction_ref,
      notes,
      receipt_number
    ) VALUES (
      p_student_fee_id,
      v_student_id,
      v_institute_id,
      auth.uid(),
      p_amount,
      p_payment_method,
      p_payment_date,
      p_transaction_ref,
      p_notes,
      v_receipt_no
    )
    RETURNING id INTO v_payment_id;

    v_new_status := CASE
      WHEN (v_paid_so_far + p_amount) >= v_final_amount THEN 'paid'
      ELSE 'partial'
    END;

    UPDATE public.student_fees
    SET    status     = v_new_status,
           updated_at = NOW()
    WHERE  id = p_student_fee_id;

    INSERT INTO public.fee_receipts (
      payment_id,
      institute_id,
      receipt_number,
      receipt_data,
      generated_by
    ) VALUES (
      v_payment_id,
      v_institute_id,
      v_receipt_no,
      jsonb_build_object(
        'receipt_number', v_receipt_no,
        'payment_id',     v_payment_id,
        'amount',         p_amount,
        'payment_method', p_payment_method,
        'payment_date',   p_payment_date,
        'transaction_ref', p_transaction_ref,
        'student_fee_id', p_student_fee_id
      ),
      auth.uid()
    );

      EXIT;

    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt >= 3 THEN
          RAISE EXCEPTION 'RECEIPT_NUMBER_CONFLICT: Failed to generate a unique receipt number after % attempts (last tried %).',
            v_attempt,
            v_receipt_no;
        END IF;

        RAISE NOTICE 'Receipt collision detected for institute %, receipt %, sequence %, retrying (attempt %)'
          , v_institute_id, v_receipt_no, v_sequence_no, v_attempt;
        PERFORM pg_sleep(0.05 * v_attempt);
    END;
  END LOOP;

  -- 9) Activity log (logging failure must never abort the payment)
  BEGIN
    INSERT INTO public.activity_logs (
      institute_id,
      user_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) VALUES (
      v_institute_id,
      auth.uid(),
      'fee.payment_recorded',
      'fee_payment',
      v_payment_id,
      jsonb_build_object(
        'amount',  p_amount,
        'receipt', v_receipt_no
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 10) Return success payload.
  RETURN json_build_object(
    'payment_id',     v_payment_id,
    'receipt_number', v_receipt_no,
    'new_status',     v_new_status,
    'remaining_due',  GREATEST(0, v_remaining - p_amount)
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '%', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, NUMERIC, TEXT, DATE, TEXT, TEXT) TO authenticated;
-- ============================================================
-- EduOS Migration 036 — Staff course assignments
-- ============================================================
--
-- Purpose:
--   Add a dedicated many-to-many relationship between staff and courses,
--   independent from batch assignments.
--
-- Guarantees:
--   - Prevents duplicate staff/course assignments
--   - Preserves assignments when staff is queried after refresh
--   - Removes assignments automatically when a staff member or course is deleted
--   - Keeps writes restricted to admin/super_admin via RLS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff_courses (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  staff_id     UUID        NOT NULL REFERENCES public.staff(id)      ON DELETE CASCADE,
  course_id    UUID        NOT NULL REFERENCES public.courses(id)     ON DELETE CASCADE,
  assigned_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_courses_staff_id
  ON public.staff_courses(staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_courses_course_id
  ON public.staff_courses(course_id);

CREATE INDEX IF NOT EXISTS idx_staff_courses_institute_id
  ON public.staff_courses(institute_id);

CREATE INDEX IF NOT EXISTS idx_staff_courses_assigned_at
  ON public.staff_courses(assigned_at DESC);

ALTER TABLE public.staff_courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_staff_courses" ON public.staff_courses;
CREATE POLICY "super_admin_all_staff_courses"
  ON public.staff_courses
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "admin_manage_staff_courses" ON public.staff_courses;
CREATE POLICY "admin_manage_staff_courses"
  ON public.staff_courses
  FOR ALL
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'admin'
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "staff_read_own_staff_courses" ON public.staff_courses;
CREATE POLICY "staff_read_own_staff_courses"
  ON public.staff_courses
  FOR SELECT
  USING (
    staff_id = public.get_my_staff_id()
    AND institute_id = public.get_my_institute_id()
  );
-- ============================================================
-- EduOS Migration 037 — Fix assignment file upload RLS
--
-- Minimal, isolated fix for assignment file uploads:
--   - admin-staged assignment resources
--   - student submission attachment files
--
-- This only tightens INSERT authorization for the assignment
-- file metadata tables. No schema changes.
-- ============================================================

DROP POLICY IF EXISTS "admin_manage_resources" ON public.assignment_resources;
CREATE POLICY "admin_manage_resources" ON public.assignment_resources
  FOR ALL TO authenticated
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'admin'
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "student_manage_own_submission_files" ON public.submission_files;
CREATE POLICY "student_manage_own_submission_files" ON public.submission_files
  FOR ALL TO authenticated
  USING (
    submission_id IN (
      SELECT sub.id
      FROM public.assignment_submissions sub
      JOIN public.students s ON s.id = sub.student_id
      WHERE s.user_id = auth.uid()
    )
    AND public.get_my_role() = 'student'
  )
  WITH CHECK (
    submission_id IN (
      SELECT sub.id
      FROM public.assignment_submissions sub
      JOIN public.students s ON s.id = sub.student_id
      WHERE s.user_id = auth.uid()
    )
    AND public.get_my_role() = 'student'
  );-- Migration 040: Create assignments tables
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  teacher_id uuid NOT NULL,
  batch_id uuid,
  course_id uuid,
  due_date timestamp with time zone,
  pdf_url text,
  drive_link text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assignment_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  canvas_json jsonb,
  preview_image bytea
);

CREATE TABLE IF NOT EXISTS public.assignment_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  status text DEFAULT 'assigned',
  submitted_at timestamp with time zone
);
-- ============================================================
-- EduOS Migration 041 — Ensure courses.description exists
-- ============================================================
-- Fixes "column courses.description does not exist" error.
-- This column was originally in migration 005 but may be missing 
-- in some environments due to partial migration runs.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.courses.description IS 'Optional description for the course.';
-- ============================================================
-- EduOS Migration 041 — MCQ Test/Exam System
-- ============================================================

-- ── 1. Enums ────────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE exam_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE exam_attempt_status AS ENUM ('in_progress', 'submitted', 'graded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Tables ───────────────────────────────────────────────────────────────

-- 1. Main Exams Table
CREATE TABLE IF NOT EXISTS public.exams (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id                UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    created_by                  UUID NOT NULL REFERENCES public.users(id),
    title                       TEXT NOT NULL,
    description                 TEXT,
    instructions                TEXT,
    duration_mins               INTEGER NOT NULL DEFAULT 60,
    start_time                  TIMESTAMPTZ,
    end_time                    TIMESTAMPTZ,
    total_marks                 NUMERIC(10,2) DEFAULT 0,
    passing_marks               NUMERIC(10,2) DEFAULT 0,
    status                      exam_status NOT NULL DEFAULT 'draft',
    auto_submit                 BOOLEAN NOT NULL DEFAULT TRUE,
    negative_marking            BOOLEAN NOT NULL DEFAULT FALSE,
    negative_marks_per_question NUMERIC(10,2) DEFAULT 0,
    randomize_questions         BOOLEAN NOT NULL DEFAULT FALSE,
    enable_tab_detection        BOOLEAN NOT NULL DEFAULT FALSE,
    enable_camera_mic           BOOLEAN NOT NULL DEFAULT FALSE,
    enable_deterrent_ui         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Exam Questions
CREATE TABLE IF NOT EXISTS public.exam_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id         UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    question_text   TEXT NOT NULL,
    image_url       TEXT,
    marks           NUMERIC(10,2) NOT NULL DEFAULT 1,
    explanation     TEXT,
    position        INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Exam Options
CREATE TABLE IF NOT EXISTS public.exam_options (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id     UUID NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
    option_text     TEXT NOT NULL,
    is_correct      BOOLEAN NOT NULL DEFAULT FALSE,
    position        INTEGER NOT NULL DEFAULT 0
);

-- 4. Exam Assignments (Link to Students)
CREATE TABLE IF NOT EXISTS public.exam_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id         UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id      UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    institute_id    UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(exam_id, student_id)
);

-- 5. Exam Attempts
CREATE TABLE IF NOT EXISTS public.exam_attempts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id             UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id          UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    institute_id        UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    status              exam_attempt_status NOT NULL DEFAULT 'in_progress',
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at        TIMESTAMPTZ,
    score               NUMERIC(10,2) DEFAULT 0,
    total_questions     INTEGER DEFAULT 0,
    correct_answers     INTEGER DEFAULT 0,
    wrong_answers       INTEGER DEFAULT 0,
    unanswered_questions INTEGER DEFAULT 0,
    percentage          NUMERIC(5,2) DEFAULT 0,
    passed              BOOLEAN DEFAULT FALSE,
    violation_count     INTEGER DEFAULT 0,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Exam Answers
CREATE TABLE IF NOT EXISTS public.exam_answers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id          UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    question_id         UUID NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
    selected_option_id  UUID REFERENCES public.exam_options(id) ON DELETE SET NULL,
    is_correct          BOOLEAN DEFAULT FALSE,
    points_earned       NUMERIC(10,2) DEFAULT 0,
    answered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(attempt_id, question_id)
);

-- 7. Exam Violations
CREATE TABLE IF NOT EXISTS public.exam_violations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id      UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    violation_type  TEXT NOT NULL, -- 'tab_switch', 'blur', 'minimize'
    violation_data  JSONB,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exams_institute ON public.exams(institute_id);
CREATE INDEX IF NOT EXISTS idx_exams_status    ON public.exams(status);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON public.exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_options_question ON public.exam_options(question_id);
CREATE INDEX IF NOT EXISTS idx_exam_assignments_student ON public.exam_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam ON public.exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_student ON public.exam_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_answers_attempt ON public.exam_answers(attempt_id);

-- ── 4. RLS Policies ─────────────────────────────────────────────────────────
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_violations ENABLE ROW LEVEL SECURITY;

-- Exams Policies
CREATE POLICY "admin_manage_exams" ON public.exams FOR ALL
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff'));

CREATE POLICY "student_read_assigned_exams" ON public.exams FOR SELECT
    USING (
        id IN (
            SELECT exam_id FROM public.exam_assignments ea
            JOIN public.students s ON s.id = ea.student_id
            WHERE s.user_id = auth.uid()
        )
    );

-- Questions & Options Policies
CREATE POLICY "admin_manage_exam_content" ON public.exam_questions FOR ALL
    USING (exam_id IN (SELECT id FROM public.exams WHERE institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff')));

CREATE POLICY "student_read_exam_content" ON public.exam_questions FOR SELECT
    USING (exam_id IN (SELECT exam_id FROM public.exam_assignments ea JOIN public.students s ON s.id = ea.student_id WHERE s.user_id = auth.uid()));

CREATE POLICY "admin_manage_exam_options" ON public.exam_options FOR ALL
    USING (question_id IN (SELECT id FROM public.exam_questions WHERE exam_id IN (SELECT id FROM public.exams WHERE institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff'))));

CREATE POLICY "student_read_exam_options" ON public.exam_options FOR SELECT
    USING (question_id IN (SELECT id FROM public.exam_questions WHERE exam_id IN (SELECT exam_id FROM public.exam_assignments ea JOIN public.students s ON s.id = ea.student_id WHERE s.user_id = auth.uid())));

-- Assignments Policies
CREATE POLICY "admin_manage_exam_assignments" ON public.exam_assignments FOR ALL
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff'));

CREATE POLICY "student_read_own_exam_assignments" ON public.exam_assignments FOR SELECT
    USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

-- Attempts Policies
CREATE POLICY "admin_read_all_attempts" ON public.exam_attempts FOR SELECT
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff'));

CREATE POLICY "student_manage_own_attempts" ON public.exam_attempts FOR ALL
    USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()))
    WITH CHECK (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

-- Answers Policies
CREATE POLICY "admin_read_all_answers" ON public.exam_answers FOR SELECT
    USING (attempt_id IN (SELECT id FROM public.exam_attempts WHERE institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff')));

CREATE POLICY "student_manage_own_answers" ON public.exam_answers FOR ALL
    USING (attempt_id IN (SELECT id FROM public.exam_attempts WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())))
    WITH CHECK (attempt_id IN (SELECT id FROM public.exam_attempts WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())));

-- Violations Policies
CREATE POLICY "admin_read_all_violations" ON public.exam_violations FOR SELECT
    USING (attempt_id IN (SELECT id FROM public.exam_attempts WHERE institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff')));

CREATE POLICY "student_create_own_violations" ON public.exam_violations FOR INSERT
    WITH CHECK (attempt_id IN (SELECT id FROM public.exam_attempts WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())));

-- ── 5. Triggers ─────────────────────────────────────────────────────────────
CREATE TRIGGER exams_set_updated_at
  BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 6. Functions & RPCs ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_violation_count(attempt_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.exam_attempts
    SET violation_count = violation_count + 1
    WHERE id = attempt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ============================================================
-- EduOS Migration 042 — MCQ Exam Security Enhancements
-- ============================================================
-- Adds strict security controls for online examinations:
-- - Single attempt enforcement
-- - Session tracking
-- - Timing controls
-- - Violation monitoring
-- - Multiple device prevention

-- ── 1. Extend Exam Attempt Status ────────────────────────────────────────────
DO $$ BEGIN
    ALTER TYPE exam_attempt_status ADD VALUE 'auto_submitted';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE exam_attempt_status ADD VALUE 'expired';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Enhanced Exam Attempts Table ──────────────────────────────────────────
-- Add columns for session tracking and security
ALTER TABLE public.exam_attempts
ADD COLUMN IF NOT EXISTS current_session_id UUID,
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS fullscreen_violations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tab_switch_violations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS browser_fingerprint TEXT,
ADD COLUMN IF NOT EXISTS device_id TEXT,
ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- ── 3. Session Management Table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    
    session_token VARCHAR(256) NOT NULL UNIQUE,
    browser_fingerprint TEXT,
    device_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'active',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibility shims when exam_sessions already existed from an earlier deploy.
ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS violation_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- ── 4. Enhanced Violation Tracking Table ────────────────────────────────────
ALTER TABLE public.exam_violations
ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'low'; -- 'low', 'medium', 'high'

-- ── 5. Test Violations Table (for detailed tracking) ───────────────────────
CREATE TABLE IF NOT EXISTS public.test_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    violation_type TEXT NOT NULL, -- 'tab_switch', 'blur', 'fullscreen_exit', 'minimize', 'browser_close', 'multiple_device'
    violation_count INTEGER DEFAULT 1,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.test_violations
ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 1;

-- ── 6. Indexes for Performance ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exam_sessions_attempt ON public.exam_sessions(attempt_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_student ON public.exam_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_active ON public.exam_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_token ON public.exam_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_test_violations_attempt ON public.test_violations(attempt_id);
CREATE INDEX IF NOT EXISTS idx_test_violations_type ON public.test_violations(violation_type);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_locked ON public.exam_attempts(is_locked);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_session ON public.exam_attempts(current_session_id);

-- ── 7. Enable RLS on New Tables ──────────────────────────────────────────────
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_violations ENABLE ROW LEVEL SECURITY;

-- ── 8. RLS Policies for Exam Sessions ────────────────────────────────────────
CREATE POLICY "admin_read_exam_sessions" ON public.exam_sessions FOR SELECT
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff'));

CREATE POLICY "student_read_own_sessions" ON public.exam_sessions FOR SELECT
    USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

CREATE POLICY "student_create_session" ON public.exam_sessions FOR INSERT
    WITH CHECK (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

CREATE POLICY "student_update_own_session" ON public.exam_sessions FOR UPDATE
    USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()))
    WITH CHECK (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

-- ── 9. RLS Policies for Test Violations ──────────────────────────────────────
CREATE POLICY "admin_read_test_violations" ON public.test_violations FOR SELECT
    USING (attempt_id IN (SELECT id FROM public.exam_attempts WHERE institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff')));

CREATE POLICY "student_create_own_violations" ON public.test_violations FOR INSERT
    WITH CHECK (attempt_id IN (SELECT id FROM public.exam_attempts WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())));

-- ── 10. RLS Enhancements for Exam Attempts ────────────────────────────────────
-- Prevent updating submitted/locked attempts
CREATE POLICY "student_cannot_update_locked_attempts" ON public.exam_attempts FOR UPDATE
    USING (
        student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
        AND is_locked = FALSE
    )
    WITH CHECK (
        student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
        AND is_locked = FALSE
    );

-- Prevent deleting attempts
CREATE POLICY "prevent_attempt_deletion" ON public.exam_attempts FOR DELETE
    USING (FALSE);

-- ── 11. Function to Lock Attempt ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lock_exam_attempt(attempt_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.exam_attempts
    SET is_locked = TRUE
    WHERE id = attempt_id;
    
    -- End all active sessions for this attempt
    UPDATE public.exam_sessions
    SET is_active = FALSE, status = 'ended', ended_at = NOW()
    WHERE attempt_id = lock_exam_attempt.attempt_id AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 12. Function to Validate Exam Timing ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_exam_timing(exam_id UUID)
RETURNS TABLE (
    is_available BOOLEAN,
    current_server_time TIMESTAMPTZ,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    reason TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN e.start_time IS NOT NULL AND NOW() < e.start_time THEN FALSE
            WHEN e.end_time IS NOT NULL AND NOW() > e.end_time THEN FALSE
            ELSE TRUE
        END AS is_available,
        NOW() AS current_server_time,
        e.start_time,
        e.end_time,
        CASE 
            WHEN e.start_time IS NOT NULL AND NOW() < e.start_time THEN 'Test has not started yet'
            WHEN e.end_time IS NOT NULL AND NOW() > e.end_time THEN 'Test has ended'
            ELSE 'Available'
        END AS reason
    FROM public.exams e
    WHERE e.id = exam_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 13. Function to Check Active Attempts ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_active_student_attempt(
    p_exam_id UUID,
    p_student_id UUID
)
RETURNS TABLE (
    attempt_id UUID,
    status TEXT,
    is_locked BOOLEAN,
    started_at TIMESTAMPTZ,
    can_resume BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ea.id,
        ea.status::TEXT,
        ea.is_locked,
        ea.started_at,
        CASE 
            WHEN ea.status = 'in_progress' AND NOT ea.is_locked THEN TRUE
            ELSE FALSE
        END AS can_resume
    FROM public.exam_attempts ea
    WHERE ea.exam_id = p_exam_id 
        AND ea.student_id = p_student_id
    ORDER BY ea.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 14. Function to Count Multiple Devices/Sessions ──────────────────────────
CREATE OR REPLACE FUNCTION public.count_active_sessions_for_attempt(attempt_id UUID)
RETURNS INTEGER AS $$
DECLARE
    session_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO session_count
    FROM public.exam_sessions
    WHERE exam_sessions.attempt_id = count_active_sessions_for_attempt.attempt_id
        AND is_active = TRUE;
    
    RETURN session_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 15. Function to Validate Session Token ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_session_token(
    token VARCHAR(256)
)
RETURNS TABLE (
    is_valid BOOLEAN,
    attempt_id UUID,
    exam_id UUID,
    student_id UUID,
    is_active BOOLEAN,
    reason TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN es.id IS NULL THEN FALSE
            WHEN NOT es.is_active THEN FALSE
            WHEN es.ended_at IS NOT NULL THEN FALSE
            ELSE TRUE
        END AS is_valid,
        COALESCE(es.attempt_id, NULL::UUID) AS attempt_id,
        COALESCE(es.exam_id, NULL::UUID) AS exam_id,
        COALESCE(es.student_id, NULL::UUID) AS student_id,
        COALESCE(es.is_active, FALSE) AS is_active,
        CASE 
            WHEN es.id IS NULL THEN 'Session not found'
            WHEN NOT es.is_active THEN 'Session is inactive'
            WHEN es.ended_at IS NOT NULL THEN 'Session has ended'
            ELSE 'Valid'
        END AS reason
    FROM public.exam_sessions es
    WHERE es.session_token = validate_session_token.token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 16. Function to Auto-Submit on Timer Expiry ──────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_submit_expired_attempts()
RETURNS TABLE (
    attempt_id UUID,
    exam_id UUID,
    student_id UUID,
    submitted_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    UPDATE public.exam_attempts ea
    SET 
        status = 'auto_submitted',
        submitted_at = NOW(),
        is_locked = TRUE
    WHERE 
        ea.status = 'in_progress'
        AND NOT ea.is_locked
        AND NOW() > (ea.started_at + (
            SELECT COALESCE(e.duration_mins, 60) * INTERVAL '1 minute'
            FROM public.exams e
            WHERE e.id = ea.exam_id
        ))
    RETURNING ea.id, ea.exam_id, ea.student_id, ea.submitted_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 17. Function to Track Violations and Auto-Submit ───────────────────────
CREATE OR REPLACE FUNCTION public.record_and_check_violations(
    p_attempt_id UUID,
    p_violation_type TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (
    violation_id UUID,
    total_violations INTEGER,
    should_auto_submit BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    v_total_violations INTEGER;
    v_violation_id UUID;
BEGIN
    -- Insert new violation
    INSERT INTO public.test_violations (attempt_id, violation_type, metadata)
    VALUES (p_attempt_id, p_violation_type, COALESCE(p_metadata, '{}'::jsonb))
    RETURNING id INTO v_violation_id;
    
    -- Get total violation count
    SELECT COUNT(*)
    INTO v_total_violations
    FROM public.test_violations
    WHERE attempt_id = p_attempt_id;
    
    -- Update attempt violation count
    UPDATE public.exam_attempts
    SET violation_count = v_total_violations
    WHERE id = p_attempt_id;
    
    -- Auto-submit if violations exceed 3
    IF v_total_violations >= 3 THEN
        UPDATE public.exam_attempts
        SET 
            status = 'auto_submitted',
            submitted_at = NOW(),
            is_locked = TRUE
        WHERE id = p_attempt_id;
        
        RETURN QUERY SELECT v_violation_id, v_total_violations, TRUE, 'Auto-submitted due to excessive violations';
    ELSE
        RETURN QUERY SELECT v_violation_id, v_total_violations, FALSE, 'Violation recorded';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 18. Grant Permissions ───────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.lock_exam_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_exam_timing TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_student_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_sessions_for_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_session_token TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_submit_expired_attempts TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_and_check_violations TO authenticated;
-- ============================================================
-- EduOS Migration 042 — Link LMS Courses to Academic Courses
-- ============================================================
-- Fixes the disconnect between Admin Course Assignments (Academic)
-- and Staff Course Visibility (LMS).

-- 1. Add course_id to lms_courses to link LMS content to Academic courses
ALTER TABLE public.lms_courses
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lms_courses_academic_course ON public.lms_courses(course_id);

-- 2. Update RLS on lms_courses to allow staff to see courses they are assigned to
-- We drop the existing restrictive staff read policy and replace it with one that
-- checks both creation and assignment.

DROP POLICY IF EXISTS "lms_course_staff_read" ON public.lms_courses;
DROP POLICY IF EXISTS "lms_course_staff_own" ON public.lms_courses;
DROP POLICY IF EXISTS "lms_course_staff_assigned" ON public.lms_courses;

-- Staff can manage (ALL) courses they created
CREATE POLICY "lms_course_staff_own" ON public.lms_courses
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  );

-- Staff can read (SELECT) courses they are assigned to via academic staff_courses
CREATE POLICY "lms_course_staff_assigned" ON public.lms_courses
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND (
      created_by = auth.uid()
      OR id IN (
        SELECT sc.course_id 
        FROM public.staff_courses sc
        JOIN public.staff s ON s.id = sc.staff_id
        WHERE s.user_id = auth.uid()
      )
    )
  );

-- 3. Update RLS on lms_modules/lessons/materials to follow the same logic
-- Since they reference lms_courses(id), the existing lms_is_course_owner helper
-- already handles the 'created_by' check. We need to ensure they can also see
-- assigned ones.

CREATE OR REPLACE FUNCTION lms_is_course_assigned(p_lms_course_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lms_courses lc
    WHERE lc.id = p_lms_course_id
    AND (
      lc.created_by = auth.uid()
      OR lc.id IN (
        SELECT sc.course_id 
        FROM public.staff_courses sc
        JOIN public.staff s ON s.id = sc.staff_id
        WHERE s.user_id = auth.uid()
      )
    )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

DROP POLICY IF EXISTS "lms_mod_student_enrolled" ON public.lms_modules;
DROP POLICY IF EXISTS "lms_mod_staff_read" ON public.lms_modules;
CREATE POLICY "lms_mod_staff_read" ON public.lms_modules
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_assigned(course_id)
  );

DROP POLICY IF EXISTS "lms_lesson_student" ON public.lms_lessons;
DROP POLICY IF EXISTS "lms_lesson_staff_read" ON public.lms_lessons;
CREATE POLICY "lms_lesson_staff_read" ON public.lms_lessons
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_assigned(course_id)
  );
-- ============================================================
-- EduOS Migration 043 — Fix Student LMS Content Visibility
-- ============================================================
-- Fixes "No modules or lessons available" issue for students
-- by bridging the gap between Academic Enrollments and LMS Content.

-- 1. Ensure students can read published modules
DROP POLICY IF EXISTS "lms_mod_student_enrolled" ON public.lms_modules;
CREATE POLICY "lms_mod_student_enrolled" ON public.lms_modules
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND is_published = true
    AND (
      -- Direct LMS enrollment
      EXISTS (
        SELECT 1 FROM public.lms_enrollments
        WHERE course_id = lms_modules.course_id
        AND student_id = auth.uid()
        AND status IN ('active', 'completed')
      )
      OR 
      -- Academic enrollment via linked course
      EXISTS (
        SELECT 1 FROM public.lms_courses lc
        JOIN public.student_courses sc ON sc.course_id = lc.course_id
        JOIN public.students s ON s.id = sc.student_id
        WHERE lc.id = lms_modules.course_id
        AND s.user_id = auth.uid()
        AND sc.status = 'active'
      )
      OR
      -- Visibility-based preview (allows seeing module list)
      EXISTS (
        SELECT 1 FROM public.lms_courses lc
        WHERE lc.id = lms_modules.course_id
        AND lc.status = 'published'
        AND (lc.visibility = 'public' OR lc.visibility = 'institutional')
      )
    )
  );

-- 2. Ensure students can read published lessons
DROP POLICY IF EXISTS "lms_lesson_student" ON public.lms_lessons;
CREATE POLICY "lms_lesson_student" ON public.lms_lessons
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND is_published = true
    AND (
      is_preview = true
      OR 
      -- Direct LMS enrollment
      EXISTS (
        SELECT 1 FROM public.lms_enrollments
        WHERE course_id = lms_lessons.course_id
        AND student_id = auth.uid()
        AND status IN ('active', 'completed')
      )
      OR 
      -- Academic enrollment via linked course
      EXISTS (
        SELECT 1 FROM public.lms_courses lc
        JOIN public.student_courses sc ON sc.course_id = lc.course_id
        JOIN public.students s ON s.id = sc.student_id
        WHERE lc.id = lms_lessons.course_id
        AND s.user_id = auth.uid()
        AND sc.status = 'active'
      )
    )
  );

-- 3. Ensure students can read materials
DROP POLICY IF EXISTS "lms_mat_student_enrolled" ON public.lms_lesson_materials;
CREATE POLICY "lms_mat_student_enrolled" ON public.lms_lesson_materials
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'student'
    AND (
      -- Direct LMS enrollment
      EXISTS (
        SELECT 1 FROM public.lms_enrollments
        WHERE course_id = lms_lesson_materials.course_id
        AND student_id = auth.uid()
        AND status IN ('active', 'completed')
      )
      OR 
      -- Academic enrollment via linked course
      EXISTS (
        SELECT 1 FROM public.lms_courses lc
        JOIN public.student_courses sc ON sc.course_id = lc.course_id
        JOIN public.students s ON s.id = sc.student_id
        WHERE lc.id = lms_lesson_materials.course_id
        AND s.user_id = auth.uid()
        AND sc.status = 'active'
      )
    )
  );

-- 4. Fix potential issue where lms_course_progress might be missing
-- This trigger ensures that when a student opens a course for the first time,
-- their progress record is initialized.
CREATE OR REPLACE FUNCTION public.lms_ensure_course_progress()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.lms_course_progress
    (enrollment_id, student_id, course_id, institute_id)
  VALUES
    (NEW.id, NEW.student_id, NEW.course_id, NEW.institute_id)
  ON CONFLICT (enrollment_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_lms_init_course_progress ON public.lms_enrollments;
CREATE TRIGGER trg_lms_init_course_progress
  AFTER INSERT ON public.lms_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.lms_ensure_course_progress();
-- ============================================================
-- EduOS Migration 044 — Fix LMS course deletion blockers
-- ============================================================
--
-- Purpose:
--   Allow LMS courses to be deleted without being blocked by aggregated
--   progress rows that still reference the course.
-- ============================================================

ALTER TABLE public.lms_course_progress
  DROP CONSTRAINT IF EXISTS lms_course_progress_course_id_fkey;

ALTER TABLE public.lms_course_progress
  ADD CONSTRAINT lms_course_progress_course_id_fkey
  FOREIGN KEY (course_id)
  REFERENCES public.lms_courses(id)
  ON DELETE CASCADE;

DROP POLICY IF EXISTS "lms_cp_admin_delete" ON public.lms_course_progress;
CREATE POLICY "lms_cp_admin_delete"
  ON public.lms_course_progress
  FOR DELETE
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'admin'
  );-- ============================================================
-- EduOS Migration 045 — Switch staff course assignments to LMS courses
-- ============================================================
--
-- Purpose:
--   Make staff course assignments reference LMS courses directly so the
--   assignment picker matches the courses created in the LMS wizard.
-- ============================================================

ALTER TABLE public.staff_courses
  DROP CONSTRAINT IF EXISTS staff_courses_course_id_fkey;

ALTER TABLE public.staff_courses
  ADD CONSTRAINT staff_courses_course_id_fkey
  FOREIGN KEY (course_id)
  REFERENCES public.lms_courses(id)
  ON DELETE CASCADE;-- ============================================================
-- Migration 046: Make register_institute validation resilient
--
-- Problem:
-- register_institute() rejected valid signups when auth.users.created_at
-- was older than 10 minutes. This commonly happens after partial data
-- resets (public schema cleared but auth.users retained) or delayed flow.
--
-- Fix:
-- Replace fragile time-window validation with identity validation:
--   1) p_user_id must exist in auth.users
--   2) auth.users.email must match p_email (case-insensitive)
--
-- This preserves schema/tables and only updates function behavior.
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
  v_auth_email TEXT;
  v_attempt INT := 0;
BEGIN
  -- Validate auth identity by user id.
  SELECT email INTO v_auth_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_auth_email IS NULL THEN
    RAISE EXCEPTION 'REGISTRATION_INVALID_USER: User ID does not exist in auth system.';
  END IF;

  -- Ensure the auth user and submitted email refer to the same identity.
  IF lower(trim(COALESCE(v_auth_email, ''))) <> lower(trim(COALESCE(p_email, ''))) THEN
    RAISE EXCEPTION 'REGISTRATION_INVALID_USER_EMAIL: Auth user/email mismatch.';
  END IF;

  -- Idempotency: if profile already exists, return it.
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

  -- Generate unique 3-digit institute code.
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
-- ============================================================
-- EduOS Migration 048 — Exam Proctoring Race Fix
-- ============================================================

-- 1. Add tracking columns to exam attempts.
ALTER TABLE public.exam_attempts
ADD COLUMN IF NOT EXISTS last_violation_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_submit_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_exam_attempts_last_violation_at
  ON public.exam_attempts(last_violation_at);

-- 2. Normalize any legacy attempt states before we tighten logic further.
DO $$
BEGIN
  UPDATE public.exam_attempts
  SET status = 'in_progress'
  WHERE status::text = 'active';
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- 3. Replace the violation RPC with an atomic row-locking implementation.
CREATE OR REPLACE FUNCTION public.record_and_check_violations(
    p_attempt_id UUID,
    p_violation_type TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (
    violation_id UUID,
    total_violations INTEGER,
    should_auto_submit BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    v_violation_id UUID;
    v_total_violations INTEGER;
BEGIN
    UPDATE public.exam_attempts
    SET
        violation_count = COALESCE(violation_count, 0) + 1,
        last_violation_at = NOW()
    WHERE id = p_attempt_id
      AND status = 'in_progress'
      AND NOT is_locked
    RETURNING violation_count INTO v_total_violations;

    IF NOT FOUND THEN
        SELECT COALESCE(violation_count, 0)
        INTO v_total_violations
        FROM public.exam_attempts
        WHERE id = p_attempt_id;

        RETURN QUERY
        SELECT NULL::UUID, COALESCE(v_total_violations, 0), FALSE, 'Attempt is no longer active';
        RETURN;
    END IF;

    INSERT INTO public.test_violations (
        attempt_id,
        violation_type,
        violation_count,
        metadata
    )
    VALUES (
        p_attempt_id,
        p_violation_type,
        v_total_violations,
        COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_violation_id;

    IF v_total_violations >= 3 THEN
        UPDATE public.exam_attempts
        SET
            status = 'submitted',
            submitted_at = COALESCE(submitted_at, NOW()),
            is_locked = TRUE,
            auto_submit_reason = 'Exceeded maximum proctoring violations',
            last_violation_at = NOW()
        WHERE id = p_attempt_id;

        RETURN QUERY
        SELECT v_violation_id, v_total_violations, TRUE, 'Auto-submitted due to excessive violations';
        RETURN;
    END IF;

    UPDATE public.exam_attempts
    SET auto_submit_reason = NULL
    WHERE id = p_attempt_id;

    RETURN QUERY
    SELECT v_violation_id, v_total_violations, FALSE, 'Violation recorded';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Auto-submit expired attempts using the submitted status.
CREATE OR REPLACE FUNCTION public.auto_submit_expired_attempts()
RETURNS TABLE (
    attempt_id UUID,
    exam_id UUID,
    student_id UUID,
    submitted_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    UPDATE public.exam_attempts ea
    SET
        status = 'submitted',
        submitted_at = NOW(),
        is_locked = TRUE,
        auto_submit_reason = 'Time limit expired'
    WHERE
        ea.status = 'in_progress'
        AND NOT ea.is_locked
        AND NOW() > (ea.started_at + (
            SELECT COALESCE(e.duration_mins, 60) * INTERVAL '1 minute'
            FROM public.exams e
            WHERE e.id = ea.exam_id
        ))
    RETURNING ea.id, ea.exam_id, ea.student_id, ea.submitted_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Admin/staff summary data source for proctoring.
CREATE OR REPLACE FUNCTION public.get_exam_attempt_violations(p_exam_id UUID)
RETURNS TABLE (
    attempt_id UUID,
    student_name TEXT,
    admission_no TEXT,
    violations INTEGER,
    status TEXT,
    last_violation_at TIMESTAMPTZ,
    auto_submit_reason TEXT,
    submitted_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ea.id AS attempt_id,
        u.name AS student_name,
        s.admission_no,
        COALESCE(ea.violation_count, 0) AS violations,
        ea.status::TEXT AS status,
        ea.last_violation_at,
        ea.auto_submit_reason,
        ea.submitted_at
    FROM public.exam_attempts ea
    JOIN public.students s ON s.id = ea.student_id
    JOIN public.users u ON u.id = s.user_id
    WHERE ea.exam_id = p_exam_id
    ORDER BY COALESCE(ea.last_violation_at, ea.submitted_at, ea.started_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.record_and_check_violations TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_submit_expired_attempts TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_attempt_violations TO authenticated;-- ============================================================
-- EduOS Migration 049 — Exam Attempt Status Compatibility
-- ============================================================

-- Backward compatibility only: some legacy paths still emit 'active'.
-- Keep the app canonical status as 'in_progress', but allow the old value so
-- production no longer fails on stale writes.
DO $$
BEGIN
  ALTER TYPE public.exam_attempt_status ADD VALUE 'active';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Normalize any existing rows that may already use the legacy value.
UPDATE public.exam_attempts
SET status = 'in_progress'
WHERE status::text = 'active';-- ============================================================
-- EduOS Migration 050 — exam_sessions.status column
-- ============================================================
-- Fixes: column "status" of relation "exam_sessions" does not exist
-- Legacy triggers/policies may reference status alongside is_active.

ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS violation_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.exam_sessions
SET status = CASE WHEN COALESCE(is_active, TRUE) THEN 'active' ELSE 'ended' END
WHERE status IS DISTINCT FROM CASE WHEN COALESCE(is_active, TRUE) THEN 'active' ELSE 'ended' END;

CREATE OR REPLACE FUNCTION public.sync_exam_session_status()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status IS NULL OR NEW.status = '' THEN
            NEW.status := CASE WHEN COALESCE(NEW.is_active, TRUE) THEN 'active' ELSE 'ended' END;
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
        NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'ended' END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_exam_session_status ON public.exam_sessions;
CREATE TRIGGER trg_sync_exam_session_status
    BEFORE INSERT OR UPDATE ON public.exam_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_exam_session_status();

CREATE OR REPLACE FUNCTION public.lock_exam_attempt(attempt_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.exam_attempts
    SET is_locked = TRUE
    WHERE id = lock_exam_attempt.attempt_id;

    UPDATE public.exam_sessions
    SET is_active = FALSE, status = 'ended', ended_at = NOW()
    WHERE attempt_id = lock_exam_attempt.attempt_id AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ============================================================
-- EduOS Migration 051 — test_violations.violation_count column
-- ============================================================
-- Fixes: column "violation_count" of relation "test_violations" does not exist
-- Required by record_and_check_violations() (migration 048).

ALTER TABLE public.test_violations
ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 1;

-- Backfill per-attempt sequence for existing rows.
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY attempt_id
            ORDER BY COALESCE(timestamp, created_at)
        )::INTEGER AS seq
    FROM public.test_violations
    WHERE violation_count IS NULL
)
UPDATE public.test_violations tv
SET violation_count = ranked.seq
FROM ranked
WHERE tv.id = ranked.id;

UPDATE public.test_violations
SET violation_count = 1
WHERE violation_count IS NULL;

-- Ensure the proctoring RPC matches the current schema.
CREATE OR REPLACE FUNCTION public.record_and_check_violations(
    p_attempt_id UUID,
    p_violation_type TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (
    violation_id UUID,
    total_violations INTEGER,
    should_auto_submit BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    v_violation_id UUID;
    v_total_violations INTEGER;
BEGIN
    UPDATE public.exam_attempts
    SET
        violation_count = COALESCE(violation_count, 0) + 1,
        last_violation_at = NOW()
    WHERE id = p_attempt_id
      AND status = 'in_progress'
      AND NOT is_locked
    RETURNING violation_count INTO v_total_violations;

    IF NOT FOUND THEN
        SELECT COALESCE(violation_count, 0)
        INTO v_total_violations
        FROM public.exam_attempts
        WHERE id = p_attempt_id;

        RETURN QUERY
        SELECT NULL::UUID, COALESCE(v_total_violations, 0), FALSE, 'Attempt is no longer active';
        RETURN;
    END IF;

    INSERT INTO public.test_violations (
        attempt_id,
        violation_type,
        violation_count,
        metadata
    )
    VALUES (
        p_attempt_id,
        p_violation_type,
        v_total_violations,
        COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_violation_id;

    IF v_total_violations >= 3 THEN
        UPDATE public.exam_attempts
        SET
            status = 'submitted',
            submitted_at = COALESCE(submitted_at, NOW()),
            is_locked = TRUE,
            auto_submit_reason = 'Exceeded maximum proctoring violations',
            last_violation_at = NOW()
        WHERE id = p_attempt_id;

        RETURN QUERY
        SELECT v_violation_id, v_total_violations, TRUE, 'Auto-submitted due to excessive violations';
        RETURN;
    END IF;

    UPDATE public.exam_attempts
    SET auto_submit_reason = NULL
    WHERE id = p_attempt_id;

    RETURN QUERY
    SELECT v_violation_id, v_total_violations, FALSE, 'Violation recorded';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.record_and_check_violations TO authenticated;
-- ============================================================
-- EduOS Migration 052 — Exam security schema repair (run once)
-- ============================================================
-- Use this when exam migrations were partially applied and you see errors like:
--   column "status" of relation "exam_sessions" does not exist
--   column "violation_count" of relation "test_violations" does not exist
-- Safe to re-run: every change is idempotent (IF NOT EXISTS / OR REPLACE).

-- ── exam_attempts ───────────────────────────────────────────────────────────
ALTER TABLE public.exam_attempts
ADD COLUMN IF NOT EXISTS current_session_id UUID,
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS fullscreen_violations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tab_switch_violations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS browser_fingerprint TEXT,
ADD COLUMN IF NOT EXISTS device_id TEXT,
ADD COLUMN IF NOT EXISTS ip_address TEXT,
ADD COLUMN IF NOT EXISTS last_violation_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_submit_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_exam_attempts_last_violation_at
  ON public.exam_attempts(last_violation_at);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_locked
  ON public.exam_attempts(is_locked);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_session
  ON public.exam_attempts(current_session_id);

-- ── exam_sessions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    session_token VARCHAR(256) NOT NULL UNIQUE,
    browser_fingerprint TEXT,
    device_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'active',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    violation_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS violation_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.exam_sessions
SET status = CASE WHEN COALESCE(is_active, TRUE) THEN 'active' ELSE 'ended' END
WHERE status IS DISTINCT FROM CASE WHEN COALESCE(is_active, TRUE) THEN 'active' ELSE 'ended' END;

-- ── test_violations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.test_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    violation_type TEXT NOT NULL,
    violation_count INTEGER DEFAULT 1,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.test_violations
ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY attempt_id
            ORDER BY COALESCE(timestamp, created_at)
        )::INTEGER AS seq
    FROM public.test_violations
    WHERE violation_count IS NULL
)
UPDATE public.test_violations tv
SET violation_count = ranked.seq
FROM ranked
WHERE tv.id = ranked.id;

UPDATE public.test_violations
SET violation_count = 1
WHERE violation_count IS NULL;

-- Align violation_type with app (TEXT), not a custom enum named violation_type.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'test_violations' AND column_name = 'violation_type'
    ) THEN
        ALTER TABLE public.test_violations
        ALTER COLUMN violation_type TYPE TEXT USING violation_type::TEXT;
    END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'exam_violations' AND column_name = 'violation_type'
    ) THEN
        ALTER TABLE public.exam_violations
        ALTER COLUMN violation_type TYPE TEXT USING violation_type::TEXT;
    END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'violation_type' AND typnamespace = 'public'::regnamespace) THEN
        DROP TYPE public.violation_type;
    END IF;
EXCEPTION WHEN dependent_objects_still_exist THEN NULL;
END $$;

-- Ensure attempt_id references exam_attempts (not another attempts table).
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'test_violations'
          AND c.contype = 'f'
          AND EXISTS (
              SELECT 1
              FROM unnest(c.conkey) AS col(attnum)
              JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = col.attnum
              WHERE a.attname = 'attempt_id'
          )
    LOOP
        EXECUTE format(
            'ALTER TABLE public.test_violations DROP CONSTRAINT IF EXISTS %I',
            r.conname
        );
    END LOOP;
END $$;

DELETE FROM public.test_violations tv
WHERE NOT EXISTS (
    SELECT 1 FROM public.exam_attempts ea WHERE ea.id = tv.attempt_id
);

ALTER TABLE public.test_violations
DROP CONSTRAINT IF EXISTS test_violations_attempt_id_fkey;

ALTER TABLE public.test_violations
ADD CONSTRAINT test_violations_attempt_id_fkey
    FOREIGN KEY (attempt_id)
    REFERENCES public.exam_attempts(id)
    ON DELETE CASCADE;

-- ── session status trigger ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_exam_session_status()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status IS NULL OR NEW.status = '' THEN
            NEW.status := CASE WHEN COALESCE(NEW.is_active, TRUE) THEN 'active' ELSE 'ended' END;
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
        NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'ended' END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_exam_session_status ON public.exam_sessions;
CREATE TRIGGER trg_sync_exam_session_status
    BEFORE INSERT OR UPDATE ON public.exam_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_exam_session_status();

-- ── RPCs used by the exam player ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lock_exam_attempt(attempt_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.exam_attempts
    SET is_locked = TRUE
    WHERE id = lock_exam_attempt.attempt_id;

    UPDATE public.exam_sessions
    SET is_active = FALSE, status = 'ended', ended_at = NOW()
    WHERE attempt_id = lock_exam_attempt.attempt_id AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.record_and_check_violations(
    p_attempt_id UUID,
    p_violation_type TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (
    violation_id UUID,
    total_violations INTEGER,
    should_auto_submit BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    v_violation_id UUID;
    v_total_violations INTEGER;
BEGIN
    IF p_attempt_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.exam_attempts WHERE id = p_attempt_id
    ) THEN
        RETURN QUERY
        SELECT NULL::UUID, 0, FALSE, 'Exam attempt not found';
        RETURN;
    END IF;

    UPDATE public.exam_attempts
    SET
        violation_count = COALESCE(violation_count, 0) + 1,
        last_violation_at = NOW()
    WHERE id = p_attempt_id
      AND status = 'in_progress'
      AND NOT is_locked
    RETURNING violation_count INTO v_total_violations;

    IF NOT FOUND THEN
        SELECT COALESCE(violation_count, 0)
        INTO v_total_violations
        FROM public.exam_attempts
        WHERE id = p_attempt_id;

        RETURN QUERY
        SELECT NULL::UUID, COALESCE(v_total_violations, 0), FALSE, 'Attempt is no longer active';
        RETURN;
    END IF;

    INSERT INTO public.test_violations (
        attempt_id,
        violation_type,
        violation_count,
        metadata
    )
    VALUES (
        p_attempt_id,
        p_violation_type::TEXT,
        v_total_violations,
        COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_violation_id;

    IF v_total_violations >= 3 THEN
        UPDATE public.exam_attempts
        SET
            status = 'submitted',
            submitted_at = COALESCE(submitted_at, NOW()),
            is_locked = TRUE,
            auto_submit_reason = 'Exceeded maximum proctoring violations',
            last_violation_at = NOW()
        WHERE id = p_attempt_id;

        RETURN QUERY
        SELECT v_violation_id, v_total_violations, TRUE, 'Auto-submitted due to excessive violations';
        RETURN;
    END IF;

    UPDATE public.exam_attempts
    SET auto_submit_reason = NULL
    WHERE id = p_attempt_id;

    RETURN QUERY
    SELECT v_violation_id, v_total_violations, FALSE, 'Violation recorded';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.auto_submit_expired_attempts()
RETURNS TABLE (
    attempt_id UUID,
    exam_id UUID,
    student_id UUID,
    submitted_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    UPDATE public.exam_attempts ea
    SET
        status = 'submitted',
        submitted_at = NOW(),
        is_locked = TRUE,
        auto_submit_reason = 'Time limit expired'
    WHERE
        ea.status = 'in_progress'
        AND NOT ea.is_locked
        AND NOW() > (ea.started_at + (
            SELECT COALESCE(e.duration_mins, 60) * INTERVAL '1 minute'
            FROM public.exams e
            WHERE e.id = ea.exam_id
        ))
    RETURNING ea.id, ea.exam_id, ea.student_id, ea.submitted_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_exam_attempt_violations(p_exam_id UUID)
RETURNS TABLE (
    attempt_id UUID,
    student_name TEXT,
    admission_no TEXT,
    violations INTEGER,
    status TEXT,
    last_violation_at TIMESTAMPTZ,
    auto_submit_reason TEXT,
    submitted_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ea.id AS attempt_id,
        u.name AS student_name,
        s.admission_no,
        COALESCE(ea.violation_count, 0) AS violations,
        ea.status::TEXT AS status,
        ea.last_violation_at,
        ea.auto_submit_reason,
        ea.submitted_at
    FROM public.exam_attempts ea
    JOIN public.students s ON s.id = ea.student_id
    JOIN public.users u ON u.id = s.user_id
    WHERE ea.exam_id = p_exam_id
    ORDER BY COALESCE(ea.last_violation_at, ea.submitted_at, ea.started_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.lock_exam_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_and_check_violations TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_submit_expired_attempts TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_attempt_violations TO authenticated;
-- ============================================================
-- EduOS Migration 053 — violation_type enum → TEXT
-- ============================================================
-- Fixes: column "violation_type" is of type violation_type but expression is of type text
-- The app and record_and_check_violations() pass plain text labels.

-- test_violations (proctoring log used by record_and_check_violations)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'test_violations'
          AND column_name = 'violation_type'
    ) THEN
        ALTER TABLE public.test_violations
        ALTER COLUMN violation_type TYPE TEXT USING violation_type::TEXT;
    END IF;
EXCEPTION
    WHEN others THEN
        -- Column may already be TEXT; ignore duplicate_alter errors.
        NULL;
END $$;

-- exam_violations (legacy direct inserts from exam.service)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'exam_violations'
          AND column_name = 'violation_type'
    ) THEN
        ALTER TABLE public.exam_violations
        ALTER COLUMN violation_type TYPE TEXT USING violation_type::TEXT;
    END IF;
EXCEPTION
    WHEN others THEN
        NULL;
END $$;

-- Remove orphaned enum if nothing else references it.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'violation_type' AND typnamespace = 'public'::regnamespace) THEN
        DROP TYPE public.violation_type;
    END IF;
EXCEPTION
    WHEN dependent_objects_still_exist THEN
        NULL;
END $$;
-- ============================================================
-- EduOS Migration 054 — test_violations.attempt_id FK repair
-- ============================================================
-- Fixes: insert on test_violations violates foreign key test_violations_attempt_id_fkey
-- Usually the FK pointed at the wrong table; it must reference exam_attempts(id).

-- Drop any existing FK on attempt_id (wrong target or duplicate name).
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'test_violations'
          AND c.contype = 'f'
          AND EXISTS (
              SELECT 1
              FROM unnest(c.conkey) AS col(attnum)
              JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = col.attnum
              WHERE a.attname = 'attempt_id'
          )
    LOOP
        EXECUTE format(
            'ALTER TABLE public.test_violations DROP CONSTRAINT IF EXISTS %I',
            r.conname
        );
    END LOOP;
END $$;

-- Remove rows that cannot belong to an exam attempt.
DELETE FROM public.test_violations tv
WHERE NOT EXISTS (
    SELECT 1 FROM public.exam_attempts ea WHERE ea.id = tv.attempt_id
);

ALTER TABLE public.test_violations
ADD CONSTRAINT test_violations_attempt_id_fkey
    FOREIGN KEY (attempt_id)
    REFERENCES public.exam_attempts(id)
    ON DELETE CASCADE;

-- Harden RPC: only log violations for real exam attempts.
CREATE OR REPLACE FUNCTION public.record_and_check_violations(
    p_attempt_id UUID,
    p_violation_type TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (
    violation_id UUID,
    total_violations INTEGER,
    should_auto_submit BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    v_violation_id UUID;
    v_total_violations INTEGER;
BEGIN
    IF p_attempt_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.exam_attempts WHERE id = p_attempt_id
    ) THEN
        RETURN QUERY
        SELECT NULL::UUID, 0, FALSE, 'Exam attempt not found';
        RETURN;
    END IF;

    UPDATE public.exam_attempts
    SET
        violation_count = COALESCE(violation_count, 0) + 1,
        last_violation_at = NOW()
    WHERE id = p_attempt_id
      AND status = 'in_progress'
      AND NOT is_locked
    RETURNING violation_count INTO v_total_violations;

    IF NOT FOUND THEN
        SELECT COALESCE(violation_count, 0)
        INTO v_total_violations
        FROM public.exam_attempts
        WHERE id = p_attempt_id;

        RETURN QUERY
        SELECT NULL::UUID, COALESCE(v_total_violations, 0), FALSE, 'Attempt is no longer active';
        RETURN;
    END IF;

    INSERT INTO public.test_violations (
        attempt_id,
        violation_type,
        violation_count,
        metadata
    )
    VALUES (
        p_attempt_id,
        p_violation_type::TEXT,
        v_total_violations,
        COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_violation_id;

    IF v_total_violations >= 3 THEN
        UPDATE public.exam_attempts
        SET
            status = 'submitted',
            submitted_at = COALESCE(submitted_at, NOW()),
            is_locked = TRUE,
            auto_submit_reason = 'Exceeded maximum proctoring violations',
            last_violation_at = NOW()
        WHERE id = p_attempt_id;

        RETURN QUERY
        SELECT v_violation_id, v_total_violations, TRUE, 'Auto-submitted due to excessive violations';
        RETURN;
    END IF;

    UPDATE public.exam_attempts
    SET auto_submit_reason = NULL
    WHERE id = p_attempt_id;

    RETURN QUERY
    SELECT v_violation_id, v_total_violations, FALSE, 'Violation recorded';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

ALTER FUNCTION public.record_and_check_violations(UUID, TEXT, JSONB) SET search_path = public;

GRANT EXECUTE ON FUNCTION public.record_and_check_violations TO authenticated;
-- ============================================================
-- EduOS Migration 055 — Assignment file upload RLS (production)
--
-- Fixes "new row violates row-level security policy" for:
--   • storage.objects in assignment-resources / assignment-submissions
--   • assignment_resources (admin/staff metadata inserts)
--   • submission_files (student metadata inserts)
--
-- Isolated to assignment upload paths only. No schema changes.
-- ============================================================

-- ── assignment_resources: admin + staff (explicit WITH CHECK for INSERT) ───

DROP POLICY IF EXISTS "admin_manage_resources" ON public.assignment_resources;

CREATE POLICY "admin_manage_resources" ON public.assignment_resources
  FOR ALL TO authenticated
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() IN ('admin', 'staff')
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() IN ('admin', 'staff')
    AND assignment_id IN (
      SELECT a.id
      FROM public.assignments a
      WHERE a.institute_id = public.get_my_institute_id()
    )
  );

-- ── submission_files: student-owned rows in own institute ─────────────────

DROP POLICY IF EXISTS "student_manage_own_submission_files" ON public.submission_files;

CREATE POLICY "student_manage_own_submission_files" ON public.submission_files
  FOR ALL TO authenticated
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'student'
    AND submission_id IN (
      SELECT sub.id
      FROM public.assignment_submissions sub
      JOIN public.students s ON s.id = sub.student_id
      WHERE s.user_id = auth.uid()
        AND sub.institute_id = public.get_my_institute_id()
    )
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'student'
    AND submission_id IN (
      SELECT sub.id
      FROM public.assignment_submissions sub
      JOIN public.students s ON s.id = sub.student_id
      WHERE s.user_id = auth.uid()
        AND sub.institute_id = public.get_my_institute_id()
    )
  );

-- ── storage: assignment-resources (admin + staff) ───────────────────────────

DROP POLICY IF EXISTS "Admins can upload resources" ON storage.objects;
CREATE POLICY "Admins can upload resources" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assignment-resources'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() IN ('admin', 'staff')
  );

DROP POLICY IF EXISTS "Admins can update resources" ON storage.objects;
CREATE POLICY "Admins can update resources" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'assignment-resources'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() IN ('admin', 'staff')
  )
  WITH CHECK (
    bucket_id = 'assignment-resources'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() IN ('admin', 'staff')
  );

DROP POLICY IF EXISTS "Admins can delete resources" ON storage.objects;
CREATE POLICY "Admins can delete resources" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'assignment-resources'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() IN ('admin', 'staff')
  );

-- ── storage: assignment-submissions (students; assignee-scoped path) ────────

DROP POLICY IF EXISTS "Students can upload submissions" ON storage.objects;
CREATE POLICY "Students can upload submissions" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assignment-submissions'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() = 'student'
    AND (storage.foldername(name))[2] = 'submissions'
    AND EXISTS (
      SELECT 1
      FROM public.assignment_assignees aa
      JOIN public.students s ON s.id = aa.student_id
      JOIN public.assignments a ON a.id = aa.assignment_id
      WHERE s.user_id = auth.uid()
        AND a.institute_id = public.get_my_institute_id()
        AND a.id::text = (storage.foldername(name))[3]
    )
  );

DROP POLICY IF EXISTS "Students can update own submissions" ON storage.objects;
CREATE POLICY "Students can update own submissions" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'assignment-submissions'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() = 'student'
    AND (storage.foldername(name))[2] = 'submissions'
    AND EXISTS (
      SELECT 1
      FROM public.assignment_assignees aa
      JOIN public.students s ON s.id = aa.student_id
      JOIN public.assignments a ON a.id = aa.assignment_id
      WHERE s.user_id = auth.uid()
        AND a.institute_id = public.get_my_institute_id()
        AND a.id::text = (storage.foldername(name))[3]
    )
  )
  WITH CHECK (
    bucket_id = 'assignment-submissions'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() = 'student'
    AND (storage.foldername(name))[2] = 'submissions'
    AND EXISTS (
      SELECT 1
      FROM public.assignment_assignees aa
      JOIN public.students s ON s.id = aa.student_id
      JOIN public.assignments a ON a.id = aa.assignment_id
      WHERE s.user_id = auth.uid()
        AND a.institute_id = public.get_my_institute_id()
        AND a.id::text = (storage.foldername(name))[3]
    )
  );
-- ============================================================
-- EduOS Migration 056 — Student read access for assignment resources
--
-- Allows assigned students to:
--   • SELECT assignment_resources metadata (RLS)
--   • SELECT storage objects in assignment-resources bucket
--
-- Isolated to assignment resource visibility. No upload changes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.student_can_read_assignment_resource(p_assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignment_assignees aa
    JOIN public.students s ON s.id = aa.student_id
    WHERE aa.assignment_id = p_assignment_id
      AND s.user_id = auth.uid()
      AND s.institute_id = public.get_my_institute_id()
  );
$$;

GRANT EXECUTE ON FUNCTION public.student_can_read_assignment_resource(uuid) TO authenticated;

DROP POLICY IF EXISTS "student_read_resources" ON public.assignment_resources;

CREATE POLICY "student_read_resources" ON public.assignment_resources
  FOR SELECT TO authenticated
  USING (
    public.get_my_role() = 'student'
    AND institute_id = public.get_my_institute_id()
    AND public.student_can_read_assignment_resource(assignment_id)
  );

DROP POLICY IF EXISTS "Students can read assignment resources" ON storage.objects;

CREATE POLICY "Students can read assignment resources" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'assignment-resources'
    AND (storage.foldername(name))[1] = public.get_my_institute_id()::text
    AND public.get_my_role() = 'student'
  );


-- ============================================================
-- RLS RECURSION FIXES (consolidated from fix-rls-recursion.sql)
-- ============================================================

-- =============================================================================
-- DEFINITIVE FIX: Infinite recursion in "students" table RLS
--
-- Strategy: Disable RLS on students, drop ALL policies, recreate with 
-- simple non-recursive policies that NEVER do subqueries against other 
-- RLS-protected tables.
--
-- Run this in Supabase Dashboard → SQL Editor
-- =============================================================================

-- Step 0: Temporarily disable RLS so we can drop and recreate policies
ALTER TABLE public.students DISABLE ROW LEVEL SECURITY;

-- Step 1: Drop EVERY policy on students (catch-all)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'students' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.students', pol.policyname);
  END LOOP;
END $$;

-- Step 2: Recreate helper functions with row_security = off
-- These MUST have row_security = off to prevent any recursion

CREATE OR REPLACE FUNCTION public.get_my_institute_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT institute_id FROM public.users WHERE id = auth.uid();
$$;

-- Recreate get_my_role keeping original return type (user_role enum)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin');
$$;

-- Step 3: Create simple, non-recursive policies
-- RULE: No policy on students may query student_parents, parents, staff, 
-- staff_assignments, or any table that has policies referencing students.

-- Super admin: full access
CREATE POLICY "students_superadmin"
  ON public.students FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Admin: full access within own institute (institute_id check is safe — no subquery)
CREATE POLICY "students_admin_all"
  ON public.students FOR ALL
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'admin'::user_role
  )
  WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'admin'::user_role
  );

-- Staff: read all students in own institute (simple check, no subquery)
CREATE POLICY "students_staff_select"
  ON public.students FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'::user_role
  );

-- Student: read own record only (direct column check, no subquery)
CREATE POLICY "students_own_select"
  ON public.students FOR SELECT
  USING (user_id = auth.uid());

-- Parent: read linked children using a SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.parent_can_read_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_parents sp
    JOIN public.parents p ON p.id = sp.parent_id
    WHERE sp.student_id = p_student_id
      AND p.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.parent_can_read_student(UUID) TO authenticated;

CREATE POLICY "students_parent_select"
  ON public.students FOR SELECT
  USING (
    public.get_my_role() = 'parent'::user_role
    AND public.parent_can_read_student(id)
  );

-- Step 4: Re-enable RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Step 5: Force RLS for all roles except postgres superuser
ALTER TABLE public.students FORCE ROW LEVEL SECURITY;

-- Done! Verify with: SELECT * FROM pg_policies WHERE tablename = 'students';


-- ============================================================
-- ADDITIONAL MIGRATIONS (from migrations/all_migrations.sql)
-- ============================================================

-- =============================================================================
-- EliteClass — Consolidated Database Migrations
--
-- This file contains all migrations for the EliteClass platform.
-- Run this against a fresh database or use individual sections as needed.
--
-- Sections:
--   1. Batch Join Requests
--   2. Certificate Templates & Issued Certificates
--   3. Exam Proctoring Columns
--   4. Notifications
--   5. Translation Cache
--   6. Direct Messaging (DM)
--   7. Extend Messages Table (Rich Messages)
--   8. Student Enrollment RLS Fixes
--   9. Student Profile Update RLS Fixes
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. BATCH JOIN REQUESTS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.batch_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reason TEXT,
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_join_requests_unique_pending
  ON public.batch_join_requests (student_id, batch_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_batch_join_requests_student ON public.batch_join_requests (student_id);
CREATE INDEX IF NOT EXISTS idx_batch_join_requests_institute_status ON public.batch_join_requests (institute_id, status);
CREATE INDEX IF NOT EXISTS idx_batch_join_requests_batch ON public.batch_join_requests (batch_id);

ALTER TABLE public.batch_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_view_own_requests" ON public.batch_join_requests
  FOR SELECT USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

CREATE POLICY "students_create_own_requests" ON public.batch_join_requests
  FOR INSERT WITH CHECK (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

CREATE POLICY "students_cancel_own_requests" ON public.batch_join_requests
  FOR UPDATE USING (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    AND status = 'pending'
  ) WITH CHECK (status = 'cancelled');

CREATE POLICY "staff_view_institute_requests" ON public.batch_join_requests
  FOR SELECT USING (institute_id = get_my_institute_id() AND get_my_role() IN ('admin', 'staff'));

CREATE POLICY "staff_update_requests" ON public.batch_join_requests
  FOR UPDATE USING (institute_id = get_my_institute_id() AND get_my_role() IN ('admin', 'staff'));

CREATE POLICY "admin_all_requests" ON public.batch_join_requests
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. CERTIFICATE TEMPLATES & ISSUED CERTIFICATES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.certificate_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  body_text TEXT NOT NULL,
  logo_url TEXT,
  seal_url TEXT,
  signatory_name TEXT NOT NULL,
  signatory_designation TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certificate_templates_institute ON public.certificate_templates (institute_id);

CREATE TABLE IF NOT EXISTS public.issued_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.certificate_templates(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  issued_by UUID NOT NULL REFERENCES public.users(id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  custom_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_issued_certificates_student ON public.issued_certificates (student_id);
CREATE INDEX IF NOT EXISTS idx_issued_certificates_institute ON public.issued_certificates (institute_id);
CREATE INDEX IF NOT EXISTS idx_issued_certificates_template ON public.issued_certificates (template_id);

ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issued_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_staff_manage_templates" ON public.certificate_templates
  FOR ALL USING (institute_id = get_my_institute_id() AND get_my_role() IN ('admin', 'staff'));

CREATE POLICY "admin_staff_manage_issued" ON public.issued_certificates
  FOR ALL USING (institute_id = get_my_institute_id() AND get_my_role() IN ('admin', 'staff'));

CREATE POLICY "students_view_own_certificates" ON public.issued_certificates
  FOR SELECT USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

CREATE POLICY "super_admin_templates" ON public.certificate_templates
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "super_admin_issued" ON public.issued_certificates
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. EXAM PROCTORING COLUMNS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS enable_tab_detection BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS enable_camera_mic BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS enable_deterrent_ui BOOLEAN NOT NULL DEFAULT FALSE;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════════════════════

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

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_id, is_read, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_recent
  ON public.notifications (recipient_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_notifications" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "users_update_own_notifications" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid());

CREATE POLICY "admin_staff_insert_notifications" ON public.notifications
  FOR INSERT WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() IN ('admin', 'staff')
    AND sender_id = auth.uid()
  );

CREATE POLICY "super_admin_notifications" ON public.notifications
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. TRANSLATION CACHE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.translation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_text_hash VARCHAR(64) NOT NULL,
  source_lang VARCHAR(10) NOT NULL,
  target_lang VARCHAR(10) NOT NULL,
  translated_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  UNIQUE(source_text_hash, source_lang, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_translation_cache_lookup
  ON public.translation_cache (source_text_hash, source_lang, target_lang, expires_at);

ALTER TABLE public.translation_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_cache" ON public.translation_cache
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_insert_cache" ON public.translation_cache
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "super_admin_translation_cache" ON public.translation_cache
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. DIRECT MESSAGING (DM)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.dm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  participant_1_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  participant_2_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  UNIQUE(participant_1_id, participant_2_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_conversations_participant_1 ON public.dm_conversations (participant_1_id);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_participant_2 ON public.dm_conversations (participant_2_id);

CREATE TABLE IF NOT EXISTS public.dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT,
  message_type VARCHAR(20) NOT NULL DEFAULT 'text',
  gif_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation ON public.dm_messages (conversation_id, created_at DESC);

ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants_view_own_conversations" ON public.dm_conversations
  FOR SELECT USING (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

CREATE POLICY "participants_create_conversations" ON public.dm_conversations
  FOR INSERT WITH CHECK (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

CREATE POLICY "participants_update_own_conversations" ON public.dm_conversations
  FOR UPDATE USING (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

CREATE POLICY "participants_read_messages" ON public.dm_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM public.dm_conversations
      WHERE participant_1_id = auth.uid() OR participant_2_id = auth.uid()
    )
  );

CREATE POLICY "participants_send_messages" ON public.dm_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM public.dm_conversations
      WHERE participant_1_id = auth.uid() OR participant_2_id = auth.uid()
    )
  );

CREATE POLICY "super_admin_dm_conversations" ON public.dm_conversations
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "super_admin_dm_messages" ON public.dm_messages
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. EXTEND MESSAGES TABLE (Rich Messages — GIF, Emoji)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'text';

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS gif_url TEXT;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS metadata JSONB;

ALTER TABLE public.messages
  ALTER COLUMN content DROP NOT NULL;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_content_length;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_check CHECK (
    CASE
      WHEN message_type = 'text' THEN
        content IS NOT NULL AND char_length(content) > 0 AND char_length(content) <= 4000
      WHEN message_type = 'gif' THEN
        gif_url IS NOT NULL AND char_length(gif_url) > 0
      WHEN message_type = 'emoji' THEN
        content IS NOT NULL AND char_length(content) > 0 AND char_length(content) <= 4000
      ELSE
        content IS NOT NULL AND char_length(content) > 0 AND char_length(content) <= 4000
    END
  );

ALTER TABLE public.messages
  ADD CONSTRAINT messages_type_check CHECK (message_type IN ('text', 'gif', 'emoji'));


-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. STUDENT ENROLLMENT RLS FIXES
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "lms_enroll_student_self" ON public.lms_enrollments;
CREATE POLICY "lms_enroll_student_self" ON public.lms_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
    AND enrolled_by = auth.uid()
    AND course_id IN (
      SELECT id FROM public.lms_courses
      WHERE institute_id = get_my_institute_id()
        AND status = 'published'
        AND visibility IN ('public', 'institutional')
    )
  );

DROP POLICY IF EXISTS "lms_enroll_student_self_update" ON public.lms_enrollments;
CREATE POLICY "lms_enroll_student_self_update" ON public.lms_enrollments
  FOR UPDATE TO authenticated
  USING (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
  )
  WITH CHECK (
    get_my_role() = 'student'
    AND student_id = auth.uid()
    AND institute_id = get_my_institute_id()
    AND status IN ('active', 'completed')
  );

DROP POLICY IF EXISTS "lms_course_student_browse_published" ON public.lms_courses;
CREATE POLICY "lms_course_student_browse_published" ON public.lms_courses
  FOR SELECT TO authenticated
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND status = 'published'
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. STUDENT PROFILE UPDATE RLS FIXES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_my_student_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT id FROM public.students WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_student_id() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_own_update' AND tablename = 'students'
  ) THEN
    EXECUTE 'CREATE POLICY "students_own_update" ON public.students FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_insert_parent_user' AND tablename = 'users'
  ) THEN
    EXECUTE 'CREATE POLICY "students_insert_parent_user" ON public.users FOR INSERT WITH CHECK (
      institute_id = public.get_my_institute_id()
      AND role = ''parent''
      AND public.get_my_role() = ''student''::user_role
    )';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_insert_parent_record' AND tablename = 'parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_insert_parent_record" ON public.parents FOR INSERT WITH CHECK (
      institute_id = public.get_my_institute_id()
      AND public.get_my_role() = ''student''::user_role
    )';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_insert_student_parents' AND tablename = 'student_parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_insert_student_parents" ON public.student_parents FOR INSERT WITH CHECK (
      student_id = public.get_my_student_id()
    )';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_select_own_parents' AND tablename = 'student_parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_select_own_parents" ON public.student_parents FOR SELECT USING (
      student_id = public.get_my_student_id()
    )';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.student_can_read_parent(p_parent_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_parents
    WHERE student_id = (SELECT id FROM public.students WHERE user_id = auth.uid() LIMIT 1)
      AND parent_id = p_parent_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.student_can_read_parent(UUID) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'students_select_parent_users' AND tablename = 'parents'
  ) THEN
    EXECUTE 'CREATE POLICY "students_select_parent_users" ON public.parents FOR SELECT USING (
      public.get_my_role() = ''student''::user_role
      AND public.student_can_read_parent(id)
    )';
  END IF;
END $$;


-- =============================================================================
-- exam-reattempts-and-offline-caching (spec)
-- Adds: exams.max_attempts column, exam_attempt_overrides, exam_score_audits,
--       offline_conflicts, enforce_exam_attempt_limit trigger, start_exam_attempt
--       and update_exam_score RPCs, all required RLS.
--
-- Schema notes / deviations from spec brief, recorded for future readers:
--   * This codebase has NO `exam_results` table — score lives on
--     `exam_attempts.score`. Therefore `exam_score_audits` references
--     `exam_attempts(id)` (column `attempt_id`) and `update_exam_score`
--     takes `p_attempt_id` and UPDATEs `exam_attempts.score`.
--   * `exams.max_marks` does NOT exist; the maximum is `exams.total_marks`.
--     `update_exam_score` validates the new score against `total_marks`.
--   * The audit log table is `activity_logs` (not `user_activity_logs`).
--     Columns: id, institute_id, user_id, action, entity_type, entity_id,
--     metadata, created_at.
--   * `exam_attempts.institute_id` is NOT NULL, so `start_exam_attempt`
--     resolves it from the parent exam before INSERT.
--   * `exam_attempts.attempt_number` does not exist on legacy rows; we add
--     it via ALTER TABLE ADD COLUMN IF NOT EXISTS.
--   * Helper functions (`get_my_role()`, `get_my_institute_id()`,
--     `get_my_student_id()`, `is_super_admin()`) live in the `public`
--     schema and are referenced as `public.<helper>()`.
-- =============================================================================

-- ── 1. exams.max_attempts ───────────────────────────────────────────────────
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE public.exams
    ADD CONSTRAINT exams_max_attempts_range
    CHECK (max_attempts BETWEEN 0 AND 9999);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.exams.max_attempts IS
  '0 = unlimited; positive integer = hard cap; NULL not permitted';

-- ── 2. exam_attempts.attempt_number (added; legacy rows default to 1) ──────
ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;

-- Partial unique index: at most one un-submitted attempt per (student, exam)
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_attempt
  ON public.exam_attempts (student_id, exam_id)
  WHERE submitted_at IS NULL;

-- ── 3. exam_attempt_overrides ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_attempt_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     UUID NOT NULL REFERENCES public.exams(id)    ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  granted_by  UUID NOT NULL REFERENCES auth.users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ NULL,
  reason      TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_eao_exam_student
  ON public.exam_attempt_overrides (exam_id, student_id)
  WHERE consumed_at IS NULL;

ALTER TABLE public.exam_attempt_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eao_select" ON public.exam_attempt_overrides;
CREATE POLICY "eao_select"
  ON public.exam_attempt_overrides FOR SELECT
  USING (
    -- super_admin always
    public.is_super_admin()
    -- student can read their own overrides
    OR student_id = public.get_my_student_id()
    -- staff/admin within the exam's institute
    OR (
      public.get_my_role() IN ('staff', 'admin')
      AND (SELECT institute_id FROM public.exams WHERE id = exam_id)
          = public.get_my_institute_id()
    )
  );

DROP POLICY IF EXISTS "eao_write" ON public.exam_attempt_overrides;
CREATE POLICY "eao_write"
  ON public.exam_attempt_overrides FOR ALL
  USING (
    public.is_super_admin()
    OR (
      public.get_my_role() IN ('staff', 'admin')
      AND (SELECT institute_id FROM public.exams WHERE id = exam_id)
          = public.get_my_institute_id()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_my_role() IN ('staff', 'admin')
      AND (SELECT institute_id FROM public.exams WHERE id = exam_id)
          = public.get_my_institute_id()
    )
  );

-- ── 4. enforce_exam_attempt_limit() trigger ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_exam_attempt_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_max   INTEGER;
  v_count INTEGER;
  v_extra INTEGER;
BEGIN
  SELECT max_attempts INTO v_max
    FROM public.exams
   WHERE id = NEW.exam_id;

  IF v_max IS NULL THEN
    RAISE EXCEPTION 'exam not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- 0 = unlimited
  IF v_max = 0 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.exam_attempts
   WHERE exam_id = NEW.exam_id
     AND student_id = NEW.student_id;

  SELECT count(*) INTO v_extra
    FROM public.exam_attempt_overrides
   WHERE exam_id = NEW.exam_id
     AND student_id = NEW.student_id
     AND consumed_at IS NULL;

  IF v_count >= v_max + v_extra THEN
    RAISE EXCEPTION
      'attempt limit reached: % of % (overrides: %)',
      v_count, v_max, v_extra
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_exam_attempt_limit ON public.exam_attempts;
CREATE TRIGGER trg_enforce_exam_attempt_limit
  BEFORE INSERT ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_exam_attempt_limit();

-- ── 5. start_exam_attempt(p_exam_id) RPC ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_exam_attempt(p_exam_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_student     UUID;
  v_institute   UUID;
  v_max         INTEGER;
  v_count       INTEGER;
  v_attempt_id  UUID;
  v_override_id UUID;
BEGIN
  v_student := public.get_my_student_id();
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'not a student' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Resolve exam metadata (institute_id is NOT NULL on exam_attempts)
  SELECT institute_id, max_attempts
    INTO v_institute, v_max
    FROM public.exams
   WHERE id = p_exam_id;

  IF v_institute IS NULL THEN
    RAISE EXCEPTION 'exam not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Existing attempts for this (student, exam)
  SELECT count(*) INTO v_count
    FROM public.exam_attempts
   WHERE exam_id = p_exam_id
     AND student_id = v_student;

  -- Insert new attempt; the BEFORE INSERT trigger will enforce the limit
  -- (taking active overrides into account).
  INSERT INTO public.exam_attempts (
    id, exam_id, student_id, institute_id,
    started_at, attempt_number
  )
  VALUES (
    gen_random_uuid(), p_exam_id, v_student, v_institute,
    now(), v_count + 1
  )
  RETURNING id INTO v_attempt_id;

  -- If this attempt is only possible because of an override, consume the
  -- oldest unconsumed override for this (student, exam) pair.
  IF v_max > 0 AND (v_count + 1) > v_max THEN
    SELECT id INTO v_override_id
      FROM public.exam_attempt_overrides
     WHERE exam_id = p_exam_id
       AND student_id = v_student
       AND consumed_at IS NULL
     ORDER BY granted_at
     LIMIT 1;

    IF v_override_id IS NOT NULL THEN
      UPDATE public.exam_attempt_overrides
         SET consumed_at = now()
       WHERE id = v_override_id;
    END IF;
  END IF;

  RETURN v_attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_exam_attempt(UUID) TO authenticated;

-- ── 6. exam_score_audits (append-only) ──────────────────────────────────────
-- NOTE: references exam_attempts(id) since this codebase has no exam_results.
CREATE TABLE IF NOT EXISTS public.exam_score_audits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id     UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  exam_id        UUID NOT NULL REFERENCES public.exams(id)         ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES public.students(id)      ON DELETE CASCADE,
  editor_user_id UUID NOT NULL REFERENCES auth.users(id),
  edited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_score      NUMERIC NOT NULL,
  new_score      NUMERIC NOT NULL,
  reason         TEXT NOT NULL CHECK (length(reason) BETWEEN 3 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_esa_exam_edited_at
  ON public.exam_score_audits (exam_id, edited_at DESC);

ALTER TABLE public.exam_score_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "esa_select" ON public.exam_score_audits;
CREATE POLICY "esa_select"
  ON public.exam_score_audits FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.get_my_role() IN ('staff', 'admin')
      AND (SELECT institute_id FROM public.exams WHERE id = exam_id)
          = public.get_my_institute_id()
    )
  );

DROP POLICY IF EXISTS "esa_insert" ON public.exam_score_audits;
CREATE POLICY "esa_insert"
  ON public.exam_score_audits FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_my_role() IN ('staff', 'admin')
      AND (SELECT institute_id FROM public.exams WHERE id = exam_id)
          = public.get_my_institute_id()
    )
  );

DROP POLICY IF EXISTS "esa_update_super" ON public.exam_score_audits;
CREATE POLICY "esa_update_super"
  ON public.exam_score_audits FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "esa_delete_super" ON public.exam_score_audits;
CREATE POLICY "esa_delete_super"
  ON public.exam_score_audits FOR DELETE
  USING (public.is_super_admin());

-- ── 7. offline_conflicts ────────────────────────────────────────────────────
-- TODO: denormalize an institute_id column onto offline_conflicts so that
-- staff/admin can have institute-scoped SELECT without a per-entity_type
-- join. Until then, app layer filters; DB-side RLS limits to admin/super.
CREATE TABLE IF NOT EXISTS public.offline_conflicts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type              TEXT NOT NULL,
  entity_id                UUID NOT NULL,
  actor_user_id            UUID NOT NULL REFERENCES auth.users(id),
  client_base_updated_at   TIMESTAMPTZ NULL,
  server_updated_at        TIMESTAMPTZ NOT NULL,
  client_payload           JSONB NOT NULL,
  server_payload           JSONB NOT NULL,
  resolution               TEXT NOT NULL CHECK (resolution IN ('last-writer-wins')),
  resolved_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolver_user_id         UUID NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_oc_entity_resolved_at
  ON public.offline_conflicts (entity_type, entity_id, resolved_at DESC);

ALTER TABLE public.offline_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oc_select" ON public.offline_conflicts;
CREATE POLICY "oc_select"
  ON public.offline_conflicts FOR SELECT
  USING (
    public.is_super_admin()
    OR public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "oc_insert" ON public.offline_conflicts;
CREATE POLICY "oc_insert"
  ON public.offline_conflicts FOR INSERT
  WITH CHECK (actor_user_id = auth.uid());

DROP POLICY IF EXISTS "oc_update_super" ON public.offline_conflicts;
CREATE POLICY "oc_update_super"
  ON public.offline_conflicts FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "oc_delete_super" ON public.offline_conflicts;
CREATE POLICY "oc_delete_super"
  ON public.offline_conflicts FOR DELETE
  USING (public.is_super_admin());

-- ── 8. update_exam_score(p_attempt_id, p_new_score, p_reason) RPC ───────────
-- Single-transaction: validates input, updates exam_attempts.score, inserts
-- audit row, and writes to activity_logs. SECURITY DEFINER so RLS doesn't
-- block the audit/activity inserts; permission is enforced explicitly via
-- get_my_role() and institute checks.
CREATE OR REPLACE FUNCTION public.update_exam_score(
  p_attempt_id UUID,
  p_new_score  NUMERIC,
  p_reason     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role        user_role;
  v_old_score   NUMERIC;
  v_exam_id     UUID;
  v_student_id  UUID;
  v_institute   UUID;
  v_total_marks NUMERIC;
BEGIN
  v_role := public.get_my_role();
  IF v_role IS NULL OR v_role NOT IN ('staff', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Load attempt
  SELECT score, exam_id, student_id, institute_id
    INTO v_old_score, v_exam_id, v_student_id, v_institute
    FROM public.exam_attempts
   WHERE id = p_attempt_id;

  IF v_exam_id IS NULL THEN
    RAISE EXCEPTION 'attempt not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Institute scoping for staff/admin (super_admin bypasses)
  IF v_role <> 'super_admin'
     AND v_institute <> public.get_my_institute_id() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Load max score from exam
  SELECT total_marks INTO v_total_marks
    FROM public.exams
   WHERE id = v_exam_id;

  -- Guard: total_marks may be 0/NULL on legacy/draft exams; treat NULL as 0.
  v_total_marks := COALESCE(v_total_marks, 0);

  -- Validate inputs
  IF p_new_score IS NULL
     OR p_new_score < 0
     OR p_new_score > v_total_marks THEN
    RAISE EXCEPTION
      'invalid input: new_score must be between 0 and % (got %)',
      v_total_marks, p_new_score
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_reason IS NULL
     OR length(p_reason) < 3
     OR length(p_reason) > 500 THEN
    RAISE EXCEPTION
      'invalid input: reason must be between 3 and 500 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Apply change
  UPDATE public.exam_attempts
     SET score = p_new_score
   WHERE id = p_attempt_id;

  -- Audit row
  INSERT INTO public.exam_score_audits (
    attempt_id, exam_id, student_id, editor_user_id,
    old_score, new_score, reason
  )
  VALUES (
    p_attempt_id, v_exam_id, v_student_id, auth.uid(),
    COALESCE(v_old_score, 0), p_new_score, p_reason
  );

  -- Platform-wide activity feed
  INSERT INTO public.activity_logs (
    institute_id, user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    v_institute,
    auth.uid(),
    'exam.score_edit',
    'exam_attempts',
    p_attempt_id,
    jsonb_build_object(
      'old_score', COALESCE(v_old_score, 0),
      'new_score', p_new_score,
      'reason',    p_reason,
      'exam_id',   v_exam_id,
      'student_id', v_student_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.update_exam_score(UUID, NUMERIC, TEXT)
  TO authenticated;

-- =============================================================================
-- end exam-reattempts-and-offline-caching (spec)
-- =============================================================================

-- =============================================================================
-- fix: request_assignment_resubmit SECURITY DEFINER RPC
-- Lets staff/admin bypass student-only RLS on assignment_submissions UPDATE.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.request_assignment_resubmit(p_submission_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role user_role;
BEGIN
  v_role := public.get_my_role();
  IF v_role IS NULL OR v_role NOT IN ('staff', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Remove attached files
  DELETE FROM public.submission_files WHERE submission_id = p_submission_id;

  -- Clear data and request resubmit but KEEP submitted_at (NOT NULL constraint).
  -- Setting it to NULL violates the constraint; keep the original timestamp so
  -- the row records when the student first submitted.
  UPDATE public.assignment_submissions
     SET status       = 'resubmit_requested',
         content      = NULL,
         grade        = NULL,
         feedback     = NULL,
         graded_at    = NULL,
         graded_by    = NULL,
         is_late      = FALSE
   WHERE id = p_submission_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.request_assignment_resubmit(UUID) TO authenticated;
-- =============================================================================
