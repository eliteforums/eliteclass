# Implementation Plan

## Overview

Fix the missing RLS policies that prevent students from self-enrolling in courses. The fix adds an INSERT policy on `lms_enrollments` and a SELECT policy on `lms_courses` so students can browse and enroll in published courses within their institute.

## Tasks

- [x] 1. Write bug condition exploration test
  - Create `tests/rls/student-enrollment-bug-condition.test.ts`
  - Test that a student-authenticated Supabase client can INSERT into `lms_enrollments` with `student_id = auth.uid()` for a published course in their institute
  - Test that a student can SELECT a published course in their institute (catalog browse)
  - Uses vitest + fast-check for property-based testing against live Supabase instance
  - _Requirements: 1.1, 1.3, 2.1, 2.3_

- [x] 2. Write preservation property tests
  - Create `tests/rls/student-enrollment-preservation.test.ts`
  - Verify student can SELECT only their own enrollment rows
  - Verify student CANNOT INSERT enrollment for another user (`student_id != auth.uid()`)
  - Verify admin can INSERT/SELECT/DELETE enrollments in their institute
  - Verify staff can SELECT enrollments for courses in their institute
  - Verify student cannot INSERT enrollment for unpublished or cross-institute courses
  - Verify student cannot DELETE their own enrollment rows
  - Verify student cannot UPDATE enrollment status to dropped/suspended
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Implement RLS policy fix

  - [x] 3.1 Create migration file with new RLS policies
    - Create `supabase/migrations/fix_student_enrollment_rls.sql`
    - Add INSERT policy `lms_enroll_student_self` on `lms_enrollments`: allows students to insert where `student_id = auth.uid()`, `institute_id = get_my_institute_id()`, `enrolled_by = auth.uid()`, and course is published with visibility IN ('public', 'institutional')
    - Add UPDATE policy `lms_enroll_student_self_update` on `lms_enrollments`: allows students to update their own rows with status IN ('active', 'completed')
    - Add SELECT policy `lms_course_student_browse_published` on `lms_courses`: allows students to read all published courses in their institute
    - All policies use `DROP POLICY IF EXISTS` for idempotency
    - _Requirements: 2.1, 2.3_

  - [x] 3.2 Update setup.sql with new policies for fresh deployments
    - Add `lms_course_student_browse_published` SELECT policy after `lms_course_student_enrolled` in setup.sql
    - Confirm `lms_enroll_student_self` INSERT policy already present (Migration 017)
    - Confirm `lms_enroll_student_self_update` UPDATE policy already present (Migration 017)
    - _Requirements: 2.1, 2.3_

  - [x] 3.3 Verify bug condition exploration test passes
    - Re-run `tests/rls/student-enrollment-bug-condition.test.ts`
    - Confirm student can INSERT self-enrollment and SELECT published courses
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.4 Verify preservation tests still pass
    - Re-run `tests/rls/student-enrollment-preservation.test.ts`
    - Confirm no regressions: admin/staff access unchanged, student cannot enroll others or access unpublished/cross-institute courses
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Apply migration to live database
  - Run `supabase/migrations/fix_student_enrollment_rls.sql` against the Supabase project (if `lms_course_student_browse_published` is not yet applied)
  - Verify the full self-enrollment flow works end-to-end: student browses catalog → sees published course → enrolls → can access course content
  - _Requirements: 2.1, 2.2, 2.3_

## Notes

- The INSERT policy (`lms_enroll_student_self`) and UPDATE policy (`lms_enroll_student_self_update`) were already applied to the live database as Migration 017 in setup.sql
- The SELECT policy (`lms_course_student_browse_published`) is new and needs to be applied to the live database via the migration file
- The migration file is idempotent (uses DROP IF EXISTS) so it's safe to re-run

## Task Dependency Graph

```json
{
  "waves": [
    {"tasks": ["1", "2", "3.1", "3.2"]},
    {"tasks": ["3.3", "3.4"]},
    {"tasks": ["4"]}
  ]
}
```
