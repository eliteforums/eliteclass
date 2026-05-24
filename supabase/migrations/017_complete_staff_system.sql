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
