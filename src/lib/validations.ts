import { z } from "zod";

// ---------------------------------------------------------------------------
// Reusable field validators
// ---------------------------------------------------------------------------

const emailField = z.string().email("Please enter a valid email address");

const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// ---------------------------------------------------------------------------
// Sign-up
// ---------------------------------------------------------------------------

export const signupSchema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must be 100 characters or fewer"),
    email: emailField,
    password: strongPassword,
    confirmPassword: z.string(),
    role: z.enum(["super_admin", "admin", "staff", "student", "parent"]),
    /** UUID of the institute the user is joining — optional for super_admin */
    institute_id: z.string().uuid("Must be a valid UUID").optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// ---------------------------------------------------------------------------
// Password reset request (sends magic-link / OTP email)
// ---------------------------------------------------------------------------

export const passwordResetSchema = z.object({
  email: emailField,
});

// ---------------------------------------------------------------------------
// Password update (used on the reset-confirmation page)
// ---------------------------------------------------------------------------

export const passwordUpdateSchema = z
  .object({
    password: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// ---------------------------------------------------------------------------
// Inferred TypeScript types — import these instead of duplicating interfaces
// ---------------------------------------------------------------------------

export type LoginSchema = z.infer<typeof loginSchema>;
export type SignupSchema = z.infer<typeof signupSchema>;
export type PasswordResetSchema = z.infer<typeof passwordResetSchema>;
export type PasswordUpdateSchema = z.infer<typeof passwordUpdateSchema>;
