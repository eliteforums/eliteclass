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
