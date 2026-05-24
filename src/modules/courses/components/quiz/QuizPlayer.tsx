// ---------------------------------------------------------------------------
// QuizPlayer — full student-facing quiz interface (pre-quiz → in-progress → results)
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef, useCallback } from "react";
import {
  HelpCircle,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Award,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getQuizAttempts,
  startQuizAttempt,
  submitQuizAttempt,
} from "@/modules/courses/services/quiz.service";
import type { LmsQuiz, LmsQuizAttempt, LmsQuizQuestion, LmsEnrollment } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type QuizPhase = "loading" | "pre-quiz" | "in-progress" | "results";

type AnswerMap = Record<string, { selected_choice_id?: string; text_answer?: string }>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface QuizPlayerProps {
  quiz: LmsQuiz;
  enrollment: LmsEnrollment;
  studentId: string;
  instituteId: string;
  onComplete: (attempt: LmsQuizAttempt) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function QuizPlayer({
  quiz,
  enrollment,
  studentId,
  instituteId,
  onComplete,
}: QuizPlayerProps) {
  const questions = quiz.questions ?? [];

  // ── State ────────────────────────────────────────────────────────────────

  const [phase, setPhase] = useState<QuizPhase>("loading");
  const [pastAttempts, setPastAttempts] = useState<LmsQuizAttempt[]>([]);
  const [currentAttempt, setCurrentAttempt] = useState<LmsQuizAttempt | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [resultAttempt, setResultAttempt] = useState<LmsQuizAttempt | null>(null);

  // Timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load past attempts on mount ──────────────────────────────────────────

  useEffect(() => {
    void (async () => {
      const res = await getQuizAttempts(quiz.id, enrollment.id);
      if (res.success) {
        setPastAttempts(res.data ?? []);
      }
      setPhase("pre-quiz");
    })();
  }, [quiz.id, enrollment.id]);

  // ── Timer management ─────────────────────────────────────────────────────

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(
    (seconds: number) => {
      stopTimer();
      setTimeLeft(seconds);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev === null || prev <= 1) {
            stopTimer();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [stopTimer],
  );

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  // Auto-submit when timer reaches 0
  useEffect(() => {
    if (timeLeft === 0 && phase === "in-progress") {
      toast.warning("Time's up! Submitting your answers…");
      void handleSubmit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase]);

  // ── Start quiz ───────────────────────────────────────────────────────────

  const handleStart = async () => {
    const attemptsUsed = pastAttempts.filter((a) => a.status !== "in_progress").length;
    if (attemptsUsed >= quiz.max_attempts) {
      toast.error(`You've used all ${quiz.max_attempts} attempt(s).`);
      return;
    }

    const attemptNo = attemptsUsed + 1;

    const res = await startQuizAttempt(quiz.id, enrollment.id, studentId, instituteId, attemptNo);

    if (!res.success || !res.data) {
      toast.error(res.error ?? "Failed to start quiz");
      return;
    }

    setCurrentAttempt(res.data);
    setAnswers({});
    setCurrentIndex(0);

    if (quiz.time_limit_mins) {
      startTimer(quiz.time_limit_mins * 60);
    }

    setPhase("in-progress");
  };

  // ── Submit quiz ──────────────────────────────────────────────────────────

  const handleSubmit = async (autoSubmit = false) => {
    if (!currentAttempt || submitting) return;

    if (!autoSubmit && Object.keys(answers).length < questions.length) {
      const unanswered = questions.length - Object.keys(answers).length;
      toast.warning(`You have ${unanswered} unanswered question(s). Submit anyway?`, {
        action: {
          label: "Submit",
          onClick: () => void handleSubmit(true),
        },
      });
      return;
    }

    setSubmitting(true);
    stopTimer();

    const answerList = questions.map((q) => ({
      question_id: q.id,
      selected_choice_id: answers[q.id]?.selected_choice_id,
      text_answer: answers[q.id]?.text_answer,
    }));

    const res = await submitQuizAttempt({
      quiz_id: quiz.id,
      attempt_id: currentAttempt.id,
      enrollment_id: enrollment.id,
      answers: answerList,
    });

    setSubmitting(false);

    if (!res.success || !res.data) {
      toast.error(res.error ?? "Failed to submit quiz");
      return;
    }

    setResultAttempt(res.data);
    setPastAttempts((prev) => [res.data!, ...prev]);
    setPhase("results");
    onComplete(res.data);
  };

  // ── Answer recording ─────────────────────────────────────────────────────

  const setAnswer = (
    questionId: string,
    value: { selected_choice_id?: string; text_answer?: string },
  ) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  // ── Navigation ───────────────────────────────────────────────────────────

  const goTo = (index: number) => {
    setCurrentIndex(Math.min(Math.max(index, 0), questions.length - 1));
  };

  // ════════════════════════════════════════════════════════════════════════════
  // ── Render: Loading
  // ════════════════════════════════════════════════════════════════════════════

  if (phase === "loading") {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ── Render: Pre-quiz info screen
  // ════════════════════════════════════════════════════════════════════════════

  if (phase === "pre-quiz") {
    const attemptsUsed = pastAttempts.filter((a) => a.status !== "in_progress").length;
    const attemptsLeft = Math.max(0, quiz.max_attempts - attemptsUsed);
    const canAttempt = attemptsLeft > 0;
    const bestAttempt = [...pastAttempts]
      .filter((a) => a.status === "submitted" || a.status === "graded")
      .sort((a, b) => b.percentage - a.percentage)[0];

    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        {/* Title */}
        <div className="flex items-start gap-3">
          <HelpCircle className="mt-1 size-6 shrink-0 text-primary" />
          <div>
            <h2 className="text-xl font-semibold text-foreground">{quiz.title}</h2>
            {quiz.description && (
              <p className="mt-1 text-sm text-muted-foreground">{quiz.description}</p>
            )}
          </div>
        </div>

        {/* Quiz info grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <InfoCard label="Questions" value={String(questions.length)} />
          <InfoCard label="Pass score" value={`${quiz.passing_score}%`} />
          <InfoCard
            label="Time limit"
            value={quiz.time_limit_mins ? `${quiz.time_limit_mins} min` : "Untimed"}
          />
          <InfoCard label="Attempts left" value={`${attemptsLeft} / ${quiz.max_attempts}`} />
        </div>

        {/* Best score */}
        {bestAttempt && (
          <Card
            className={cn(
              "border",
              bestAttempt.passed
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-rose-500/30 bg-rose-500/5",
            )}
          >
            <CardContent className="flex items-center gap-3 p-4">
              {bestAttempt.passed ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="size-5 shrink-0 text-rose-500" />
              )}
              <div>
                <p className="text-sm font-medium">
                  Best attempt: {bestAttempt.percentage.toFixed(1)}%
                  {bestAttempt.passed ? " — Passed" : " — Failed"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Attempt #{bestAttempt.attempt_no} &bull;{" "}
                  {new Date(bestAttempt.started_at).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Start button */}
        <Button
          onClick={() => void handleStart()}
          disabled={!canAttempt}
          size="lg"
          className="w-full gap-2"
        >
          <HelpCircle className="size-5" />
          {canAttempt
            ? `Start Quiz (Attempt ${attemptsUsed + 1} of ${quiz.max_attempts})`
            : "No attempts remaining"}
        </Button>

        {!canAttempt && (
          <p className="text-center text-sm text-muted-foreground">
            You've used all available attempts for this quiz.
          </p>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ── Render: In-progress
  // ════════════════════════════════════════════════════════════════════════════

  if (phase === "in-progress") {
    const question = questions[currentIndex];
    if (!question) return null;
    const answeredCount = Object.keys(answers).length;
    const progressPct = (answeredCount / questions.length) * 100;

    return (
      <div className="flex h-full flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">
            Question {currentIndex + 1} of {questions.length}
          </span>

          <div className="flex items-center gap-3">
            {/* Timer */}
            {timeLeft !== null && (
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium tabular-nums",
                  timeLeft <= 60
                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    : "bg-muted text-foreground",
                )}
              >
                <Clock className="size-4" />
                {formatMmSs(timeLeft)}
              </div>
            )}

            {/* Submit */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              Submit Quiz
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <Progress value={progressPct} className="h-1 rounded-none" />

        {/* Question dots navigation */}
        <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-3">
          {questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => goTo(i)}
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
                i === currentIndex
                  ? "bg-primary text-primary-foreground"
                  : answers[q.id]
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground hover:bg-accent",
              )}
              aria-label={`Go to question ${i + 1}`}
              aria-current={i === currentIndex ? "step" : undefined}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {/* Question body */}
        <div className="flex-1 overflow-y-auto">
          <QuestionCard
            question={question}
            answer={answers[question.id]}
            onAnswer={(val) => setAnswer(question.id, val)}
          />
        </div>

        {/* Prev / Next navigation */}
        <div className="flex items-center justify-between border-t border-border p-4">
          <Button
            variant="outline"
            onClick={() => goTo(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="gap-2"
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>

          {currentIndex < questions.length - 1 ? (
            <Button onClick={() => goTo(currentIndex + 1)} className="gap-2">
              Next
              <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={() => void handleSubmit()} disabled={submitting} className="gap-2">
              {submitting ? (
                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Submit Quiz
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ── Render: Results
  // ════════════════════════════════════════════════════════════════════════════

  if (phase === "results" && resultAttempt) {
    const passed = resultAttempt.passed;
    const attemptsUsed = pastAttempts.filter((a) => a.status !== "in_progress").length;
    const canRetake = attemptsUsed < quiz.max_attempts;

    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        {/* Score display */}
        <div
          className={cn(
            "flex flex-col items-center rounded-2xl p-8 text-center",
            passed
              ? "bg-emerald-500/10 border border-emerald-500/20"
              : "bg-rose-500/10 border border-rose-500/20",
          )}
        >
          {passed ? (
            <CheckCircle2 className="size-14 text-emerald-500" />
          ) : (
            <XCircle className="size-14 text-rose-500" />
          )}
          <p
            className={cn(
              "mt-4 text-5xl font-bold tabular-nums",
              passed
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400",
            )}
          >
            {resultAttempt.percentage.toFixed(1)}%
          </p>
          <p className="mt-2 text-xl font-semibold text-foreground">
            {passed ? "Congratulations, you passed!" : "Better luck next time"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {resultAttempt.score} / {resultAttempt.max_score} points &bull; Pass mark:{" "}
            {quiz.passing_score}%
          </p>

          {/* Passing score indicator */}
          <div className="mt-4 w-full">
            <Progress value={resultAttempt.percentage} className="h-2" />
          </div>
        </div>

        {/* Per-question review (only if show_answers is enabled) */}
        {quiz.show_answers && questions.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Question Review
            </h3>
            {questions.map((question, i) => {
              const attemptAnswer = resultAttempt.answers?.find(
                (a) => a.question_id === question.id,
              );
              const isCorrect = attemptAnswer?.is_correct ?? false;
              const selectedChoiceId = attemptAnswer?.selected_choice_id;

              return (
                <Card
                  key={question.id}
                  className={cn(
                    "border",
                    isCorrect ? "border-emerald-500/30" : "border-rose-500/30",
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      {isCorrect ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      ) : (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          Q{i + 1}. {question.question}
                        </p>

                        {/* Choices review */}
                        {question.choices && question.choices.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {question.choices.map((choice) => {
                              const wasSelected = choice.id === selectedChoiceId;
                              return (
                                <li
                                  key={choice.id}
                                  className={cn(
                                    "flex items-center gap-2 rounded px-2 py-1 text-xs",
                                    choice.is_correct &&
                                      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium",
                                    wasSelected &&
                                      !choice.is_correct &&
                                      "bg-rose-500/10 text-rose-700 dark:text-rose-400",
                                  )}
                                >
                                  <span className="shrink-0">
                                    {choice.is_correct ? "✓" : wasSelected ? "✗" : "○"}
                                  </span>
                                  {choice.choice_text}
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        {/* Text answer */}
                        {attemptAnswer?.text_answer && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Your answer: {attemptAnswer.text_answer}
                          </p>
                        )}

                        {/* Explanation */}
                        {!isCorrect && question.explanation && (
                          <div className="mt-2 rounded bg-muted/50 p-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Explanation: </span>
                            {question.explanation}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {attemptAnswer?.points_earned ?? 0}/{question.points}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {canRetake && (
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => {
                setResultAttempt(null);
                setAnswers({});
                setCurrentIndex(0);
                setPhase("pre-quiz");
              }}
            >
              <RotateCcw className="size-4" />
              Retake Quiz
            </Button>
          )}
          <Button className="flex-1 gap-2" onClick={() => onComplete(resultAttempt)}>
            <Award className="size-4" />
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

// ── QuestionCard sub-component ────────────────────────────────────────────────

interface QuestionCardProps {
  question: LmsQuizQuestion;
  answer?: { selected_choice_id?: string; text_answer?: string };
  onAnswer: (val: { selected_choice_id?: string; text_answer?: string }) => void;
}

function QuestionCard({ question, answer, onAnswer }: QuestionCardProps) {
  return (
    <div className="p-6">
      <p className="text-base font-semibold leading-relaxed text-foreground">{question.question}</p>
      <Badge variant="outline" className="mt-2 text-xs capitalize">
        {question.question_type === "true_false"
          ? "True / False"
          : question.question_type === "short_answer"
            ? "Short Answer"
            : "Multiple Choice"}
      </Badge>

      <div className="mt-4">
        {/* MCQ / True-False */}
        {(question.question_type === "mcq" || question.question_type === "true_false") &&
          question.choices && (
            <RadioGroup
              value={answer?.selected_choice_id ?? ""}
              onValueChange={(val) => onAnswer({ selected_choice_id: val })}
              className="space-y-2.5"
            >
              {question.choices.map((choice) => (
                <div
                  key={choice.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3.5 transition-colors",
                    "hover:bg-accent/50",
                    answer?.selected_choice_id === choice.id && "border-primary/50 bg-primary/5",
                  )}
                  onClick={() => onAnswer({ selected_choice_id: choice.id })}
                >
                  <RadioGroupItem value={choice.id} id={choice.id} />
                  <Label htmlFor={choice.id} className="flex-1 cursor-pointer text-sm font-normal">
                    {choice.choice_text}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}

        {/* Short answer */}
        {question.question_type === "short_answer" && (
          <Textarea
            value={answer?.text_answer ?? ""}
            onChange={(e) => onAnswer({ text_answer: e.target.value })}
            placeholder="Type your answer here…"
            className="min-h-28 resize-y"
          />
        )}
      </div>

      {/* Points */}
      <p className="mt-4 text-right text-xs text-muted-foreground">
        {question.points} {question.points === 1 ? "point" : "points"}
      </p>
    </div>
  );
}

// ── InfoCard sub-component ────────────────────────────────────────────────────

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-muted/30 p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
