// ---------------------------------------------------------------------------
// EduOS — LMS Course Zod Schemas
//
// Validation schemas for course creation wizard forms.
// Inferred TypeScript types are exported alongside each schema.
// ---------------------------------------------------------------------------

import { z } from "zod";

const uuidOrEmpty = z
  .string()
  .optional()
  .or(z.literal(""))
  .refine((val) => !val || z.string().uuid().safeParse(val).success, {
    message: "Please select a valid category",
  });

const uniqueTags = (max: number) =>
  z
    .array(
      z
        .string()
        .trim()
        .min(1, "Tag cannot be empty")
        .max(50, "Each tag must be 50 characters or fewer"),
    )
    .max(max, `Maximum ${max} tags allowed`)
    .default([])
    .refine((tags) => new Set(tags.map((t) => t.toLowerCase())).size === tags.length, {
      message: "Duplicate tags are not allowed",
    });

// ── Create Course ─────────────────────────────────────────────────────────────

export const createCourseSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title must be 200 characters or fewer"),

    subtitle: z
      .string()
      .max(300, "Subtitle must be 300 characters or fewer")
      .optional()
      .or(z.literal("")),

    description: z
      .string()
      .max(5000, "Description must be 5000 characters or fewer")
      .optional()
      .or(z.literal("")),

    category_id: uuidOrEmpty,

    course_id: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine((val) => !val || z.string().uuid().safeParse(val).success, {
        message: "Please select a valid academic course",
      }),

    difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"], {
      required_error: "Please select a difficulty level",
    }),

    language: z.string().min(1, "Please select a language"),

    estimated_duration_mins: z
      .number({
        invalid_type_error: "Please enter a valid number",
      })
      .min(0, "Duration must be 0 or more")
      .max(100_000, "Duration seems too long")
      .default(0),

    visibility: z.enum(["public", "institutional", "private"], {
      required_error: "Please select visibility",
    }),

    pricing: z.enum(["free", "paid"], {
      required_error: "Please select pricing",
    }),

    price: z
      .number({
        invalid_type_error: "Please enter a valid price",
      })
      .min(0, "Price must be 0 or more")
      .default(0),

    tags: uniqueTags(20),

    prerequisites: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Prerequisite cannot be empty")
          .max(200, "Each prerequisite must be 200 characters or fewer"),
      )
      .max(15, "Maximum 15 prerequisites allowed")
      .default([]),

    learning_outcomes: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Learning outcome cannot be empty")
          .max(200, "Each outcome must be 200 characters or fewer"),
      )
      .max(15, "Maximum 15 learning outcomes allowed")
      .default([]),
  })
  .refine(
    (data) => {
      if (data.pricing === "paid") return data.price > 0;
      return true;
    },
    {
      message: "Price must be greater than 0 for paid courses",
      path: ["price"],
    },
  );

export type CreateCourseSchema = z.infer<typeof createCourseSchema>;

// ── Intro video URL (Step 2 external tab) ─────────────────────────────────────

export const introVideoUrlSchema = z
  .string()
  .trim()
  .min(1, "Video URL is required")
  .url("Please enter a valid URL")
  .refine((url) => /^https?:\/\//i.test(url), {
    message: "URL must start with http:// or https://",
  })
  .refine((url) => /youtube\.com|youtu\.be|vimeo\.com/i.test(url), {
    message: "Only YouTube or Vimeo URLs are supported",
  });

export type IntroVideoUrlSchema = z.infer<typeof introVideoUrlSchema>;

// ── Create Module ─────────────────────────────────────────────────────────────

export const createModuleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Module title is required")
    .max(200, "Title must be 200 characters or fewer"),
  description: z
    .string()
    .max(1000, "Description must be 1000 characters or fewer")
    .optional()
    .or(z.literal("")),
});

export type CreateModuleSchema = z.infer<typeof createModuleSchema>;

// ── Create Lesson ─────────────────────────────────────────────────────────────

export const createLessonSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Lesson title is required")
    .max(200, "Title must be 200 characters or fewer"),
  description: z
    .string()
    .max(1000, "Description must be 1000 characters or fewer")
    .optional()
    .or(z.literal("")),
  lesson_type: z.enum(["video", "pdf", "text", "quiz", "assignment", "live"], {
    required_error: "Please select a lesson type",
  }),
  is_preview: z.boolean().default(false),
});

export type CreateLessonSchema = z.infer<typeof createLessonSchema>;

// ── Create Quiz ────────────────────────────────────────────────────────────────

export const createQuizSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Quiz title is required")
    .max(200, "Title must be 200 characters or fewer"),

  description: z
    .string()
    .max(2000, "Description must be 2000 characters or fewer")
    .optional()
    .or(z.literal("")),

  time_limit_mins: z
    .number({
      invalid_type_error: "Please enter a valid number",
    })
    .int("Time limit must be a whole number")
    .positive("Time limit must be positive")
    .nullable()
    .default(null),

  passing_score: z
    .number({
      invalid_type_error: "Please enter a valid number",
    })
    .int("Passing score must be a whole number")
    .min(0, "Passing score must be at least 0")
    .max(100, "Passing score cannot exceed 100")
    .default(70),

  max_attempts: z
    .number({
      invalid_type_error: "Please enter a valid number",
    })
    .int("Max attempts must be a whole number")
    .min(1, "At least 1 attempt is required")
    .max(10, "Max attempts cannot exceed 10")
    .default(3),

  shuffle_questions: z.boolean().default(false),

  show_answers: z.boolean().default(true),
});

export type CreateQuizSchema = z.infer<typeof createQuizSchema>;

// ── Create Quiz Question ─────────────────────────────────────────────────────

export const createQuestionSchema = z
  .object({
    question: z.string().trim().min(1, "Question text is required"),

    question_type: z.enum(["mcq", "true_false", "short_answer"], {
      required_error: "Please select a question type",
    }),

    points: z
      .number({
        invalid_type_error: "Points must be a number",
      })
      .min(0.5, "Each question must be worth at least 0.5 points")
      .default(1),

    explanation: z
      .string()
      .max(2000, "Explanation must be 2000 characters or fewer")
      .optional()
      .or(z.literal("")),

    choices: z
      .array(
        z.object({
          choice_text: z.string().trim().min(1, "Choice text is required"),
          is_correct: z.boolean(),
          position: z.number().int(),
        }),
      )
      .optional(),
  })
  .refine(
    (data) => {
      if (data.question_type === "mcq") {
        const choices = data.choices ?? [];
        const hasMinChoices = choices.length >= 2;
        const hasExactlyOneCorrect = choices.filter((c) => c.is_correct).length === 1;
        return hasMinChoices && hasExactlyOneCorrect;
      }
      if (data.question_type === "true_false") {
        const choices = data.choices ?? [];
        return choices.length === 2 && choices.filter((c) => c.is_correct).length === 1;
      }
      return true;
    },
    {
      message:
        "MCQ questions must have at least 2 choices with exactly 1 correct answer. " +
        "True/False questions must have exactly 2 choices with exactly 1 correct.",
    },
  );

export type CreateQuestionSchema = z.infer<typeof createQuestionSchema>;

// ── Create Assignment ──────────────────────────────────────────────────────────────

export const createAssignmentSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Assignment title is required")
      .max(200, "Title must be 200 characters or fewer"),

    description: z
      .string()
      .max(5000, "Description must be 5000 characters or fewer")
      .optional()
      .or(z.literal("")),

    instructions: z
      .string()
      .max(10_000, "Instructions must be 10 000 characters or fewer")
      .optional()
      .or(z.literal("")),

    due_date: z
      .string()
      .datetime({ message: "Invalid date format — use ISO 8601" })
      .nullable()
      .optional(),

    max_score: z
      .number({
        invalid_type_error: "Max score must be a number",
      })
      .min(0, "Max score must be at least 0")
      .max(10_000, "Max score seems too high")
      .default(100),

    allow_late: z.boolean().default(false),

    accepted_file_types: z.array(z.string().min(1)).default([]),
  })
  .refine(
    (data) => {
      if (data.due_date && !data.allow_late) {
        return new Date(data.due_date) > new Date();
      }
      return true;
    },
    {
      message: "Due date must be in the future when late submissions are not allowed",
      path: ["due_date"],
    },
  );

export type CreateAssignmentSchema = z.infer<typeof createAssignmentSchema>;

// ── Enroll Students ────────────────────────────────────────────────────────────────

export const enrollStudentsSchema = z.object({
  course_id: z.string().uuid("Course ID must be a valid UUID"),

  student_ids: z
    .array(z.string().uuid("Each student ID must be a valid UUID"))
    .min(1, "Select at least one student"),

  batch_id: z.string().uuid("Batch ID must be a valid UUID").optional().or(z.literal("")),
});

export type EnrollStudentsSchema = z.infer<typeof enrollStudentsSchema>;

// ── Grade Submission ────────────────────────────────────────────────────────────────

export const gradeSubmissionSchema = z.object({
  submission_id: z.string().uuid("Submission ID must be a valid UUID"),

  grade: z
    .number({
      invalid_type_error: "Grade must be a number",
    })
    .min(0, "Grade cannot be negative")
    .max(10_000, "Grade seems too high"),

  feedback: z
    .string()
    .max(5000, "Feedback must be 5000 characters or fewer")
    .optional()
    .or(z.literal("")),
});

export type GradeSubmissionSchema = z.infer<typeof gradeSubmissionSchema>;
