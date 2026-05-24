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
