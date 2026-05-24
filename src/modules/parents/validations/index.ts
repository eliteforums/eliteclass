// ---------------------------------------------------------------------------
// EduOS — Parent Module Validations
//
// Zod schemas for all parent-related forms.
//
// Usage:
//   import { linkParentSchema, type LinkParentSchema } from "@/modules/parents/validations"
// ---------------------------------------------------------------------------

import { z } from "zod";

// ── Link Parent schema ────────────────────────────────────────────────────────

/**
 * Schema for the "Link Parent" modal.
 *
 * The modal uses a two-step flow:
 *  1. Admin enters the parent's email and clicks "Find Parent"
 *  2. If found, admin selects the relation type and clicks "Link Parent"
 *
 * This schema validates both fields for the final submission.
 * The intermediate search step validates `email` in isolation (see the
 * modal component's `handleSearch` which parses only the email field).
 */
export const linkParentSchema = z.object({
  email: z.string().email("Please enter a valid email address"),

  relationType: z.enum(["father", "mother", "guardian", "sibling", "other"], {
    errorMap: () => ({ message: "Please select a relation type" }),
  }),
});

/** TypeScript type inferred from `linkParentSchema`. Use with `useForm<LinkParentSchema>`. */
export type LinkParentSchema = z.infer<typeof linkParentSchema>;
