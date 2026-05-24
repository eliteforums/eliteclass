// ---------------------------------------------------------------------------
// EduOS — Fee Module Validations
//
// Zod schemas for all fee-related forms:
//  - createFeeStructureSchema  — "Add Fee Structure" modal
//  - assignFeeSchema           — "Assign Fee" modal (per-student)
//  - recordPaymentSchema       — "Record Payment" modal
//
// Usage:
//   import { recordPaymentSchema, type RecordPaymentSchema } from "@/modules/fees/validations"
// ---------------------------------------------------------------------------

import { z } from "zod";

// ── Create Fee Structure ──────────────────────────────────────────────────────

/**
 * Zod schema for the "Add Fee Structure" form.
 *
 * `amount` uses `z.number()` so that the caller must coerce the HTML input
 * value using `{ valueAsNumber: true }` in React Hook Form's `register` call.
 * This keeps the inferred TypeScript type as `number`, not `string | number`.
 */
export const createFeeStructureSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be 100 characters or fewer"),

  amount: z
    .number({ invalid_type_error: "Enter a valid amount" })
    .positive("Amount must be positive"),

  frequency: z.enum(["one_time", "monthly", "quarterly", "annual"], {
    errorMap: () => ({ message: "Select a valid frequency" }),
  }),

  academic_year: z
    .string()
    .min(4, "Academic year is required")
    .max(20, "Academic year must be 20 characters or fewer"),

  description: z.string().max(500, "Description must be 500 characters or fewer").optional(),
});

export type CreateFeeStructureSchema = z.infer<typeof createFeeStructureSchema>;

// ── Assign Fee to Student ─────────────────────────────────────────────────────

/**
 * Zod schema for the "Assign Fee" modal.
 *
 * `discount_amount` defaults to `0` so the field is never required.
 * `fee_structure_id` must be a valid UUID — enforced so the UI dropdown
 * cannot submit an empty placeholder string.
 */
export const assignFeeSchema = z.object({
  fee_structure_id: z.string().uuid("Please select a fee structure"),

  discount_amount: z.number().min(0, "Discount cannot be negative").default(0),

  discount_reason: z
    .string()
    .max(200, "Discount reason must be 200 characters or fewer")
    .optional(),

  due_date: z.string().min(1, "Due date is required"),

  academic_year: z
    .string()
    .min(4, "Academic year is required")
    .max(20, "Academic year must be 20 characters or fewer"),
});

export type AssignFeeSchema = z.infer<typeof assignFeeSchema>;

// ── Record Payment ────────────────────────────────────────────────────────────

/**
 * Zod schema for the "Record Payment" modal.
 *
 * `payment_date` is a plain date string (YYYY-MM-DD from an HTML date input).
 * `transaction_ref` and `notes` are optional free-text fields.
 */
export const recordPaymentSchema = z.object({
  amount: z
    .number({ invalid_type_error: "Enter a valid amount" })
    .positive("Amount must be positive"),

  payment_method: z.enum(["cash", "upi", "bank_transfer", "cheque", "card"], {
    errorMap: () => ({ message: "Select a payment method" }),
  }),

  payment_date: z.string().min(1, "Payment date is required"),

  transaction_ref: z
    .string()
    .max(100, "Transaction reference must be 100 characters or fewer")
    .optional(),

  notes: z.string().max(300, "Notes must be 300 characters or fewer").optional(),
});

export type RecordPaymentSchema = z.infer<typeof recordPaymentSchema>;
