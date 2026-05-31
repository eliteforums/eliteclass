-- =============================================================================
-- BACKFILL: Create parent records from existing emergency_contact data
--
-- For students who already filled the profile form but parent records were
-- never created (due to RLS blocking the INSERT), this script creates them
-- from the emergency_contact JSON stored on the students table.
--
-- Run ONCE in Supabase SQL Editor after deploying fix_parent_creation.sql
-- =============================================================================

DO $$
DECLARE
  rec RECORD;
  v_parent_user_id UUID;
  v_parent_id UUID;
  v_existing_parent_id UUID;
  v_count INTEGER := 0;
BEGIN
  -- Loop through all students who have emergency_contact filled
  -- but don't have a linked parent record
  FOR rec IN
    SELECT 
      s.id AS student_id,
      s.institute_id,
      s.emergency_contact->>'name' AS ec_name,
      s.emergency_contact->>'phone' AS ec_phone,
      s.emergency_contact->>'relation' AS ec_relation,
      s.user_id,
      u.name AS student_name
    FROM public.students s
    JOIN public.users u ON u.id = s.user_id
    WHERE s.emergency_contact IS NOT NULL
      AND s.emergency_contact->>'name' IS NOT NULL
      AND s.emergency_contact->>'name' != ''
      AND s.id NOT IN (
        SELECT student_id FROM public.student_parents
      )
  LOOP
    -- Generate email from name (lowercase, no spaces) + student_id prefix
    -- This is a placeholder email since we don't have the real one
    DECLARE
      v_email TEXT := lower(regexp_replace(rec.ec_name, '[^a-zA-Z0-9]', '', 'g')) || '.' || substr(rec.student_id::text, 1, 8) || '@parent.eliteclass.local';
      v_relation TEXT := COALESCE(rec.ec_relation, 'guardian');
    BEGIN
      -- Check if relation type is valid
      IF v_relation NOT IN ('father', 'mother', 'guardian', 'sibling', 'other') THEN
        v_relation := 'guardian';
      END IF;

      -- Create parent user record
      v_parent_user_id := gen_random_uuid();
      
      INSERT INTO public.users (id, institute_id, role, name, email, phone, is_active)
      VALUES (
        v_parent_user_id,
        rec.institute_id,
        'parent',
        rec.ec_name,
        v_email,
        rec.ec_phone,
        TRUE
      )
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone
      RETURNING id INTO v_parent_user_id;

      -- Check if parent record already exists for this user
      SELECT id INTO v_existing_parent_id
      FROM public.parents
      WHERE user_id = v_parent_user_id;

      IF v_existing_parent_id IS NULL THEN
        -- Create parent record
        INSERT INTO public.parents (institute_id, user_id, occupation)
        VALUES (rec.institute_id, v_parent_user_id, NULL)
        RETURNING id INTO v_parent_id;
      ELSE
        v_parent_id := v_existing_parent_id;
      END IF;

      -- Link student to parent
      INSERT INTO public.student_parents (student_id, parent_id, relation_type)
      VALUES (rec.student_id, v_parent_id, v_relation::relation_type)
      ON CONFLICT (student_id, parent_id) DO NOTHING;

      v_count := v_count + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue with next student
      RAISE NOTICE 'Failed to create parent for student %: %', rec.student_id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Backfill complete: created % parent records', v_count;
END $$;
