// ---------------------------------------------------------------------------
// EliteClass — Bulk Upload Service
//
// Handles CSV validation and bulk student account creation.
// Used by the BulkImportModal to process simplified 3-column CSV files.
// ---------------------------------------------------------------------------

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface CSVStudentRow {
  rowNumber: number;
  fullName: string;
  email: string;
  phone: string;
}

export interface BulkUploadValidationResult {
  valid: CSVStudentRow[];
  invalid: { rowNumber: number; error: string }[];
}

export interface BulkUploadProgress {
  total: number;
  processed: number;
  created: number;
  skipped: number;
  failed: number;
}

export interface BulkUploadResult {
  summary: BulkUploadProgress;
  errors: { rowNumber: number; email: string; error: string }[];
  skipped: { rowNumber: number; email: string; reason: string }[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_HEADERS = ["full name", "mail id", "phone no"];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Header Validation ────────────────────────────────────────────────────────

/**
 * Validates that CSV headers contain the required columns.
 * Comparison is case-insensitive and trims whitespace.
 */
export function validateCSVHeaders(
  headers: string[]
): { valid: boolean; missing: string[] } {
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());

  const missing = REQUIRED_HEADERS.filter(
    (required) => !normalizedHeaders.includes(required)
  );

  return {
    valid: missing.length === 0,
    missing: missing.map((h) => {
      // Return display-friendly names
      if (h === "full name") return "Full Name";
      if (h === "mail id") return "Mail ID";
      if (h === "phone no") return "Phone No";
      return h;
    }),
  };
}

// ── Row Validation ───────────────────────────────────────────────────────────

/**
 * Validates a single CSV row for required fields and format.
 */
export function validateCSVRow(
  row: CSVStudentRow
): { valid: boolean; error?: string } {
  const name = row.fullName.trim();
  const email = row.email.trim();
  const phone = row.phone.trim();

  if (!name) {
    return { valid: false, error: "Full Name is required" };
  }

  if (!email) {
    return { valid: false, error: "Mail ID is required" };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, error: `Invalid email format: ${email}` };
  }

  if (!phone) {
    return { valid: false, error: "Phone No is required" };
  }

  if (phone.length < 6 || phone.length > 15) {
    return {
      valid: false,
      error: `Phone number must be 6-15 characters: ${phone}`,
    };
  }

  return { valid: true };
}

// ── Data Validation ──────────────────────────────────────────────────────────

/**
 * Maps raw papaparse output to CSVStudentRow objects and validates each row.
 * Returns a partition of valid and invalid rows.
 */
export function validateCSVData(
  rawRows: Record<string, string>[]
): BulkUploadValidationResult {
  const valid: CSVStudentRow[] = [];
  const invalid: { rowNumber: number; error: string }[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNumber = i + 1; // 1-indexed for user display

    // Map headers case-insensitively
    const normalizedRow: Record<string, string> = {};
    for (const key of Object.keys(raw)) {
      normalizedRow[key.trim().toLowerCase()] = raw[key];
    }

    const row: CSVStudentRow = {
      rowNumber,
      fullName: (normalizedRow["full name"] ?? "").trim(),
      email: (normalizedRow["mail id"] ?? "").trim(),
      phone: (normalizedRow["phone no"] ?? "").trim(),
    };

    const validation = validateCSVRow(row);
    if (validation.valid) {
      valid.push(row);
    } else {
      invalid.push({ rowNumber, error: validation.error! });
    }
  }

  return { valid, invalid };
}

// ── Bulk Create Students ─────────────────────────────────────────────────────

/**
 * Creates student accounts in bulk. For each valid row:
 * 1. Creates a Supabase Auth user with phone as temporary password via signUp()
 * 2. The DB trigger handles profile creation automatically
 *
 * Uses the anon client (supabase.auth.signUp) so it works from the browser
 * without requiring the service role key.
 *
 * Skips rows where the email is already registered.
 * Reports progress after each row.
 */
export async function bulkCreateStudents(
  rows: CSVStudentRow[],
  instituteId: string,
  onProgress: (progress: BulkUploadProgress) => void
): Promise<BulkUploadResult> {
  if (!supabase || !isSupabaseConfigured) {
    return {
      summary: { total: rows.length, processed: 0, created: 0, skipped: 0, failed: rows.length },
      errors: [{ rowNumber: 0, email: "", error: "Supabase client is not configured. Check your .env file has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." }],
      skipped: [],
    };
  }

  // Use the client reference (guaranteed non-null after the check above)
  const client = supabase;

  // Create a SEPARATE Supabase client for signUp calls.
  // This prevents signUp() from overwriting the admin's session in the main client.
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const signUpClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false, // Don't save to localStorage
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const progress: BulkUploadProgress = {
    total: rows.length,
    processed: 0,
    created: 0,
    skipped: 0,
    failed: 0,
  };

  const errors: BulkUploadResult["errors"] = [];
  const skipped: BulkUploadResult["skipped"] = [];

  for (const row of rows) {
    // Per-row error handling — one failure doesn't stop the loop
    try {
      // Create auth user via signUp (works from browser, no admin key needed)
      const { data: signUpData, error: signUpError } = await signUpClient.auth.signUp({
        email: row.email,
        password: row.phone,
        options: {
          data: {
            name: row.fullName,
            role: "student",
            institute_id: instituteId,
            force_password_change: true,
          },
        },
      });

      if (signUpError) {
        // Check if user already exists
        if (
          signUpError.message?.toLowerCase().includes("already registered") ||
          signUpError.message?.toLowerCase().includes("already been registered")
        ) {
          // User exists in auth — check if they have a students record
          // Look up the user by email in the users table
          const { data: existingUser } = await client
            .from("users")
            .select("id")
            .eq("email", row.email)
            .maybeSingle();

          if (existingUser) {
            // Check if student record exists
            const { data: existingStudent } = await client
              .from("students")
              .select("id")
              .eq("user_id", existingUser.id)
              .maybeSingle();

            if (!existingStudent) {
              // Create missing student record
              const admissionNo = `STU-${Date.now().toString(36).toUpperCase()}-${row.rowNumber}`;
              await client.from("students").insert({
                user_id: existingUser.id,
                institute_id: instituteId,
                admission_no: admissionNo,
                status: "active",
              });
              progress.created++;
            } else {
              progress.skipped++;
              skipped.push({
                rowNumber: row.rowNumber,
                email: row.email,
                reason: "Student already exists",
              });
            }
          } else {
            // Auth user exists but no users table record found (RLS may block the query)
            // Create the users + students records directly
            // Use upsert on users table with email as conflict target
            const { data: createdUser, error: createUserError } = await client
              .from("users")
              .insert({
                name: row.fullName,
                email: row.email,
                phone: row.phone,
                role: "student",
                institute_id: instituteId,
                is_active: true,
              })
              .select("id")
              .single();

            if (createUserError) {
              // Try to find user again — maybe RLS blocked the first SELECT but insert works
              progress.skipped++;
              skipped.push({
                rowNumber: row.rowNumber,
                email: row.email,
                reason: `Profile creation failed: ${createUserError.message}. Delete this user from Supabase Auth and re-upload.`,
              });
            } else if (createdUser) {
              const admissionNo = `STU-${Date.now().toString(36).toUpperCase()}-${row.rowNumber}`;
              await client.from("students").insert({
                user_id: createdUser.id,
                institute_id: instituteId,
                admission_no: admissionNo,
                status: "active",
              });
              progress.created++;
            }
          }
        } else {
          progress.failed++;
          errors.push({
            rowNumber: row.rowNumber,
            email: row.email,
            error: signUpError.message || "Failed to create user",
          });
        }
      } else if (signUpData?.user) {
        // Create student profile in the students table
        const userId = signUpData.user.id;
        
        // First ensure user record exists in users table
        const { error: userError } = await client.from("users").upsert({
          id: userId,
          name: row.fullName,
          email: row.email,
          phone: row.phone,
          role: "student",
          institute_id: instituteId,
          is_active: true,
        }, { onConflict: "id" });

        if (userError) {
          // Auth user created but users table insert failed — still count as created
          progress.created++;
          errors.push({
            rowNumber: row.rowNumber,
            email: row.email,
            error: `Auth created but profile failed: ${userError.message}`,
          });
        } else {
          // Create student record
          const admissionNo = `STU-${Date.now().toString(36).toUpperCase()}-${row.rowNumber}`;
          const { error: studentError } = await client.from("students").insert({
            user_id: userId,
            institute_id: instituteId,
            admission_no: admissionNo,
            status: "active",
          });

          if (studentError) {
            progress.created++;
            errors.push({
              rowNumber: row.rowNumber,
              email: row.email,
              error: `User created but student record failed: ${studentError.message}`,
            });
          } else {
            progress.created++;
          }
        }
      } else {
        progress.failed++;
        errors.push({
          rowNumber: row.rowNumber,
          email: row.email,
          error: "Sign-up returned no user",
        });
      }
    } catch (err: unknown) {
      progress.failed++;
      const message =
        err instanceof Error ? err.message : "Unknown error occurred";
      errors.push({
        rowNumber: row.rowNumber,
        email: row.email,
        error: message,
      });
    }

    progress.processed++;
    onProgress({ ...progress });

    // Conservative delay between requests to avoid Supabase Auth rate limits
    // Supabase free tier allows ~30 req/s but we stay well under to be safe
    if (progress.processed < rows.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return {
    summary: progress,
    errors,
    skipped,
  };
}
