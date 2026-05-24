// ---------------------------------------------------------------------------
// EduOS — Auth Module Validations
//
// Zod schemas for every auth form in this module.
// The global `src/lib/validations.ts` holds the app-wide base schemas;
// these are auth-module-scoped and may diverge (e.g. stricter rules for
// institute registration vs. a simple staff sign-in).
//
// Usage:
//   import { loginSchema, type LoginSchema } from "@/modules/auth/validations"
// ---------------------------------------------------------------------------

import { z } from "zod";

// ── Reusable field definitions ───────────────────────────────────────────────

/** Validates that the value is a properly formed email address. */
const emailField = z.string().email("Please enter a valid email address");

/**
 * Strong-password rule applied to all sign-up / password-update forms.
 * Requirements: 8+ chars, at least one uppercase letter, at least one digit.
 */
const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

// ── Login ────────────────────────────────────────────────────────────────────

/**
 * Schema for the sign-in form.
 * Password only enforces a minimum length here — full strength rules are not
 * required because existing accounts may pre-date them.
 */
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// ── Institute registration ────────────────────────────────────────────────────

/**
 * Schema for the "Register your Institute" multi-field form.
 * Validates each field independently, then cross-validates the password pair.
 */
export const registerInstituteSchema = z
  .object({
    instituteName: z
      .string()
      .min(2, "Institute name must be at least 2 characters")
      .max(150, "Institute name must be 150 characters or fewer"),

    adminName: z
      .string()
      .min(2, "Admin name must be at least 2 characters")
      .max(100, "Admin name must be 100 characters or fewer"),

    email: emailField,

    phone: z
      .string()
      .min(10, "Phone number must be at least 10 digits")
      .max(15, "Phone number must be 15 digits or fewer")
      .regex(/^\+?[0-9\s\-().]+$/, "Please enter a valid phone number"),

    password: strongPassword,

    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// ── Forgot password ──────────────────────────────────────────────────────────

/**
 * Schema for the "Forgot password" form — collects only an email address
 * so the service can dispatch a Supabase password-reset link.
 */
export const forgotPasswordSchema = z.object({
  email: emailField,
});

// ── Update / reset password ──────────────────────────────────────────────────

/**
 * Schema for the "Set new password" form shown after the user clicks the
 * reset link in their email.
 * Enforces the full strong-password rule and checks that both fields match.
 */
export const updatePasswordSchema = z
  .object({
    password: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// ── Inferred TypeScript types ─────────────────────────────────────────────────

/** Type inferred from `loginSchema` — use with `useForm<LoginSchema>`. */
export type LoginSchema = z.infer<typeof loginSchema>;

/** Type inferred from `registerInstituteSchema`. */
export type RegisterInstituteSchema = z.infer<typeof registerInstituteSchema>;

/** Type inferred from `forgotPasswordSchema`. */
export type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;

/** Type inferred from `updatePasswordSchema`. */
export type UpdatePasswordSchema = z.infer<typeof updatePasswordSchema>;
