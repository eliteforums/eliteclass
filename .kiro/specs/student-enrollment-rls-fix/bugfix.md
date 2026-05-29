# Bugfix Requirements Document

## Introduction

Students cannot self-enroll in courses from the student portal. When a student clicks "Enroll & Start", the enrollment fails silently because the `lms_enrollments` table lacks an INSERT RLS policy for students. The `selfEnrollInCourse()` upsert is blocked by Row Level Security, and subsequent course access checks return "You are not enrolled in this course." A secondary issue compounds this: the `lms_courses` SELECT policy (`lms_course_student_enrolled`) only allows students to read courses with `visibility = 'institutional'` OR courses they're already enrolled in — creating a chicken-and-egg problem for non-institutional courses.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a student calls `selfEnrollInCourse()` to insert a row into `lms_enrollments` with `student_id = auth.uid()` THEN the system silently rejects the INSERT due to missing RLS policy and returns an error or empty result

1.2 WHEN a student attempts to access a course after a failed self-enrollment THEN the system returns "You are not enrolled in this course" because `getStudentEnrollment()` finds no enrollment row

1.3 WHEN a student tries to read a published course with visibility other than 'institutional' and they are not yet enrolled THEN the system blocks the SELECT on `lms_courses` due to the `lms_course_student_enrolled` policy requiring either institutional visibility or existing enrollment

### Expected Behavior (Correct)

2.1 WHEN a student calls `selfEnrollInCourse()` to insert a row into `lms_enrollments` with `student_id = auth.uid()` for a published course in their institute THEN the system SHALL allow the INSERT and create the enrollment record successfully

2.2 WHEN a student has successfully self-enrolled and then accesses the course THEN the system SHALL find the enrollment row and grant access to the course content

2.3 WHEN a student browses published courses that are available for self-enrollment in their institute THEN the system SHALL allow the student to read those course records regardless of current enrollment status

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a student queries their own existing enrollments via SELECT on `lms_enrollments` THEN the system SHALL CONTINUE TO return only rows where `student_id = auth.uid()`

3.2 WHEN a student attempts to insert an enrollment row with a `student_id` different from `auth.uid()` THEN the system SHALL CONTINUE TO reject the INSERT (students cannot enroll other users)

3.3 WHEN an admin or staff member manages enrollments THEN the system SHALL CONTINUE TO allow full access per existing `lms_enroll_super_admin`, `lms_enroll_admin`, and `lms_enroll_staff_read` policies

3.4 WHEN a student attempts to access an unpublished course or a course from a different institute THEN the system SHALL CONTINUE TO deny access

3.5 WHEN a student attempts to UPDATE or DELETE enrollment rows THEN the system SHALL CONTINUE TO deny those operations (only INSERT and SELECT are granted to students)
