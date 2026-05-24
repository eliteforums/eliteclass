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
