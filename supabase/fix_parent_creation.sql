-- =============================================================================
-- FIX: Parent Creation via SECURITY DEFINER Function
--
-- Problem: Students can't INSERT into the `users` table for parent records
-- because the RLS policy only allows inserting rows where id = auth.uid().
-- A parent user has a DIFFERENT id, so the INSERT is blocked.
--
-- Solution: Create a SECURITY DEFINER function that bypasses RLS to create
-- the parent user + parent record + student_parents link atomically.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_parent_for_student(
  p_student_id UUID,
  p_institute_id UUID,
  p_parent_name TEXT,
  p_parent_email TEXT,
  p_parent_phone TEXT,
  p_relation TEXT DEFAULT 'guardian'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_parent_user_id UUID;
  v_parent_id UUID;
  v_existing_user_id UUID;
  v_existing_parent_id UUID;
BEGIN
  -- Validate that the caller owns this student record
  IF NOT EXISTS (
    SELECT 1 FROM public.students WHERE id = p_student_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: You can only create parents for your own student record.';
  END IF;

  -- Check if a user with this email already exists in the institute
  SELECT id INTO v_existing_user_id
  FROM public.users
  WHERE email = p_parent_email AND institute_id = p_institute_id
  LIMIT 1;

  IF v_existing_user_id IS NOT NULL THEN
    -- User exists — update name/phone
    UPDATE public.users
    SET name = p_parent_name, phone = p_parent_phone, updated_at = now()
    WHERE id = v_existing_user_id;

    v_parent_user_id := v_existing_user_id;
  ELSE
    -- Create new user with role 'parent'
    v_parent_user_id := gen_random_uuid();
    INSERT INTO public.users (id, institute_id, role, name, email, phone, is_active)
    VALUES (v_parent_user_id, p_institute_id, 'parent', p_parent_name, p_parent_email, p_parent_phone, TRUE);
  END IF;

  -- Check if parent record exists
  SELECT id INTO v_existing_parent_id
  FROM public.parents
  WHERE user_id = v_parent_user_id;

  IF v_existing_parent_id IS NOT NULL THEN
    v_parent_id := v_existing_parent_id;
  ELSE
    -- Create parent record
    INSERT INTO public.parents (institute_id, user_id, occupation)
    VALUES (p_institute_id, v_parent_user_id, NULL)
    RETURNING id INTO v_parent_id;
  END IF;

  -- Link student to parent (ignore if already linked)
  INSERT INTO public.student_parents (student_id, parent_id, relation_type)
  VALUES (p_student_id, v_parent_id, p_relation::relation_type)
  ON CONFLICT (student_id, parent_id) DO NOTHING;

  RETURN json_build_object(
    'parent_user_id', v_parent_user_id,
    'parent_id', v_parent_id,
    'success', TRUE
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'error', SQLERRM,
    'success', FALSE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_parent_for_student(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
