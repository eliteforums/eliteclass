// ---------------------------------------------------------------------------
// EduOS — LMS Quiz Service
// All functions return ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type { ApiResponse, LmsQuiz, LmsQuizAttempt, LmsQuizChoice, LmsQuizQuestion } from "@/types";

const NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

function sortQuizQuestions(questions: LmsQuizQuestion[] | undefined) {
  if (!questions) return;

  questions.sort((left, right) => left.position - right.position);
  questions.forEach((question) => {
    question.choices?.sort(
      (left: LmsQuizChoice, right: LmsQuizChoice) => left.position - right.position,
    );
  });
}

// ── Extended submit payload (adds attempt_id not in base SubmitQuizPayload) ───

export interface ExtendedSubmitQuizPayload {
  quiz_id: string;
  attempt_id: string;
  enrollment_id: string;
  answers: {
    question_id: string;
    selected_choice_id?: string;
    text_answer?: string;
  }[];
}

// ── getQuizWithQuestions ──────────────────────────────────────────────────────

export async function getQuizWithQuestions(quizId: string): Promise<ApiResponse<LmsQuiz>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_quizzes")
    .select(
      `*,
      questions:lms_quiz_questions(
        *,
        choices:lms_quiz_choices(*)
      )`,
    )
    .eq("id", quizId)
    .single();

  if (error) return { data: null, error: error.message, success: false };

  // Sort by position
  sortQuizQuestions(data?.questions);

  return { data, error: null, success: true };
}

// ── getQuizByLesson ───────────────────────────────────────────────────────────

export async function getQuizByLesson(lessonId: string): Promise<ApiResponse<LmsQuiz>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_quizzes")
    .select(
      `*,
      questions:lms_quiz_questions(
        *,
        choices:lms_quiz_choices(*)
      )`,
    )
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) return { data: null, error: error.message, success: false };
  if (!data) return { data: null, error: "No quiz found for this lesson", success: false };

  sortQuizQuestions(data.questions);

  return { data, error: null, success: true };
}

// ── getQuizAttempts ───────────────────────────────────────────────────────────

export async function getQuizAttempts(
  quizId: string,
  enrollmentId: string,
): Promise<ApiResponse<LmsQuizAttempt[]>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_quiz_attempts")
    .select("*, answers:lms_quiz_attempt_answers(*)")
    .eq("quiz_id", quizId)
    .eq("enrollment_id", enrollmentId)
    .order("attempt_no", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data ?? [], error: null, success: true };
}

// ── startQuizAttempt ──────────────────────────────────────────────────────────

export async function startQuizAttempt(
  quizId: string,
  enrollmentId: string,
  studentId: string,
  instituteId: string,
  attemptNo: number,
): Promise<ApiResponse<LmsQuizAttempt>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("lms_quiz_attempts")
    .insert({
      quiz_id: quizId,
      enrollment_id: enrollmentId,
      student_id: studentId,
      institute_id: instituteId,
      score: 0,
      max_score: 0,
      percentage: 0,
      passed: false,
      attempt_no: attemptNo,
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data, error: null, success: true };
}

// ── submitQuizAttempt ─────────────────────────────────────────────────────────

export async function submitQuizAttempt(
  payload: ExtendedSubmitQuizPayload,
): Promise<ApiResponse<LmsQuizAttempt>> {
  if (!supabase) return NOT_CONFIGURED;

  // Fetch quiz so we can compute scores client-side
  const quizRes = await getQuizWithQuestions(payload.quiz_id);
  if (!quizRes.success || !quizRes.data) {
    return { data: null, error: quizRes.error ?? "Failed to fetch quiz", success: false };
  }

  const quiz = quizRes.data;
  const questions = quiz.questions ?? [];

  let score = 0;
  let maxScore = 0;

  const answerRows: {
    attempt_id: string;
    question_id: string;
    selected_choice_id: string | null;
    text_answer: string | null;
    is_correct: boolean;
    points_earned: number;
  }[] = [];

  for (const question of questions) {
    maxScore += question.points;

    const submitted = payload.answers.find((a) => a.question_id === question.id);
    let isCorrect = false;
    let pointsEarned = 0;

    if (
      submitted &&
      (question.question_type === "mcq" || question.question_type === "true_false")
    ) {
      const correctChoice = question.choices?.find((c) => c.is_correct);
      isCorrect = !!correctChoice && correctChoice.id === submitted.selected_choice_id;
      pointsEarned = isCorrect ? question.points : 0;
    }
    // short_answer requires manual grading — points stay 0

    score += pointsEarned;
    answerRows.push({
      attempt_id: payload.attempt_id,
      question_id: question.id,
      selected_choice_id: submitted?.selected_choice_id ?? null,
      text_answer: submitted?.text_answer ?? null,
      is_correct: isCorrect,
      points_earned: pointsEarned,
    });
  }

  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const passed = percentage >= quiz.passing_score;

  // Persist answer rows
  if (answerRows.length > 0) {
    await supabase.from("lms_quiz_attempt_answers").insert(answerRows);
  }

  // Update attempt record to submitted
  const { data, error } = await supabase
    .from("lms_quiz_attempts")
    .update({
      score,
      max_score: maxScore,
      percentage,
      passed,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", payload.attempt_id)
    .select("*, answers:lms_quiz_attempt_answers(*)")
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data, error: null, success: true };
}
