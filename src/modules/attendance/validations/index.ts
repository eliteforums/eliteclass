// ---------------------------------------------------------------------------
// EduOS — Attendance Module Validations
//
// Zod schemas for all attendance-related forms.
//
// Usage:
//   import { createSessionSchema, type CreateSessionSchema }
//     from "@/modules/attendance/validations"
// ---------------------------------------------------------------------------

import { z } from "zod";

// ── Session creation schema ────────────────────────────────────────────────────

/**
 * Zod schema for the "Create Attendance Session" form.
 *
 * Field notes:
 *  - `batch_id`     — UUID when a batch is selected, `null` when omitted.
 *                     The `.nullable()` modifier accepts explicit null from the
 *                     form handler (empty select → null before submission).
 *  - `session_date` — ISO date string `YYYY-MM-DD`; the date input always
 *                     emits this format so min-length validation is sufficient.
 *  - `session_type` — Discriminates between a full-day roll call (`daily`)
 *                     and a single-lecture check-in (`lecture`).
 *  - `topic`        — Optional free-text; useful for lecture sessions to
 *                     record what was taught alongside attendance.
 *  - `notes`        — Optional admin notes on the session itself.
 */
export const createSessionSchema = z.object({
  batch_id: z
    .string({ required_error: "Select a batch" })
    .min(1, "Select a batch")
    .uuid("Select a valid batch"),
  session_date: z.string().min(1, "Session date is required"),
  session_type: z.enum(["daily", "lecture"]),
  topic: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

/** TypeScript type inferred from `createSessionSchema`. Use with `useForm<CreateSessionSchema>`. */
export type CreateSessionSchema = z.infer<typeof createSessionSchema>;
