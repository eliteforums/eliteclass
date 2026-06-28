// ---------------------------------------------------------------------------
// ExamReviewView — question-by-question review of a submitted MCQ attempt
// ---------------------------------------------------------------------------
//
// Renders the student's most recent submitted attempt with:
//   - Per-question student selection
//   - Whether each was correct / wrong / unanswered
//   - The correct option highlighted
//   - Explanation if present
//
// Mounted by the attempt route when the latest attempt is already submitted.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Loader2,
  Trophy,
  AlertCircle,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type {
  Exam,
  ExamAttempt,
  ExamAnswer,
  ExamQuestion,
  ExamOption,
} from "@/modules/exams/types";

interface ExamReviewViewProps {
  examId: string;
  attempt: ExamAttempt;
}

type ReviewQuestion = ExamQuestion & {
  options: ExamOption[];
  selected_option_id: string | null;
  is_correct: boolean;
  is_unanswered: boolean;
};

export function ExamReviewView({ examId, attempt }: ExamReviewViewProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  void user;
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!supabase) {
        setError("Supabase not configured");
        setIsLoading(false);
        return;
      }

      try {
        const [examRes, answersRes] = await Promise.all([
          supabase
            .from("exams")
            .select(
              `
              *,
              questions:exam_questions(
                *,
                options:exam_options(*)
              )
              `,
            )
            .eq("id", examId)
            .single(),
          supabase
            .from("exam_answers")
            .select("*")
            .eq("attempt_id", attempt.id),
        ]);

        if (cancelled) return;

        if (examRes.error) {
          setError(examRes.error.message);
          setIsLoading(false);
          return;
        }
        if (answersRes.error) {
          setError(answersRes.error.message);
          setIsLoading(false);
          return;
        }

        const examData = examRes.data as Exam & { questions: (ExamQuestion & { options: ExamOption[] })[] };
        const answers = (answersRes.data ?? []) as ExamAnswer[];

        // Order questions by position then enrich each with the student's selection
        const orderedQuestions = [...(examData.questions ?? [])].sort(
          (a, b) => (a.position ?? 0) - (b.position ?? 0),
        );

        const reviewed: ReviewQuestion[] = orderedQuestions.map((q) => {
          const answer = answers.find((a) => a.question_id === q.id);
          const correctOption = (q.options ?? []).find((o) => o.is_correct);
          const isCorrect =
            !!answer?.selected_option_id &&
            !!correctOption &&
            answer.selected_option_id === correctOption.id;
          return {
            ...q,
            options: [...(q.options ?? [])].sort(
              (a, b) => (a.position ?? 0) - (b.position ?? 0),
            ),
            selected_option_id: answer?.selected_option_id ?? null,
            is_correct: isCorrect,
            is_unanswered: !answer?.selected_option_id,
          };
        });

        setExam(examData);
        setQuestions(reviewed);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load review");
        setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [examId, attempt.id]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{error ?? "Failed to load exam review"}</p>
        <Button onClick={() => navigate({ to: "/dashboard/student/exams" })}>
          Back to Exams
        </Button>
      </div>
    );
  }

  const totalQuestions = questions.length;
  const correctCount = questions.filter((q) => q.is_correct).length;
  const wrongCount = questions.filter(
    (q) => !q.is_unanswered && !q.is_correct,
  ).length;
  const unansweredCount = questions.filter((q) => q.is_unanswered).length;
  const percentage = exam.total_marks > 0 ? (attempt.score / exam.total_marks) * 100 : 0;
  const passed = percentage >= exam.passing_marks;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: "/dashboard/student/exams" })}
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Exam Review</p>
              <h1 className="font-bold text-lg truncate">{exam.title}</h1>
            </div>
          </div>
          <Badge variant={passed ? "default" : "destructive"} className="shrink-0">
            {passed ? "Passed" : "Not Passed"}
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-6">
        {/* Score summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              Your Result
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat
                label="Score"
                value={`${attempt.score} / ${exam.total_marks}`}
                tone="primary"
              />
              <Stat
                label="Percentage"
                value={`${percentage.toFixed(1)}%`}
                tone={passed ? "success" : "danger"}
              />
              <Stat
                label="Correct"
                value={`${correctCount} / ${totalQuestions}`}
                tone="success"
              />
              <Stat
                label="Wrong / Skipped"
                value={`${wrongCount} / ${unansweredCount}`}
                tone="muted"
              />
            </div>
          </CardContent>
        </Card>

        {/* Questions */}
        {questions.map((q, idx) => (
          <Card
            key={q.id}
            className={cn(
              "border-l-4",
              q.is_unanswered
                ? "border-l-muted-foreground/40"
                : q.is_correct
                  ? "border-l-green-500"
                  : "border-l-red-500",
            )}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-sm font-semibold flex-1">
                  <span className="text-xs text-muted-foreground mr-2">Q{idx + 1}</span>
                  {q.question_text}
                </CardTitle>
                <StatusBadge
                  status={
                    q.is_unanswered
                      ? "unanswered"
                      : q.is_correct
                        ? "correct"
                        : "wrong"
                  }
                  marks={q.marks}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {q.options.map((opt, optIdx) => {
                const isCorrectOption = opt.is_correct;
                const isStudentChoice = opt.id === q.selected_option_id;

                let toneClass =
                  "border-border bg-background text-foreground";
                let icon: React.ReactNode = null;
                let suffix: React.ReactNode = null;

                if (isCorrectOption) {
                  toneClass =
                    "border-green-300 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-200 dark:border-green-800";
                  icon = <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />;
                  suffix = (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 dark:text-green-300">
                      Correct answer
                    </span>
                  );
                }
                if (isStudentChoice && !isCorrectOption) {
                  toneClass =
                    "border-red-300 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200 dark:border-red-800";
                  icon = <XCircle className="h-4 w-4 text-red-600 shrink-0" />;
                  suffix = (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                      Your answer
                    </span>
                  );
                }
                if (isStudentChoice && isCorrectOption) {
                  suffix = (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 dark:text-green-300">
                      Your answer · Correct
                    </span>
                  );
                }

                return (
                  <div
                    key={opt.id}
                    className={cn(
                      "flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm",
                      toneClass,
                    )}
                  >
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs font-semibold opacity-60">
                        {String.fromCharCode(65 + optIdx)}.
                      </span>
                      {icon}
                    </div>
                    <span className="flex-1 break-words">{opt.option_text}</span>
                    {suffix}
                  </div>
                );
              })}

              {q.is_unanswered && (
                <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
                  <MinusCircle className="h-3.5 w-3.5" />
                  You didn't answer this question.
                </div>
              )}

              {q.explanation && (
                <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">
                    Explanation
                  </p>
                  <p className="text-sm text-foreground/90">{q.explanation}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        <div className="flex justify-center pb-12">
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/dashboard/student/exams" })}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Exams
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "success" | "danger" | "muted";
}) {
  const colors = {
    primary: "text-primary",
    success: "text-green-600",
    danger: "text-red-600",
    muted: "text-muted-foreground",
  };
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
        {label}
      </p>
      <p className={cn("text-xl font-black mt-1", colors[tone])}>{value}</p>
    </div>
  );
}

function StatusBadge({
  status,
  marks,
}: {
  status: "correct" | "wrong" | "unanswered";
  marks: number;
}) {
  if (status === "correct") {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-950 dark:text-green-200">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        +{marks}
      </Badge>
    );
  }
  if (status === "wrong") {
    return (
      <Badge variant="destructive">
        <XCircle className="mr-1 h-3 w-3" />
        Wrong
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <MinusCircle className="mr-1 h-3 w-3" />
      Skipped
    </Badge>
  );
}
