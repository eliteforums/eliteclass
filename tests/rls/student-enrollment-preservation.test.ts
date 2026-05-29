/**
 * Preservation Property Tests — Student Self-Enrollment RLS Fix
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * These tests verify that existing RLS behavior is UNCHANGED after the fix.
 * They test all non-bug-condition operations to ensure no regressions:
 *
 * - Student can SELECT their own enrollment rows (Requirement 3.1)
 * - Student CANNOT insert enrollment for another user (Requirement 3.2)
 * - Admin/staff policies still work correctly (Requirement 3.3)
 * - Student cannot access unpublished courses or cross-institute courses (Requirement 3.4)
 * - Student cannot UPDATE or DELETE enrollment rows (Requirement 3.5)
 *
 * These tests should PASS on both unfixed and fixed code since they test
 * preserved behavior that is unaffected by the fix.
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
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error || !data.user) {
    throw new Error(`Failed to get user ${userId}: ${error?.message}`);
  }

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

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

let adminServiceClient: SupabaseClient;
let studentClient: SupabaseClient;
let adminClient: SupabaseClient;
let staffClient: SupabaseClient;

let testStudentId: string;
let testStudentInstituteId: string;
let testAdminId: string;
let testStaffId: string;
let testPublishedCourseId: string;
let testExistingEnrollmentId: string;
let testCreatedEnrollmentIds: string[] = [];

// ── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  adminServiceClient = createAdminClient();

  // Find a student user with their institute
  const { data: studentData, error: studentError } = await adminServiceClient
    .from("users")
    .select("id, institute_id")
    .eq("role", "student")
    .limit(1)
    .single();

  if (studentError || !studentData) {
    throw new Error(
      `No student user found: ${studentError?.message}. ` +
        "Tests require at least one student user.",
    );
  }

  testStudentId = studentData.id;
  testStudentInstituteId = studentData.institute_id;

  // Find an admin user in the same institute
  const { data: adminData, error: adminError } = await adminServiceClient
    .from("users")
    .select("id, institute_id")
    .eq("role", "admin")
    .eq("institute_id", testStudentInstituteId)
    .limit(1)
    .single();

  if (adminError || !adminData) {
    throw new Error(
      `No admin user found for institute ${testStudentInstituteId}: ${adminError?.message}`,
    );
  }

  testAdminId = adminData.id;

  // Find a staff user in the same institute
  const { data: staffData, error: staffError } = await adminServiceClient
    .from("users")
    .select("id, institute_id")
    .eq("role", "staff")
    .eq("institute_id", testStudentInstituteId)
    .limit(1)
    .single();

  if (staffError || !staffData) {
    throw new Error(
      `No staff user found for institute ${testStudentInstituteId}: ${staffError?.message}`,
    );
  }

  testStaffId = staffData.id;

  // Find a published course in the student's institute
  const { data: courseData, error: courseError } = await adminServiceClient
    .from("lms_courses")
    .select("id")
    .eq("institute_id", testStudentInstituteId)
    .eq("status", "published")
    .limit(1)
    .single();

  if (courseError || !courseData) {
    throw new Error(
      `No published course found for institute ${testStudentInstituteId}: ${courseError?.message}`,
    );
  }

  testPublishedCourseId = courseData.id;

  // Ensure the student has at least one enrollment for SELECT tests
  // First check if one already exists
  const { data: existingEnrollment } = await adminServiceClient
    .from("lms_enrollments")
    .select("id")
    .eq("student_id", testStudentId)
    .eq("institute_id", testStudentInstituteId)
    .limit(1)
    .single();

  if (existingEnrollment) {
    testExistingEnrollmentId = existingEnrollment.id;
  } else {
    // Create one via admin for testing SELECT
    const { data: newEnrollment, error: enrollError } =
      await adminServiceClient
        .from("lms_enrollments")
        .insert({
          course_id: testPublishedCourseId,
          student_id: testStudentId,
          institute_id: testStudentInstituteId,
          enrolled_by: testAdminId,
          status: "active",
        })
        .select("id")
        .single();

    if (enrollError || !newEnrollment) {
      throw new Error(
        `Failed to create test enrollment: ${enrollError?.message}`,
      );
    }

    testExistingEnrollmentId = newEnrollment.id;
    testCreatedEnrollmentIds.push(newEnrollment.id);
  }

  // Authenticate clients
  studentClient = await createAuthenticatedClient(
    adminServiceClient,
    testStudentId,
  );
  adminClient = await createAuthenticatedClient(
    adminServiceClient,
    testAdminId,
  );
  staffClient = await createAuthenticatedClient(
    adminServiceClient,
    testStaffId,
  );
});

afterAll(async () => {
  // Clean up any enrollments created during tests
  if (testCreatedEnrollmentIds.length > 0) {
    await adminServiceClient
      .from("lms_enrollments")
      .delete()
      .in("id", testCreatedEnrollmentIds);
  }
});

// ── Property Tests ───────────────────────────────────────────────────────────

describe("Preservation: Student SELECT Own Enrollments (Requirement 3.1)", () => {
  /**
   * Property 2a: Student can SELECT their own enrollment rows
   *
   * **Validates: Requirements 3.1**
   *
   * The `lms_enroll_student_own` policy allows students to SELECT rows
   * where `student_id = auth.uid()`. This behavior must be preserved.
   */
  it("student can SELECT their own enrollment rows and all returned rows belong to them", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate different query patterns a student might use
        fc.constantFrom("all", "by_course", "by_status"),
        async (queryType) => {
          let query = studentClient
            .from("lms_enrollments")
            .select("id, student_id, course_id, institute_id, status");

          if (queryType === "by_course") {
            query = query.eq("course_id", testPublishedCourseId);
          } else if (queryType === "by_status") {
            query = query.eq("status", "active");
          }

          const { data, error } = await query;

          // SELECT should succeed (no RLS error)
          expect(error).toBeNull();

          // All returned rows must belong to the authenticated student
          if (data && data.length > 0) {
            for (const row of data) {
              expect(row.student_id).toBe(testStudentId);
            }
          }
        },
      ),
      { numRuns: 3 },
    );
  });
});

describe("Preservation: Student Cannot Enroll Others (Requirement 3.2)", () => {
  /**
   * Property 2b: Student CANNOT insert enrollment for another user
   *
   * **Validates: Requirements 3.2**
   *
   * No policy allows a student to INSERT a row where `student_id != auth.uid()`.
   * This must remain blocked after the fix.
   */
  it("student cannot INSERT enrollment with student_id != auth.uid()", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random UUIDs that are NOT the student's own ID
        fc.uuid().filter((id) => id !== testStudentId),
        async (fakeStudentId) => {
          const { data, error } = await studentClient
            .from("lms_enrollments")
            .insert({
              course_id: testPublishedCourseId,
              student_id: fakeStudentId,
              institute_id: testStudentInstituteId,
              enrolled_by: testStudentId,
              status: "active",
            })
            .select("id")
            .single();

          // INSERT should be blocked by RLS — either error or no data returned
          const isBlocked = error !== null || data === null;
          expect(isBlocked).toBe(true);
        },
      ),
      { numRuns: 5 },
    );
  });
});

describe("Preservation: Admin/Staff Policies (Requirement 3.3)", () => {
  /**
   * Property 2c: Admin can manage enrollments (INSERT/SELECT/UPDATE/DELETE)
   *
   * **Validates: Requirements 3.3**
   *
   * The `lms_enroll_admin` policy grants ALL operations to admins within
   * their institute. This must remain unchanged.
   */
  it("admin can SELECT enrollments in their institute", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        const { data, error } = await adminClient
          .from("lms_enrollments")
          .select("id, student_id, course_id, institute_id, status")
          .eq("institute_id", testStudentInstituteId)
          .limit(5);

        // Admin SELECT should succeed
        expect(error).toBeNull();
        expect(data).not.toBeNull();

        // All returned rows should be from the admin's institute
        if (data && data.length > 0) {
          for (const row of data) {
            expect(row.institute_id).toBe(testStudentInstituteId);
          }
        }
      }),
      { numRuns: 1 },
    );
  });

  it("admin can INSERT and DELETE enrollments in their institute", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        // Find a second student to enroll (different from testStudentId)
        const { data: otherStudent } = await adminServiceClient
          .from("users")
          .select("id")
          .eq("role", "student")
          .eq("institute_id", testStudentInstituteId)
          .neq("id", testStudentId)
          .limit(1)
          .single();

        if (!otherStudent) {
          // Skip if no other student available — not a failure
          return;
        }

        // Clean up any existing enrollment for this student+course
        await adminServiceClient
          .from("lms_enrollments")
          .delete()
          .eq("student_id", otherStudent.id)
          .eq("course_id", testPublishedCourseId);

        // Admin INSERT
        const { data: insertData, error: insertError } = await adminClient
          .from("lms_enrollments")
          .insert({
            course_id: testPublishedCourseId,
            student_id: otherStudent.id,
            institute_id: testStudentInstituteId,
            enrolled_by: testAdminId,
            status: "active",
          })
          .select("id")
          .single();

        expect(insertError).toBeNull();
        expect(insertData).not.toBeNull();

        // Admin DELETE
        if (insertData) {
          const { error: deleteError } = await adminClient
            .from("lms_enrollments")
            .delete()
            .eq("id", insertData.id);

          expect(deleteError).toBeNull();
        }
      }),
      { numRuns: 1 },
    );
  });

  /**
   * Property 2d: Staff can SELECT enrollments for courses they own
   *
   * **Validates: Requirements 3.3**
   *
   * The `lms_enroll_staff_read` policy allows staff to SELECT enrollments
   * for courses where they are the creator/owner.
   */
  it("staff can SELECT enrollments for courses in their institute", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        // Staff SELECT on enrollments — should not error
        const { data, error } = await staffClient
          .from("lms_enrollments")
          .select("id, student_id, course_id, institute_id, status")
          .eq("institute_id", testStudentInstituteId)
          .limit(5);

        // Staff SELECT should succeed (no RLS error)
        // May return empty if staff doesn't own any courses with enrollments
        expect(error).toBeNull();
      }),
      { numRuns: 1 },
    );
  });
});

describe("Preservation: Student Cannot Access Unpublished/Cross-Institute (Requirement 3.4)", () => {
  /**
   * Property 2e: Student cannot access unpublished courses
   *
   * **Validates: Requirements 3.4**
   *
   * Students should not be able to see or enroll in courses that are
   * not published (draft, archived, etc.).
   */
  it("student cannot INSERT enrollment for an unpublished course", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("draft", "archived"),
        async (courseStatus) => {
          // Find an unpublished course in the student's institute
          const { data: unpubCourse } = await adminServiceClient
            .from("lms_courses")
            .select("id")
            .eq("institute_id", testStudentInstituteId)
            .eq("status", courseStatus)
            .limit(1)
            .single();

          if (!unpubCourse) {
            // No unpublished course available — skip this iteration
            return;
          }

          // Clean up any existing enrollment
          await adminServiceClient
            .from("lms_enrollments")
            .delete()
            .eq("student_id", testStudentId)
            .eq("course_id", unpubCourse.id);

          // Student attempts to enroll in unpublished course
          const { data, error } = await studentClient
            .from("lms_enrollments")
            .insert({
              course_id: unpubCourse.id,
              student_id: testStudentId,
              institute_id: testStudentInstituteId,
              enrolled_by: testStudentId,
              status: "active",
            })
            .select("id")
            .single();

          // Should be blocked — either error or no data
          const isBlocked = error !== null || data === null;
          expect(isBlocked).toBe(true);
        },
      ),
      { numRuns: 2 },
    );
  });

  /**
   * Property 2f: Student cannot access courses from other institutes
   *
   * **Validates: Requirements 3.4**
   *
   * Cross-institute access must remain denied.
   */
  it("student cannot INSERT enrollment for a course in another institute", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        // Find a course from a different institute
        const { data: otherCourse } = await adminServiceClient
          .from("lms_courses")
          .select("id, institute_id")
          .neq("institute_id", testStudentInstituteId)
          .eq("status", "published")
          .limit(1)
          .single();

        if (!otherCourse) {
          // No cross-institute course available — skip
          return;
        }

        // Student attempts to enroll in cross-institute course
        const { data, error } = await studentClient
          .from("lms_enrollments")
          .insert({
            course_id: otherCourse.id,
            student_id: testStudentId,
            institute_id: otherCourse.institute_id,
            enrolled_by: testStudentId,
            status: "active",
          })
          .select("id")
          .single();

        // Should be blocked
        const isBlocked = error !== null || data === null;
        expect(isBlocked).toBe(true);

        // Clean up in case it somehow got through
        if (data?.id) {
          await adminServiceClient
            .from("lms_enrollments")
            .delete()
            .eq("id", data.id);
        }
      }),
      { numRuns: 1 },
    );
  });
});

describe("Preservation: Student Cannot UPDATE or DELETE Enrollments (Requirement 3.5)", () => {
  /**
   * Property 2g: Student cannot DELETE enrollment rows
   *
   * **Validates: Requirements 3.5**
   *
   * No DELETE policy exists for students. This must remain blocked.
   */
  it("student cannot DELETE their own enrollment rows", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(true), async () => {
        // Attempt to delete the student's own enrollment
        const { error, count } = await studentClient
          .from("lms_enrollments")
          .delete({ count: "exact" })
          .eq("id", testExistingEnrollmentId);

        // DELETE should either error or affect 0 rows
        // RLS blocks DELETE for students — the row should still exist
        const { data: stillExists } = await adminServiceClient
          .from("lms_enrollments")
          .select("id")
          .eq("id", testExistingEnrollmentId)
          .single();

        expect(stillExists).not.toBeNull();
        expect(stillExists?.id).toBe(testExistingEnrollmentId);
      }),
      { numRuns: 1 },
    );
  });

  /**
   * Property 2h: Student cannot UPDATE enrollment status to dropped/suspended
   * via direct table access (only the self-update policy allows active/completed)
   *
   * **Validates: Requirements 3.5**
   *
   * The lms_enroll_student_self_update policy (from the fix) only allows
   * status IN ('active', 'completed'). Students cannot set status to
   * 'dropped' or 'suspended' directly.
   */
  it("student cannot UPDATE enrollment status to dropped or suspended", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("dropped", "suspended"),
        async (blockedStatus) => {
          // Attempt to update enrollment status to a blocked value
          const { data, error } = await studentClient
            .from("lms_enrollments")
            .update({ status: blockedStatus })
            .eq("id", testExistingEnrollmentId)
            .select("id, status")
            .single();

          // Should be blocked — either error or no data returned
          // Verify the row was NOT actually updated
          const { data: currentRow } = await adminServiceClient
            .from("lms_enrollments")
            .select("id, status")
            .eq("id", testExistingEnrollmentId)
            .single();

          // Status should NOT be the blocked value
          expect(currentRow).not.toBeNull();
          if (currentRow) {
            expect(currentRow.status).not.toBe(blockedStatus);
          }
        },
      ),
      { numRuns: 2 },
    );
  });
});
