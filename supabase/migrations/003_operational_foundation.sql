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
