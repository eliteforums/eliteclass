// ---------------------------------------------------------------------------
// Parent Management Implementation Guide
//
// This document outlines the complete parent creation and student linking
// system for EduOS, including the database schema, backend RPC requirements,
// and frontend integration points.
// ---------------------------------------------------------------------------

/**
 * BACKEND RPC REQUIREMENTS
 * =======================
 * 
 * The Supabase `admit_student` RPC needs to be extended with parent creation
 * capability. When the frontend passes parent details, the RPC should:
 * 
 * 1. Check if parent with the given email exists in this institute
 * 2. If not, create:
 *    - Auth user (via supabase.auth.admin.createUser())
 *    - `users` profile row (via trigger: handle_new_user)
 *    - `parents` row with occupation
 * 3. Link parent to student via `student_parents` table
 * 4. Atomically return both student and parent IDs on success
 * 
 * PostgreSQL Function Signature:
 * 
 * ```sql
 * CREATE OR REPLACE FUNCTION public.admit_student(
 *   p_institute_id UUID,
 *   p_name TEXT,
 *   p_email TEXT,
 *   p_phone TEXT,
 *   p_admission_no TEXT,
 *   p_batch_id UUID,
 *   p_aadhaar_last4 TEXT,
 *   p_emergency_contact JSONB,
 *   -- NEW PARENT PARAMETERS
 *   p_parent_name TEXT DEFAULT NULL,
 *   p_parent_email TEXT DEFAULT NULL,
 *   p_parent_phone TEXT DEFAULT NULL,
 *   p_parent_occupation TEXT DEFAULT NULL,
 *   p_parent_relation_type TEXT DEFAULT NULL
 * ) RETURNS JSONB AS $$
 * BEGIN
 *   -- ... existing student creation logic ...
 *   
 *   -- Parent creation logic (if parent_name is provided)
 *   IF p_parent_name IS NOT NULL AND p_parent_email IS NOT NULL THEN
 *     PERFORM create_parent_and_link(
 *       p_institute_id,
 *       student_id,
 *       p_parent_name,
 *       p_parent_email,
 *       p_parent_phone,
 *       p_parent_occupation,
 *       p_parent_relation_type
 *     );
 *   END IF;
 *   
 *   RETURN jsonb_build_object(
 *     'student_id', student_id,
 *     'admission_no', p_admission_no
 *   );
 * END;
 * $$ LANGUAGE plpgsql SECURITY DEFINER;
 * ```
 * 
 * Helper RPC for parent creation:
 * 
 * ```sql
 * CREATE OR REPLACE FUNCTION create_parent_and_link(
 *   p_institute_id UUID,
 *   p_student_id UUID,
 *   p_parent_name TEXT,
 *   p_parent_email TEXT,
 *   p_parent_phone TEXT,
 *   p_parent_occupation TEXT,
 *   p_parent_relation_type TEXT
 * ) RETURNS UUID AS $$
 * DECLARE
 *   v_parent_id UUID;
 *   v_user_id UUID;
 *   v_existing_parent_id UUID;
 * BEGIN
 *   -- Check for existing parent by email
 *   SELECT p.id INTO v_existing_parent_id
 *   FROM parents p
 *   JOIN users u ON p.user_id = u.id
 *   WHERE u.email = p_parent_email
 *   AND p.institute_id = p_institute_id
 *   LIMIT 1;
 *   
 *   IF v_existing_parent_id IS NOT NULL THEN
 *     v_parent_id := v_existing_parent_id;
 *   ELSE
 *     -- Create auth user
 *     v_user_id := auth.uid(); -- Use admin auth context
 *     -- In real implementation, use:
 *     -- SELECT id INTO v_user_id FROM auth.users
 *     -- WHERE email = p_parent_email;
 *     -- Or create if doesn't exist
 *     
 *     -- Create parent record
 *     INSERT INTO parents (institute_id, user_id, occupation)
 *     VALUES (p_institute_id, v_user_id, p_parent_occupation)
 *     RETURNING id INTO v_parent_id;
 *   END IF;
 *   
 *   -- Link parent to student
 *   INSERT INTO student_parents (student_id, parent_id, relation_type)
 *   VALUES (p_student_id, v_parent_id, p_parent_relation_type)
 *   ON CONFLICT DO NOTHING;
 *   
 *   RETURN v_parent_id;
 * EXCEPTION WHEN OTHERS THEN
 *   RAISE EXCEPTION 'ADMIT_STUDENT_PARENT_CREATION_FAILED: %', SQLERRM;
 * END;
 * $$ LANGUAGE plpgsql SECURITY DEFINER;
 * ```
 * 
 * DATABASE SCHEMA
 * ===============
 * 
 * Existing tables:
 * - parents(id, institute_id, user_id, occupation, created_at, updated_at)
 * - student_parents(id, student_id, parent_id, relation_type, created_at)
 *   - Unique constraint: (student_id, parent_id)
 *   - Indexes: student_id, parent_id, institute isolation via student_id join
 * - users(id, institute_id, email, name, phone, role, avatar_url, ...)
 * - students(id, institute_id, user_id, admission_no, batch_id, status, ...)
 * 
 * RLS POLICIES
 * ============
 * 
 * Parents table:
 * - Admin can see all parents in their institute
 * - Parent can see themselves
 * - Student cannot see parents (privacy)
 * 
 * Student_parents junction:
 * - Admin can see all relationships in their institute
 * - Parent can see their linked children
 * - Student cannot see parents
 * 
 * FRONTEND INTEGRATION POINTS
 * ============================
 * 
 * 1. AdmissionForm (✅ DONE)
 *    - Shows parent section with optional fields
 *    - If parent_name provided, requires email and relation_type
 *    - Passes parent data to admitStudent()
 * 
 * 2. Parent Service (✅ DONE)
 *    - findParentByEmail() — check for duplicates
 *    - createParent() — create parent record
 *    - linkParentToStudent() — create relationship
 *    - createParentAndLinkToStudent() — combined operation
 * 
 * 3. Parent Management Page (✅ DONE)
 *    - List all parents with linked children count
 *    - View parent profile panel
 *    - See linked children inline
 *    - Unlink parents from students
 * 
 * 4. Student Detail Page (NEEDS WORK)
 *    - Show linked parents
 *    - Add "Link Parent" button
 *    - Show parent relationship type
 *    - Unlink button
 * 
 * 5. Parent Dashboard (NEEDS WORK)
 *    - List linked children
 *    - Access child attendance
 *    - Access child fees
 *    - Access child notices
 * 
 * DUPLICATE PREVENTION
 * ====================
 * 
 * 1. Email-based uniqueness:
 *    - findParentByEmail() checks if parent exists before creation
 *    - If exists, reuse instead of creating
 * 
 * 2. Student-parent link uniqueness:
 *    - student_parents has unique constraint (student_id, parent_id)
 *    - checkParentStudentLink() checks before linking
 *    - UI shows friendly error if already linked
 * 
 * 3. Admission duplicate prevention:
 *    - Backend RPC checks institute isolation
 *    - Errors map to friendly messages
 * 
 * TESTING SCENARIOS
 * =================
 * 
 * Scenario 1: New parent during admission
 *   - Admin provides parent details during admission
 *   - New auth user created
 *   - New parent record created
 *   - Link created automatically
 *   - ✅ Parent appears in parent list
 *   - ✅ Parent can log in
 * 
 * Scenario 2: Existing parent during admission
 *   - Admin provides parent email that already exists
 *   - No new auth user or parent created
 *   - Link created automatically
 *   - ✅ Only link added
 *   - ✅ Parent not duplicated
 * 
 * Scenario 3: Link existing parent to existing student
 *   - Admin opens student detail page
 *   - Clicks "Link Parent"
 *   - Selects existing parent
 *   - Selects relationship type
 *   - ✅ Link created
 *   - ✅ Appears in both parent and student views
 * 
 * Scenario 4: One parent → multiple students
 *   - Admit student 1 with parent A
 *   - Admit student 2 with parent A
 *   - ✅ Parent A appears once in parent list
 *   - ✅ Parent A sees both children
 *   - ✅ No duplicate auth user
 * 
 * Scenario 5: Unlink parent from student
 *   - Admin opens student detail or parent detail
 *   - Clicks "Unlink"
 *   - ✅ Link removed
 *   - ✅ Still shows in lists if other relationships exist
 * 
 * COMPLETED CHECKLIST
 * ===================
 * 
 * ✅ 1. Extended AdmitStudentPayload with parent fields
 * ✅ 2. Updated admissionSchema with parent validation
 * ✅ 3. Extended AdmissionForm with parent section
 * ✅ 4. Updated admitStudent() to pass parent data to RPC
 * ✅ 5. Added parent service functions
 * ✅ 6. Added LinkParentToStudentModal component
 * ❌ 7. Backend RPC needs parent creation logic
 * ❌ 8. Update student detail page to show parents
 * ❌ 9. Build parent dashboard
 * ❌ 10. Add unlink functionality to UI
 * 
 * NEXT STEPS
 * ==========
 * 
 * 1. Implement backend RPC admit_student() changes
 * 2. Add parent linking UI to student detail page
 * 3. Build parent dashboard with linked children
 * 4. Add unlink functionality
 * 5. Add success toasts for parent creation
 * 6. Add parent name to student list views
 * 7. Implement parent messaging features
 */
