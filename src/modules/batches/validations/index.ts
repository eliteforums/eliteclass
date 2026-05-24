import { z } from "zod";

export const batchSchema = z
  .object({
    name: z
      .string()
      .min(2, "Batch name must be at least 2 characters")
      .max(100, "Batch name must be 100 characters or fewer"),
    academic_year: z
      .string()
      .min(4, "Academic year required")
      .max(20)
      .regex(/^\d{4}(-\d{2,4})?$/, "Format: 2024 or 2024-25"),
    course_id: z.preprocess(
      (value) => (value === "" ? null : value),
      z.string().uuid("Invalid course").optional().nullable(),
    ),
    description: z.string().max(300).optional(),
    batch_code: z.string().max(50, "Batch code must be 50 characters or fewer").optional(),
    course_name: z.string().max(100, "Course name must be 100 characters or fewer").optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    capacity: z
      .number({ invalid_type_error: "Enter a valid number" })
      .int("Capacity must be a whole number")
      .positive("Capacity must be positive")
      .max(1000, "Capacity cannot exceed 1000")
      .optional(),
    status: z.enum(["active", "inactive", "archived"]).default("active"),
  })
  .refine((d) => !d.start_date || !d.end_date || d.end_date >= d.start_date, {
    message: "End date must be on or after start date",
    path: ["end_date"],
  });

export type BatchSchema = z.infer<typeof batchSchema>;
