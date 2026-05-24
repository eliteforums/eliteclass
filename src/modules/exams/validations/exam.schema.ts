import * as z from "zod";

export const examSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  instructions: z.string().optional(),
  duration_mins: z.coerce.number().min(1, "Duration must be at least 1 minute"),
  total_marks: z.coerce.number().min(0),
  passing_marks: z.coerce.number().min(0),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable(),
  auto_submit: z.boolean().default(true),
  negative_marking: z.boolean().default(false),
  negative_marks_per_question: z.coerce.number().default(0),
  randomize_questions: z.boolean().default(false),
});

export type ExamFormData = z.infer<typeof examSchema>;

export const questionSchema = z.object({
  question_text: z.string().min(1, "Question text is required"),
  image_url: z.string().optional().nullable(),
  marks: z.coerce.number().min(0.5, "Marks must be at least 0.5"),
  explanation: z.string().optional(),
  position: z.number().default(0),
  options: z.array(z.object({
    option_text: z.string().min(1, "Option text is required"),
    is_correct: z.boolean().default(false),
    position: z.number(),
  })).min(2, "At least 2 options are required"),
});

export type QuestionFormData = z.infer<typeof questionSchema>;
