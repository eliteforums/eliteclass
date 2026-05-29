# Student Enrollment RLS Fix — Bugfix Design

## Overview

Students cannot self-enroll in courses because the `lms_enrollments` table has no INSERT RLS policy for the student role. The `selfEnrollInCourse()` function performs an upsert that is silently blocked by RLS. A secondary issue compounds this: the `lms_courses` SELECT policy only shows non-institutional courses to students who are *already* enrolled, creating a chicken-and-egg problem where students can't see courses they haven't enrolled in yet.

The fix adds two new RLS policies:
1. An INSERT policy on `lms_enrollments` allowing students to enroll themselves in published courses within their institute.
2. A SELECT policy on `lms_courses` allowing students to browse all published courses in their institute.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a student attempting to INSERT into `lms_enrollments` or SELECT a non-institutional published course they aren't enrolled in
- **Property (P)**: The desired behavior — students can self-enroll in published courses and browse all published courses in their institute
- **Preservation**: Existing admin/staff enrollment management, student SELECT on own enrollments, and denial of cross-institute or unpublished course access must remain unchanged
- **`selfEnrollInCourse()`**: The function in `enrollment.service.ts` that upserts an enrollment row for the calling student
- **`get_my_institute_id()`**: SQL helper that returns the current user's institute UUID from their JWT claims
- **`get_my_role()`**: SQL helper that returns the current user's role from their JWT claims
- **`lms_enrollments`**: Table storing student-course enrollment records with RLS enabled
- **`lms_courses`**: Table storing course metadata with RLS enabled

## Bug Details

### Bug Condition

The bug manifests in two scenarios:
1. A student calls `selfEnrollInCourse()` which performs an upsert (INSERT) on `lms_enrollments`. No INSERT policy exists for the student role, so RLS silently rejects the operation.
2. A student tries to browse published courses with visibility other than `'institutional'`. The existing `lms_course_student_enrolled` policy requires either `visibility = 'institutional'` OR an existing enrollment row — but the student can't enroll because of issue #1.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type RLSOperation
  OUTPUT: boolean
  
  RETURN (
    input.operation = 'INSERT'
    AND input.table = 'lms_enrollments'
    AND input.role = 'student'
    AND input.row.student_id = auth.uid()
    AND input.row.institute_id = get_my_institute_id()
  )
  OR (
    input.operation = 'SELECT'
    AND input.table = 'lms_courses'
    AND input.role = 'student'
    AND input.course.status = 'published'
    AND input.course.institute_id = get_my_institute_id()
    AND input.course.visibility != 'institutional'
    AND NOT exists_enrollment(auth.uid(), input.course.id)
  )
END FUNCTION
```

### Examples

- Student A (institute X) clicks "Enroll & Start" on a published course → INSERT into `lms_enrollments` is blocked → enrollment fails silently
- Student A then tries to access the course → `getStudentEnrollment()` finds no row → returns "You are not enrolled"
- Student B browses the course catalog → published course with `visibility = 'public'` is invisible because they aren't enrolled yet
- Student A tries to enroll in an unpublished course → should still be denied (not a bug condition)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Admin full access to `lms_enrollments` (INSERT, SELECT, UPDATE, DELETE) via `lms_enroll_admin` policy
- Super admin full access via `lms_enroll_super_admin` policy
- Staff read access to enrollments for courses they own via `lms_enroll_staff_read` policy
- Students can only SELECT their own enrollment rows via `lms_enroll_student_own` policy
- Students cannot UPDATE or DELETE enrollment rows (no such policies exist)
- Students cannot INSERT enrollment rows for other users (`student_id != auth.uid()`)
- Students cannot access unpublished courses or courses from other institutes
- Institutional visibility courses remain visible to all students in the institute (existing behavior)

**Scope:**
All operations that do NOT involve:
- Student INSERT on `lms_enrollments` with `student_id = auth.uid()` for a published course in their institute
- Student SELECT on `lms_courses` for published courses in their institute

should be completely unaffected by this fix.

## Hypothesized Root Cause

Based on the bug description and code analysis:

1. **Missing INSERT Policy on `lms_enrollments`**: The table has policies for super_admin (ALL), admin (ALL), staff (SELECT only), and student (SELECT only via `lms_enroll_student_own`). There is NO INSERT policy for students. When `selfEnrollInCourse()` calls `.upsert()`, the INSERT portion is blocked by RLS.

2. **Overly Restrictive SELECT Policy on `lms_courses`**: The `lms_course_student_enrolled` policy uses:
   ```sql
   visibility = 'institutional'
   OR id IN (SELECT course_id FROM lms_enrollments WHERE student_id = auth.uid() ...)
   ```
   This means non-institutional courses are only visible if the student is already enrolled — but they can't enroll because of issue #1. Even after fixing #1, students still can't see non-institutional courses in the catalog before enrolling.

3. **No Error Surfacing**: The Supabase client returns an empty result rather than an explicit error when RLS blocks an INSERT with `ignoreDuplicates`, making the failure silent.

## Correctness Properties

Property 1: Bug Condition - Student Self-Enrollment INSERT Allowed

_For any_ student attempting to INSERT into `lms_enrollments` where `student_id = auth.uid()` AND `institute_id = get_my_institute_id()` AND the target course is published in their institute, the fixed RLS policies SHALL allow the INSERT to succeed and create the enrollment row.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Existing RLS Behavior Unchanged

_For any_ operation that does NOT match the bug condition (admin/staff operations, student SELECT on own enrollments, cross-institute attempts, unpublished course access, student attempts to enroll others), the fixed RLS policies SHALL produce exactly the same result as the original policies, preserving all existing access controls.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

**File**: `supabase/migrations/fix_student_enrollment_rls.sql` (new file)

**Specific Changes**:

1. **Add INSERT policy `lms_enroll_student_self` on `lms_enrollments`**:
   - Allows students to insert rows where `student_id = auth.uid()`
   - Restricts to `institute_id = get_my_institute_id()`
   - Restricts to courses that are published in the student's institute via subquery
   - Uses `WITH CHECK` clause (INSERT policies use WITH CHECK, not USING)

   ```sql
   CREATE POLICY "lms_enroll_student_self" ON public.lms_enrollments
     FOR INSERT
     WITH CHECK (
       get_my_role() = 'student'
       AND student_id = auth.uid()
       AND institute_id = get_my_institute_id()
       AND course_id IN (
         SELECT id FROM public.lms_courses
         WHERE status = 'published'
           AND institute_id = get_my_institute_id()
       )
     );
   ```

2. **Add SELECT policy `lms_course_student_browse_published` on `lms_courses`**:
   - Allows students to read ALL published courses in their institute
   - Removes the enrollment-check requirement for browsing
   - Existing `lms_course_student_enrolled` policy can remain (PostgreSQL OR's multiple policies)

   ```sql
   CREATE POLICY "lms_course_student_browse_published" ON public.lms_courses
     FOR SELECT
     USING (
       get_my_role() = 'student'
       AND institute_id = get_my_institute_id()
       AND status = 'published'
     );
   ```

3. **Update `supabase/setup.sql`**: Add both new policies to the setup file so fresh deployments include them.

4. **Optionally drop the old `lms_course_student_enrolled` policy**: Since the new browse policy is a superset for published courses, the old policy is redundant. However, keeping it is harmless (PostgreSQL OR's policies together) and safer for rollback.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code (missing policies), then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that student INSERT on `lms_enrollments` is blocked and that non-institutional published courses are invisible.

**Test Plan**: Write SQL-level tests (or Supabase client tests) that authenticate as a student and attempt to:
1. INSERT into `lms_enrollments` with valid self-enrollment data
2. SELECT a non-institutional published course they aren't enrolled in

Run these on the UNFIXED schema to observe failures.

**Test Cases**:
1. **Self-Enrollment INSERT Test**: Authenticate as student, attempt INSERT into `lms_enrollments` with `student_id = auth.uid()`, published course in same institute (will fail on unfixed code)
2. **Course Browse Test**: Authenticate as student, SELECT from `lms_courses` where `visibility != 'institutional'` and student is not enrolled (will fail on unfixed code)
3. **Cross-Institute INSERT Test**: Attempt INSERT with a course from a different institute (should fail on both unfixed and fixed code)
4. **Unpublished Course INSERT Test**: Attempt INSERT for a draft course (should fail on both unfixed and fixed code)

**Expected Counterexamples**:
- INSERT returns 0 rows affected or RLS violation error
- SELECT returns empty result set for non-institutional published courses

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed policies allow the operation.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := executeWithFixedPolicies(input)
  ASSERT result.success = true
  ASSERT enrollment_row_exists(input.student_id, input.course_id)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed policies produce the same result as the original policies.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT executeWithOriginalPolicies(input) = executeWithFixedPolicies(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many combinations of roles, operations, and table targets
- It catches edge cases like students trying to enroll others or access cross-institute data
- It provides strong guarantees that existing access controls are unchanged

**Test Plan**: Observe behavior on UNFIXED code first for admin operations, staff operations, and student SELECT, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Admin Enrollment Management**: Verify admin can still INSERT/UPDATE/DELETE enrollments
2. **Staff Read Access**: Verify staff can still read enrollments for their courses
3. **Student Own Enrollment SELECT**: Verify students can still read their own enrollments
4. **Cross-Institute Denial**: Verify students cannot enroll in courses from other institutes
5. **Unpublished Course Denial**: Verify students cannot enroll in draft/archived courses
6. **Enroll-Others Denial**: Verify students cannot insert rows with `student_id != auth.uid()`

### Unit Tests

- Test the new INSERT policy allows student self-enrollment for published courses
- Test the new INSERT policy blocks enrollment in unpublished courses
- Test the new INSERT policy blocks cross-institute enrollment
- Test the new INSERT policy blocks enrolling other users
- Test the new SELECT policy allows browsing all published courses in institute

### Property-Based Tests

- Generate random (role, operation, table, conditions) tuples and verify access decisions match expected behavior
- Generate random student enrollment attempts with varying course statuses and verify only published courses succeed
- Generate random cross-role operations and verify admin/staff behavior is unchanged

### Integration Tests

- Test full self-enrollment flow: student browses catalog → sees published course → clicks enroll → enrollment succeeds → can access course content
- Test that the enrollment service `selfEnrollInCourse()` succeeds end-to-end with the new policies
- Test that `getStudentEnrollments()` returns the newly created enrollment
