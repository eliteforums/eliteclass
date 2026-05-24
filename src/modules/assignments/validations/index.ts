import { z } from "zod";

export const assignmentSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title is too long"),
  description: z.string().optional(),
  instructions: z.string().optional(),
  total_marks: z.coerce
    .number()
    .min(0, "Marks cannot be negative")
    .max(1000, "Marks cannot exceed 1000")
    .default(100),
  due_date: z.string().optional().nullable(),
  allow_late: z.boolean().default(true),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

export type AssignmentSchema = z.infer<typeof assignmentSchema>;

export const submissionSchema = z.object({
  content: z.string().optional(),
});

export type SubmissionSchema = z.infer<typeof submissionSchema>;

export const gradingSchema = z.object({
  grade: z.coerce
    .number()
    .min(0, "Grade cannot be negative"),
  feedback: z.string().min(1, "Please provide feedback"),
});

export type GradingSchema = z.infer<typeof gradingSchema>;

export const assignmentResourceSchema = z.object({
  file_name: z.string(),
  file_url: z.string().url(),
  storage_path: z.string(),
  file_type: z.string().optional(),
  file_size: z.number().optional(),
});

export type AssignmentResourceSchema = z.infer<typeof assignmentResourceSchema>;
