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
