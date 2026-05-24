// ---------------------------------------------------------------------------
// EduOS — Student Module Validations
//
// Zod schemas for all student-related forms.
//
// Usage:
//   import { admissionSchema, type AdmissionSchema } from "@/modules/students/validations"
// ---------------------------------------------------------------------------

import { z } from "zod";

// ── Reusable field definitions ────────────────────────────────────────────────

/** International phone number — allows optional leading +, digits, spaces, and separators. */
const phoneField = z
  .string()
  .min(10, "Phone number must be at least 10 digits")
  .max(15, "Phone number must be 15 digits or fewer")
  .regex(/^\+?[0-9\s\-().]+$/, "Please enter a valid phone number");

// ── Admission schema ──────────────────────────────────────────────────────────

/**
 * Zod schema for the "Admit Student" form.
 *
 * Only the core admission fields are required. Everything else stays optional
 * so missing batch, emergency contact, or parent data never blocks admission.
 */
export const admissionSchema = z.object({
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must be 100 characters or fewer"),

  contactEmail: z
    .string()
    .min(1, "Contact email is required")
    .email("Please enter a valid email address"),

  phone: phoneField,

  admissionNo: z
    .string()
    .min(1, "Admission number is required")
    .max(50, "Admission number must be 50 characters or fewer"),

  batchId: z.string().max(100).optional(),

  emergencyContactName: z.string().max(100).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  emergencyRelationship: z.string().max(50).optional(),

  parentName: z.string().max(100).optional(),
  parentEmail: z.string().email().optional().or(z.literal("")),
  parentPhone: phoneField.optional(),
  parentOccupation: z.string().max(100).optional(),
  parentRelationType: z
    .enum(["father", "mother", "guardian", "sibling", "other"])
    .optional(),
});

/** TypeScript type inferred from `admissionSchema`. Use with `useForm<AdmissionSchema>`. */
export type AdmissionSchema = z.infer<typeof admissionSchema>;

// ── Remark schema ─────────────────────────────────────────────────────────────

/**
 * Schema for the "Add Remark" modal textarea.
 * Enforces minimum content so trivially short remarks are rejected early.
 */
export const remarkSchema = z.object({
  remark: z
    .string()
    .min(3, "Remark must be at least 3 characters")
    .max(500, "Remark must be 500 characters or fewer"),
});

/** TypeScript type inferred from `remarkSchema`. Use with `useForm<RemarkSchema>`. */
export type RemarkSchema = z.infer<typeof remarkSchema>;
