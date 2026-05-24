import { supabase } from "@/lib/supabase";
import { getErrorMessage } from "@/utils/helpers";
import type { ApiResponse, PaginatedResponse } from "@/types";
import type {
  Exam,
  ExamQuestion,
  ExamOption,
  ExamAttempt,
  ExamAnswer,
  ExamViolation,
  CreateExamPayload,
  CreateQuestionPayload,
} from "../types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Admin/Staff Services ───────────────────────────────────────────────────

/**
 * List all exams for an institute
 */
export async function listExams(
  instituteId: string,
  filters: { status?: string; page?: number; pageSize?: number } = {}
): Promise<ApiResponse<PaginatedResponse<Exam>>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("exams")
    .select("*, exam_assignments(count), exam_attempts(count)", { count: "exact" })
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) return { data: null, error: getErrorMessage(error), success: false };

  const formattedData = (data as any[]).map(item => ({
    ...item,
    assignments_count: item.exam_assignments?.[0]?.count ?? 0,
    attempts_count: item.exam_attempts?.[0]?.count ?? 0,
  }));

  return {
    data: {
      items: formattedData as Exam[],
      meta: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    },
    error: null,
    success: true,
  };
}

/**
 * Get exam details with questions and options
 */
export async function getExamDetail(
  examId: string
): Promise<ApiResponse<Exam>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("exams")
    .select(`
      *,
      questions:exam_questions(
        *,
        options:exam_options(*)
      )
    `)
    .eq("id", examId)
    .order('position', { foreignTable: 'exam_questions', ascending: true })
    .order('position', { foreignTable: 'exam_questions.exam_options', ascending: true })
    .single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as Exam, error: null, success: true };
}

/**
 * Delete an exam
 */
export async function deleteExam(
  examId: string
): Promise<ApiResponse<void>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase
    .from("exams")
    .delete()
    .eq("id", examId);

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: undefined, error: null, success: true };
}

/**
 * Delete a question
 */
export async function deleteQuestion(
  questionId: string
): Promise<ApiResponse<void>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase
    .from("exam_questions")
    .delete()
    .eq("id", questionId);

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: undefined, error: null, success: true };
}

/**
 * Create a new exam
 */
export async function createExam(
  payload: CreateExamPayload
): Promise<ApiResponse<Exam>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("exams")
    .insert(payload)
    .select()
    .single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as Exam, error: null, success: true };
}

/**
 * Update an exam
 */
export async function updateExam(
  examId: string,
  payload: Partial<CreateExamPayload>
): Promise<ApiResponse<Exam>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("exams")
    .update(payload)
    .eq("id", examId)
    .select()
    .single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as Exam, error: null, success: true };
}

/**
 * Add a question with options to an exam
 */
export async function addQuestion(
  payload: CreateQuestionPayload
): Promise<ApiResponse<ExamQuestion>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { options, ...questionData } = payload;

  const { data: question, error: qError } = await supabase
    .from("exam_questions")
    .insert(questionData)
    .select()
    .single();

  if (qError) return { data: null, error: getErrorMessage(qError), success: false };

  const optionsPayload = options.map(opt => ({
    ...opt,
    question_id: question.id,
  }));

  const { error: oError } = await supabase
    .from("exam_options")
    .insert(optionsPayload);

  if (oError) {
    // Cleanup question if options fail
    await supabase.from("exam_questions").delete().eq("id", question.id);
    return { data: null, error: getErrorMessage(oError), success: false };
  }

  return { data: question as ExamQuestion, error: null, success: true };
}

/**
 * Assign an exam to multiple students
 */
export async function assignExamToStudents(
  examId: string,
  instituteId: string,
  studentIds: string[]
): Promise<ApiResponse<void>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // First delete existing assignees to handle removals
  await supabase.from("exam_assignments").delete().eq("exam_id", examId);

  const payload = studentIds.map((sid) => ({
    exam_id: examId,
    student_id: sid,
    institute_id: instituteId,
  }));

  const { error } = await supabase.from("exam_assignments").insert(payload);

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: undefined, error: null, success: true };
}

/**
 * Get assignees for an exam
 */
export async function getAssignees(
  examId: string
): Promise<ApiResponse<string[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("exam_assignments")
    .select("student_id")
    .eq("exam_id", examId);

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data.map(d => d.student_id), error: null, success: true };
}

// ── Student Services ────────────────────────────────────────────────────────

/**
 * List all exams assigned to the current student
 */
export async function listStudentExams(
  userId: string
): Promise<ApiResponse<(Exam & { attempt?: ExamAttempt | null })[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!student) return { data: null, error: "Student profile not found", success: false };

  const { data, error } = await supabase
    .from("exams")
    .select(`
      *,
      exam_assignments!inner(student_id),
      attempts:exam_attempts(id, status, score, percentage, passed, submitted_at, violation_count, last_violation_at, auto_submit_reason)
    `)
    .eq("exam_assignments.student_id", student.id)
    .eq("status", "published")
    .order("start_time", { ascending: true });

  if (error) return { data: null, error: getErrorMessage(error), success: false };

  const formattedData = (data as any[]).map(item => ({
    ...item,
    attempt: item.attempts?.[0] ?? null,
  }));

  return { data: formattedData, error: null, success: true };
}

/**
 * Start or resume an exam attempt
 */
export async function startExamAttempt(
  examId: string,
  userId: string,
  instituteId: string
): Promise<ApiResponse<ExamAttempt>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!student) return { data: null, error: "Student profile not found", success: false };

  // Check if attempt already exists (latest row if duplicates exist)
  const { data: existingAttempts, error: existingError } = await supabase
    .from("exam_attempts")
    .select("*")
    .eq("exam_id", examId)
    .eq("student_id", student.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingError) {
    return { data: null, error: getErrorMessage(existingError), success: false };
  }

  const existingAttempt = existingAttempts?.[0];

  if (existingAttempt) {
    if (existingAttempt.status === 'submitted' || existingAttempt.status === 'graded') {
      return { data: null, error: "Test already submitted. Multiple attempts are not allowed.", success: false };
    }
    return { data: existingAttempt as ExamAttempt, error: null, success: true };
  }

  // Create new attempt
  const { data, error } = await supabase
    .from("exam_attempts")
    .insert({
      exam_id: examId,
      student_id: student.id,
      institute_id: instituteId,
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as ExamAttempt, error: null, success: true };
}

/**
 * Auto-save an answer during the exam
 */
export async function saveExamAnswer(
  attemptId: string,
  questionId: string,
  selectedOptionId: string
): Promise<ApiResponse<ExamAnswer>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("exam_answers")
    .upsert({
      attempt_id: attemptId,
      question_id: questionId,
      selected_option_id: selectedOptionId,
      answered_at: new Date().toISOString(),
    }, { onConflict: "attempt_id,question_id" })
    .select()
    .single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as ExamAnswer, error: null, success: true };
}

/**
 * Record a violation (tab switch, etc.)
 */
export async function recordViolation(
  attemptId: string,
  violationType: string,
  violationData?: any
): Promise<ApiResponse<ExamViolation>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("exam_violations")
    .insert({
      attempt_id: attemptId,
      violation_type: violationType,
      violation_data: violationData,
    })
    .select()
    .single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };

  // Update violation count in attempt
  await supabase.rpc('increment_violation_count', { attempt_id: attemptId });

  return { data: data as ExamViolation, error: null, success: true };
}

/**
 * Submit the exam attempt and calculate score
 */
export async function submitExamAttempt(
  attemptId: string,
  options?: { autoSubmitReason?: string | null }
): Promise<ApiResponse<ExamAttempt>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // Fetch all questions and answers for this attempt
  const { data: attempt, error: attemptError } = await supabase
    .from("exam_attempts")
    .select(`
      *,
      exam:exams(
        *,
        questions:exam_questions(
          *,
          options:exam_options(*)
        )
      ),
      answers:exam_answers(*)
    `)
    .eq("id", attemptId)
    .single();

  if (attemptError) return { data: null, error: getErrorMessage(attemptError), success: false };

  const exam = (attempt as any).exam;
  const questions = exam.questions;
  const answers = (attempt as any).answers;

  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  questions.forEach((q: any) => {
    const answer = answers.find((a: any) => a.question_id === q.id);
    if (!answer || !answer.selected_option_id) {
      unansweredCount++;
    } else {
      const selectedOption = q.options.find((o: any) => o.id === answer.selected_option_id);
      if (selectedOption?.is_correct) {
        correctCount++;
        score += Number(q.marks);
      } else {
        wrongCount++;
        if (exam.negative_marking) {
          score -= Number(exam.negative_marks_per_question);
        }
      }
    }
  });

  const percentage = (score / exam.total_marks) * 100;
  const passed = percentage >= exam.passing_marks;

  const { data: updatedAttempt, error: updateError } = await supabase
    .from("exam_attempts")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      auto_submit_reason: options?.autoSubmitReason ?? null,
      score,
      total_questions: questions.length,
      correct_answers: correctCount,
      wrong_answers: wrongCount,
      unanswered_questions: unansweredCount,
      percentage,
      passed,
    })
    .eq("id", attemptId)
    .select()
    .single();

  if (updateError) return { data: null, error: getErrorMessage(updateError), success: false };
  return { data: updatedAttempt as ExamAttempt, error: null, success: true };
}

/**
 * Get attempt details with answers
 */
export async function getAttemptDetail(
  attemptId: string
): Promise<ApiResponse<ExamAttempt>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("exam_attempts")
    .select(`
      *,
      exam:exams(
        *,
        questions:exam_questions(
          *,
          options:exam_options(*)
        )
      ),
      answers:exam_answers(*),
      violations:exam_violations(*)
    `)
    .eq("id", attemptId)
    .single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as ExamAttempt, error: null, success: true };
}

/**
 * List all attempts/results for an exam.
 * Returns all assigned students and their attempt status.
 */
export async function listAttempts(
  examId: string
): Promise<ApiResponse<any[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // 1. Fetch the exam total marks first
  const { data: examData } = await supabase
    .from("exams")
    .select("total_marks")
    .eq("id", examId)
    .single();

  const totalMarks = examData?.total_marks || 0;

  // 2. Fetch all assigned students
  const { data: assignments, error: aError } = await supabase
    .from("exam_assignments")
    .select(`
      student_id,
      student:students(
        id,
        admission_no,
        user:users(id, name, email)
      )
    `)
    .eq("exam_id", examId);

  if (aError) return { data: null, error: getErrorMessage(aError), success: false };

  // 3. Fetch all attempts for this exam
  const { data: attempts, error: attError } = await supabase
    .from("exam_attempts")
    .select("*")
    .eq("exam_id", examId);

  if (attError) return { data: null, error: getErrorMessage(attError), success: false };

  // 4. Merge them
  const formattedData = (assignments as any[]).map((asgn) => {
    const attempt = attempts.find((att: any) => att.student_id === asgn.student_id);
    return {
      id: attempt?.id || `no-attempt-${asgn.student_id}`,
      student_id: asgn.student_id,
      student: asgn.student,
      status: attempt?.status ?? "not_started",
      score: attempt?.score ?? 0,
      percentage: attempt?.percentage ?? 0,
      violation_count: attempt?.violation_count ?? 0,
      last_violation_at: attempt?.last_violation_at ?? null,
      auto_submit_reason: attempt?.auto_submit_reason ?? null,
      started_at: attempt?.started_at ?? null,
      submitted_at: attempt?.submitted_at ?? null,
      exam: { total_marks: totalMarks }
    };
  });

  // 5. Sort: Submitted first, then In Progress, then Not Started
  const statusOrder: Record<string, number> = {
    submitted: 0,
    auto_submitted: 0,
    graded: 0,
    expired: 0,
    in_progress: 1,
    not_started: 2,
  };
  formattedData.sort((a, b) => {
    const orderA = statusOrder[a.status] ?? 99;
    const orderB = statusOrder[b.status] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    
    const dateA = new Date(a.submitted_at || a.started_at || 0).getTime();
    const dateB = new Date(b.submitted_at || b.started_at || 0).getTime();
    return dateB - dateA;
  });

  return { data: formattedData, error: null, success: true };
}

// ── Security & Validation Services ──────────────────────────────────────────

/**
 * Validate exam timing using server-side time
 * Prevents frontend time manipulation
 */
export async function validateExamTiming(examId: string): Promise<ApiResponse<{
  isAvailable: boolean;
  currentServerTime: string;
  startTime: string | null;
  endTime: string | null;
  reason: string;
}>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.rpc('validate_exam_timing', { exam_id: examId });

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  
  if (!data || data.length === 0) {
    return { data: null, error: "Exam not found", success: false };
  }

  const result = data[0];
  return {
    data: {
      isAvailable: result.is_available,
      currentServerTime: result.current_server_time,
      startTime: result.start_time,
      endTime: result.end_time,
      reason: result.reason,
    },
    error: null,
    success: true,
  };
}

/**
 * Get the current active attempt for a student
 * Enforces single attempt per test
 */
export async function getActiveAttempt(
  examId: string,
  userId: string
): Promise<ApiResponse<{
  attemptId: string;
  status: string;
  isLocked: boolean;
  startedAt: string;
  canResume: boolean;
} | null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!student) return { data: null, error: "Student profile not found", success: false };

  const { data, error } = await supabase.rpc('get_active_student_attempt', {
    p_exam_id: examId,
    p_student_id: student.id,
  });

  if (error) return { data: null, error: getErrorMessage(error), success: false };

  if (!data || data.length === 0) {
    return { data: null, error: null, success: true };
  }

  const result = data[0];
  return {
    data: {
      attemptId: result.attempt_id,
      status: result.status,
      isLocked: result.is_locked,
      startedAt: result.started_at,
      canResume: result.can_resume,
    },
    error: null,
    success: true,
  };
}

/**
 * Validate single attempt - ensures student hasn't already submitted
 */
export async function validateSingleAttempt(
  examId: string,
  userId: string
): Promise<ApiResponse<{ canAttempt: boolean; reason: string }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!student) return { data: null, error: "Student profile not found", success: false };

  // Check for existing submitted attempts
  const { data: submissions, error } = await supabase
    .from("exam_attempts")
    .select("id, status, is_locked")
    .eq("exam_id", examId)
    .eq("student_id", student.id)
    .in("status", ["submitted", "auto_submitted", "graded", "expired"]);

  if (error) return { data: null, error: getErrorMessage(error), success: false };

  if (submissions && submissions.length > 0) {
    return {
      data: { canAttempt: false, reason: "You have already submitted this test. Multiple attempts are not allowed." },
      error: null,
      success: true,
    };
  }

  return {
    data: { canAttempt: true, reason: "OK" },
    error: null,
    success: true,
  };
}

/**
 * Create a secure exam session (browser fingerprint, device tracking, session token)
 */
export async function createExamSession(
  attemptId: string,
  studentId: string,
  examId: string,
  instituteId: string,
  sessionData: {
    browserFingerprint?: string;
    deviceId?: string;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<ApiResponse<{ sessionToken: string; sessionId: string }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  // Generate session token
  const sessionToken = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const { data, error } = await supabase
    .from("exam_sessions")
    .insert({
      attempt_id: attemptId,
      student_id: studentId,
      exam_id: examId,
      institute_id: instituteId,
      session_token: sessionToken,
      browser_fingerprint: sessionData.browserFingerprint,
      device_id: sessionData.deviceId,
      ip_address: sessionData.ipAddress,
      user_agent: sessionData.userAgent,
      is_active: true,
      status: "active",
      last_activity: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };

  // Update attempt with session ID
  await supabase
    .from("exam_attempts")
    .update({ current_session_id: (data as any).id })
    .eq("id", attemptId);

  return {
    data: { sessionToken, sessionId: (data as any).id },
    error: null,
    success: true,
  };
}

/**
 * Validate session token to prevent multiple device access
 */
export async function validateSessionToken(
  token: string
): Promise<ApiResponse<{ isValid: boolean; attemptId?: string; reason: string }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.rpc('validate_session_token', { token });

  if (error) return { data: null, error: getErrorMessage(error), success: false };

  if (!data || data.length === 0) {
    return { data: { isValid: false, reason: "Session token not found" }, error: null, success: true };
  }

  const result = data[0];
  return {
    data: {
      isValid: result.is_valid,
      attemptId: result.attempt_id,
      reason: result.reason,
    },
    error: null,
    success: true,
  };
}

/**
 * Count active sessions for an attempt (prevent multiple devices)
 */
export async function countActiveSessionsForAttempt(attemptId: string): Promise<ApiResponse<number>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.rpc('count_active_sessions_for_attempt', { attempt_id: attemptId });

  if (error) return { data: null, error: getErrorMessage(error), success: false };

  return { data: Number(data) || 0, error: null, success: true };
}

/**
 * Client-side fallback when test_violations RPC/schema is misconfigured.
 * Uses exam_violations + exam_attempts (always FK-aligned in 041).
 */
async function recordViolationWithCheckFallback(
  attemptId: string,
  violationType: string,
  metadata?: any
): Promise<ApiResponse<{
  violationId: string;
  totalViolations: number;
  shouldAutoSubmit: boolean;
  reason: string;
}>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data: attemptRow, error: attemptError } = await supabase
    .from("exam_attempts")
    .select("id, status, is_locked, violation_count")
    .eq("id", attemptId)
    .maybeSingle();

  if (attemptError || !attemptRow) {
    return {
      data: null,
      error: attemptError ? getErrorMessage(attemptError) : "Exam attempt not found",
      success: false,
    };
  }

  if (attemptRow.status !== "in_progress" || attemptRow.is_locked) {
    return {
      data: {
        violationId: "",
        totalViolations: attemptRow.violation_count ?? 0,
        shouldAutoSubmit: false,
        reason: "Attempt is no longer active",
      },
      error: null,
      success: true,
    };
  }

  const { data: violation, error: insertError } = await supabase
    .from("exam_violations")
    .insert({
      attempt_id: attemptId,
      violation_type: violationType,
      violation_data: metadata ?? {},
    })
    .select("id")
    .single();

  if (insertError) {
    return { data: null, error: getErrorMessage(insertError), success: false };
  }

  const nextCount = (attemptRow.violation_count ?? 0) + 1;
  const shouldAutoSubmit = nextCount >= 3;

  const { error: updateError } = await supabase
    .from("exam_attempts")
    .update({
      violation_count: nextCount,
      last_violation_at: new Date().toISOString(),
      ...(shouldAutoSubmit
        ? {
            status: "submitted",
            submitted_at: new Date().toISOString(),
            is_locked: true,
            auto_submit_reason: "Exceeded maximum proctoring violations",
          }
        : { auto_submit_reason: null }),
    })
    .eq("id", attemptId);

  if (updateError) {
    return { data: null, error: getErrorMessage(updateError), success: false };
  }

  return {
    data: {
      violationId: violation.id,
      totalViolations: nextCount,
      shouldAutoSubmit,
      reason: shouldAutoSubmit
        ? "Auto-submitted due to excessive violations"
        : "Violation recorded",
    },
    error: null,
    success: true,
  };
}

function shouldUseViolationRpcFallback(errorMessage: string): boolean {
  const msg = errorMessage.toLowerCase();
  return (
    msg.includes("test_violations") ||
    msg.includes("violation_count") ||
    msg.includes("violation_type") ||
    msg.includes("foreign key") ||
    msg.includes("does not exist")
  );
}

/**
 * Record violation with automatic escalation
 * 3rd violation = auto-submit
 */
export async function recordViolationWithCheck(
  attemptId: string,
  violationType: string,
  metadata?: any
): Promise<ApiResponse<{
  violationId: string;
  totalViolations: number;
  shouldAutoSubmit: boolean;
  reason: string;
}>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.rpc("record_and_check_violations", {
    p_attempt_id: attemptId,
    p_violation_type: violationType,
    p_metadata: metadata || {},
  });

  if (error) {
    const message = getErrorMessage(error);
    if (shouldUseViolationRpcFallback(message)) {
      return recordViolationWithCheckFallback(attemptId, violationType, metadata);
    }
    return { data: null, error: message, success: false };
  }

  if (!data || data.length === 0) {
    return { data: null, error: "Failed to record violation", success: false };
  }

  const result = data[0];
  return {
    data: {
      violationId: result.violation_id,
      totalViolations: result.total_violations,
      shouldAutoSubmit: result.should_auto_submit,
      reason: result.reason,
    },
    error: null,
    success: true,
  };
}

/**
 * Lock exam attempt (prevent further modifications)
 */
export async function lockExamAttempt(attemptId: string): Promise<ApiResponse<void>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.rpc('lock_exam_attempt', { attempt_id: attemptId });

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: undefined, error: null, success: true };
}

/**
 * Get summary of violations for all attempts in an exam.
 */
export async function getExamAttemptViolations(examId: string): Promise<ApiResponse<any[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.rpc('get_exam_attempt_violations', {
    p_exam_id: examId,
  });

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data || [], error: null, success: true };
}

/**
 * Auto-submit expired attempts
 * Called periodically or when timer expires
 */
export async function autoSubmitExpiredAttempts(): Promise<ApiResponse<number>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.rpc('auto_submit_expired_attempts');

  if (error) return { data: null, error: getErrorMessage(error), success: false };

  const submittedCount = Array.isArray(data) ? data.length : 0;
  return { data: submittedCount, error: null, success: true };
}

/**
 * Get violation details for an attempt
 */
export async function getAttemptViolations(attemptId: string): Promise<ApiResponse<any[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("test_violations")
    .select("*")
    .eq("attempt_id", attemptId)
    .order("timestamp", { ascending: false });

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data || [], error: null, success: true };
}

/**
 * Update attempt activity timestamp (for session monitoring)
 */
export async function updateAttemptActivity(attemptId: string): Promise<ApiResponse<void>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase
    .from("exam_attempts")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", attemptId);

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: undefined, error: null, success: true };
}
