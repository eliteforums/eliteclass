import { Student } from "@/types";

export type ExamStatus = 'draft' | 'published' | 'archived';
export type ExamAttemptStatus = 'in_progress' | 'submitted' | 'graded' | 'auto_submitted' | 'expired';

export interface Exam {
  id: string;
  institute_id: string;
  created_by: string;
  title: string;
  description: string | null;
  instructions: string | null;
  duration_mins: number;
  start_time: string | null;
  end_time: string | null;
  total_marks: number;
  passing_marks: number;
  status: ExamStatus;
  auto_submit: boolean;
  negative_marking: boolean;
  negative_marks_per_question: number;
  randomize_questions: boolean;
  created_at: string;
  updated_at: string;
  questions?: ExamQuestion[];
  total_questions_count?: number;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  question_text: string;
  image_url: string | null;
  marks: number;
  explanation: string | null;
  position: number;
  created_at: string;
  options?: ExamOption[];
}

export interface ExamOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  position: number;
}

export interface ExamAssignment {
  id: string;
  exam_id: string;
  student_id: string;
  institute_id: string;
  assigned_at: string;
  exam?: Exam;
  student?: Student;
}

export interface ExamAttempt {
  id: string;
  exam_id: string;
  student_id: string;
  institute_id: string;
  status: ExamAttemptStatus;
  started_at: string;
  submitted_at: string | null;
  last_violation_at: string | null;
  auto_submit_reason: string | null;
  score: number;
  total_questions: number;
  correct_answers: number;
  wrong_answers: number;
  unanswered_questions: number;
  percentage: number;
  passed: boolean;
  violation_count: number;
  created_at: string;
  exam?: Exam;
  answers?: ExamAnswer[];
}

export interface ExamAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option_id: string | null;
  is_correct: boolean;
  points_earned: number;
  answered_at: string;
}

export interface ExamViolation {
  id: string;
  attempt_id: string;
  violation_type: string;
  violation_data?: any;
  timestamp: string;
}

export interface CreateExamPayload {
  institute_id: string;
  created_by: string;
  title: string;
  description?: string;
  instructions?: string;
  duration_mins: number;
  start_time?: string;
  end_time?: string;
  total_marks: number;
  passing_marks: number;
  status?: ExamStatus;
  auto_submit?: boolean;
  negative_marking?: boolean;
  negative_marks_per_question?: number;
  randomize_questions?: boolean;
}

export interface CreateQuestionPayload {
  exam_id: string;
  question_text: string;
  image_url?: string;
  marks: number;
  explanation?: string;
  position: number;
  options: {
    option_text: string;
    is_correct: boolean;
    position: number;
  }[];
}
