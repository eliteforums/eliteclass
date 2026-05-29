/**
 * Bug Condition Exploration Test — Student Self-Enrollment RLS
 *
 * **Validates: Requirements 1.1, 1.3**
 *
 * This test demonstrates the bug condition: students cannot self-enroll in
 * courses because the `lms_enrollments` table has NO INSERT RLS policy for
 * the student role. The existing policies are:
 *   - `lms_enroll_super_admin` — ALL for super admins
 *   - `lms_enroll_admin` — ALL for admins
 *   - `lms_enroll_staff_read` — SELECT for staff
 *   - `lms_enroll_student_own` — SELECT only for students
 *
 * EXPECTED BEHAVIOR (what the test asserts):
 *   1. A student-authenticated client CAN INSERT into `lms_enrollments`
 *      with student_id = auth.uid() for a published course in their institute
 *   2. A student-authenticated client CAN SELECT non-institutional published
 *      courses in their institute (even without existing enrollment)
 *
 * ON UNFIXED CODE: These tests WILL FAIL because:
 *   - INSERT is blocked by RLS (no INSERT policy for students)
 *   - SELECT on non-institutional courses requires existing enrollment
 *
 * The failure confirms the bug exists. After the fix is applied, these tests
 * should PASS.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fc from "fast-check";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// ── Test Configuration ───────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a Supabase admin client (bypasses RLS) for test setup/teardown.
 */
function createAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Creates a Supabase client authenticated as a specific user.
 * Uses the admin client to generate an access token for the user.
 */
async function createAuthenticatedClient(
  adminClient: SupabaseClient,
  userId: string,
): Promise<SupabaseClient> {
  // Use admin API to get a session for this user
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error || !data.user) {
    throw new Error(`Failed to get user ${userId}: ${error?.message}`);
  }

  // Generate a link that gives us a token for this user
  const { data: linkData, error: linkError } =
    await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: data.user.email!,
    });

  if (linkError || !linkData) {
    throw new Error(
      `Failed to generate link for ${userId}: ${linkError?.message}`,
    );
  }

  // Create a client and set the session using the token from the link
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify the OTP to get a valid session
  const { data: sessionData, error: sessionError } =
    await client.auth.verifyOtp({
      token_hash: linkData.properties?.hashed_token!,
      type: "magiclink",
    });

  if (sessionError || !sessionData.session) {
    throw new Error(
      `Failed to create session for ${userId}: ${sessionError?.message}`,
    );
  }

  return client;
}

// ── Test State ───────────────────────────────────────────────────────────────

let adminClient: SupabaseClient;
let studentClient: SupabaseClient;
let testStudentId: string;
let testInstituteId: string;
let testPublishedCourseId: string;
let testEnrollmentIds: string[] = [];

describe("Bug Condition: Student Self-Enrollment INSERT Blocked", () => {
  beforeAll(async () => {
    adminClient = createAdminClient();

    // Find a student user with their institute from the database
    const { data: studentData, error: studentError } = await adminClient
      .from("users")
      .select("id, institute_id")
      .eq("role", "student")
      .limit(1)
      .single();

    if (studentError || !studentData) {
      throw new Error(
        `No student user found in database: ${studentError?.message}. ` +
          "This test requires at least one student user to exist.",
      );
    }

    testStudentId = studentData.id;
    testInstituteId = studentData.institute_id;

    // Find a published course in the same institute
    const { data: courseData, error: courseError } = await adminClient
      .from("lms_courses")
      .select("id, visibility, status")
      .eq("institute_id", testInstituteId)
      .eq("status", "published")
      .limit(1)
      .single();

    if (courseError || !courseData) {
      throw new Error(
        `No published course found for institute ${testInstituteId}: ${courseError?.message}. ` +
          "This test requires at least one published course to exist.",
      );
    }

    testPublishedCourseId = courseData.id;

    // Authenticate as the student
    studentClient = await createAuthenticatedClient(
      adminClient,
      testStudentId,
    );

    // Clean up any existing enrollment for this student+course to ensure a clean test
    await adminClient
      .from("lms_enrollments")
      .delete()
      .eq("student_id", testStudentId)
      .eq("course_id", testPublishedCourseId);
  });

  afterAll(async () => {
    // Clean up test enrollments created during the test
    if (testEnrollmentIds.length > 0) {
      await adminClient
        .from("lms_enrollments")
        .delete()
        .in("id", testEnrollmentIds);
    }
    // Also clean up by student+course in case IDs weren't captured
    await adminClient
      .from("lms_enrollments")
      .delete()
      .eq("student_id", testStudentId)
      .eq("course_id", testPublishedCourseId);
  });

  /**
   * Property 1: Bug Condition — Student Self-Enrollment INSERT
   *
   * **Validates: Requirements 1.1**
   *
   * For a student attempting INSERT into `lms_enrollments` with:
   *   - student_id = auth.uid()
   *   - institute_id = their own institute
   *   - course_id = a published course in their institute
   *
   * The INSERT SHOULD succeed (expected behavior).
   * On UNFIXED code, this WILL FAIL — confirming the bug exists.
   */
  it("student can INSERT self-enrollment for a published course in their institute", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a single concrete case: the student enrolling themselves
        fc.constant({
          studentId: testStudentId,
          courseId: testPublishedCourseId,
          instituteId: testInstituteId,
        }),
        async ({ studentId, courseId, instituteId }) => {
          const { data, error } = await studentClient
            .from("lms_enrollments")
            .insert({
              course_id: courseId,
              student_id: studentId,
              institute_id: instituteId,
              enrolled_by: studentId,
              status: "active",
            })
            .select("id, course_id, student_id, institute_id, status")
            .single();

          // Expected behavior: INSERT succeeds, returns the created row
          expect(error).toBeNull();
          expect(data).not.toBeNull();
          expect(data?.student_id).toBe(studentId);
          expect(data?.course_id).toBe(courseId);
          expect(data?.institute_id).toBe(instituteId);
          expect(data?.status).toBe("active");

          // Track for cleanup
          if (data?.id) {
            testEnrollmentIds.push(data.id);
          }
        },
      ),
      { numRuns: 1 }, // Single concrete case — scoped PBT approach
    );
  });

  /**
   * Property 1b: Bug Condition — Student SELECT on Non-Institutional Published Course
   *
   * **Validates: Requirements 1.3**
   *
   * A student should be able to SELECT (browse) published courses in their
   * institute regardless of enrollment status or visibility setting.
   *
   * On UNFIXED code, the `lms_course_student_enrolled` policy requires either:
   *   - visibility = 'institutional', OR
   *   - existing enrollment
   *
   * This creates a chicken-and-egg problem for non-institutional courses.
   */
  it("student can SELECT a published course in their institute (browse catalog)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant({
          courseId: testPublishedCourseId,
          instituteId: testInstituteId,
        }),
        async ({ courseId, instituteId }) => {
          // Query the specific published course as the student
          const { data, error } = await studentClient
            .from("lms_courses")
            .select("id, title, status, visibility, institute_id")
            .eq("id", courseId)
            .eq("institute_id", instituteId)
            .eq("status", "published")
            .single();

          // Expected behavior: student can see the published course
          expect(error).toBeNull();
          expect(data).not.toBeNull();
          expect(data?.id).toBe(courseId);
          expect(data?.status).toBe("published");
          expect(data?.institute_id).toBe(instituteId);
        },
      ),
      { numRuns: 1 },
    );
  });
});
