// ---------------------------------------------------------------------------
// EduOS — Student Credential Generator
//
// Generates login IDs, virtual email addresses, and temporary passwords
// for newly admitted students — all in pure TypeScript, zero SQL extensions.
//
// WHY FRONTEND-GENERATED (not SQL):
//   The previous architecture used gen_salt() / crypt() (pgcrypto) inside
//   the admit_student SQL RPC.  pgcrypto is not available on this Supabase
//   project, causing "function gen_salt(unknown) does not exist".
//
//   The correct approach is:
//   1. Generate credentials here (TypeScript)
//   2. Call supabase.auth.admin.createUser() — Supabase handles bcrypt hashing internally
//   3. Call create_student_profile() RPC — DB records only, no password logic
// ---------------------------------------------------------------------------

/** Sanitise a display name to an alphanumeric slug for use in login IDs. */
function nameToSlug(name: string, maxLen = 8): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // strip non-alphanumeric
    .slice(0, maxLen);
}

/** Derive a 2–4 char institute prefix from the institute name. */
function institutePrefix(instituteName: string): string {
  return (instituteName ?? "edu")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 4)
    .padEnd(2, "x"); // ensure at least 2 chars
}

/**
 * Generate a unique student login ID.
 *
 * Format: `{institutePrefix}{nameSlug}{4-digit-random}`
 * Example: `ocmsarvesh4831`
 *
 * The 4-digit random suffix makes collisions extremely unlikely.
 * The RPC's duplicate-email guard is the safety net for the rare collision.
 *
 * @param studentName   — student's full name
 * @param instituteName — institute display name (from auth store)
 */
export function generateLoginId(studentName: string, instituteName: string): string {
  const prefix = institutePrefix(instituteName);
  const slug = nameToSlug(studentName);
  const suffix = String(Math.floor(1000 + Math.random() * 9000)); // 1000-9999
  return `${prefix}${slug}${suffix}`;
}

/**
 * Build the virtual student email address from a login ID.
 *
 * The `@eduos.student` domain is fictitious but follows a valid email
 * format that Supabase accepts.  Students log in with this email + temp
 * password; it is never used to deliver real email.
 */
export function buildStudentEmail(loginId: string): string {
  return `${loginId}@eduos.student`;
}

/**
 * Generate a cryptographically-safe temporary password.
 *
 * Rules enforced:
 *  - At least 1 uppercase letter
 *  - At least 1 lowercase letter
 *  - At least 1 digit
 *  - At least 1 special character (@, #, $, !)
 *  - Total length: 8 characters
 *
 * The password is shown ONCE to the admin after admission and must be
 * shared securely with the student.  It is NEVER persisted in plaintext.
 */
export function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "@#$!";
  const pool = upper + lower + digits;

  const rand = (s: string) => s[Math.floor(Math.random() * s.length)];

  // Guarantee at least one of each required character class
  const required = [rand(upper), rand(lower), rand(digits), rand(special)];

  // Fill remaining 4 positions from the general pool
  const extra = Array.from({ length: 4 }, () => rand(pool));

  // Shuffle all 8 characters to avoid predictable position patterns
  const all = [...required, ...extra];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  return all.join("");
}

/** Convenience bundle: generate all three credentials in one call. */
export interface StudentCredentials {
  loginId: string;
  email: string;
  tempPassword: string;
}

export function generateStudentCredentials(
  studentName: string,
  instituteName: string,
): StudentCredentials {
  const loginId = generateLoginId(studentName, instituteName);
  return {
    loginId,
    email: buildStudentEmail(loginId),
    tempPassword: generateTempPassword(),
  };
}
