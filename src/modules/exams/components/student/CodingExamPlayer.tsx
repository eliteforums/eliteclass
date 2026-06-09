import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Clock,
  Send,
  AlertTriangle,
  Code2,
  Play,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Info,
  BookOpen,
  Lightbulb,
  FlaskConical,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "@tanstack/react-router";
import { CodeEditor } from "../shared/CodeEditor";
import { useRealtimeExamTimer } from "../../hooks/useRealtimeExamTimer";
import { generateBrowserFingerprint, getOrCreateDeviceId } from "../../utils/exam-security";
import {
  getExamDetail,
  startExamAttempt,
  validateExamTiming,
  validateSingleAttempt,
  createExamSession,
  lockExamAttempt,
  updateAttemptActivity,
  runVisibleTests,
  submitCodingAnswer,
  getCodingSubmissions,
  submitCodingExamAttempt,
} from "../../services/exam.service";
import type { Exam, ExamAttempt, ExamQuestion, CodingLanguage, TestResult } from "../../types";

interface CodingExamPlayerProps {
  examId: string;
}

type QuestionStatus = "not_started" | "in_progress" | "submitted_full" | "submitted_partial";

const LANGUAGE_LABELS: Record<CodingLanguage, string> = {
  python: "Python 3",
  javascript: "JavaScript (Node)",
  java: "Java",
  cpp: "C++",
  c: "C",
};

const DEFAULT_CODE: Record<CodingLanguage, string> = {
  python: "# Write your solution here\n\n",
  javascript: "// Write your solution here\n\n",
  java: "import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // your code here\n    }\n}\n",
  cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // your code here\n    return 0;\n}\n",
  c: "#include <stdio.h>\n\nint main() {\n    // your code here\n    return 0;\n}\n",
};

function getQuestionStatus(
  questionId: string,
  submissionMap: Map<string, { passed_tests: number; total_tests: number }>,
  codes: Map<string, Map<string, string>>,
): QuestionStatus {
  const sub = submissionMap.get(questionId);
  if (sub) {
    return sub.passed_tests === sub.total_tests ? "submitted_full" : "submitted_partial";
  }
  const qCodes = codes.get(questionId);
  if (qCodes && [...qCodes.values()].some((c) => c.trim())) return "in_progress";
  return "not_started";
}

export function CodingExamPlayer({ examId }: CodingExamPlayerProps) {
  const { user, institute } = useAuth();
  const navigate = useNavigate();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [exam, setExam] = useState<Exam | null>(null);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [isSubmittingExam, setIsSubmittingExam] = useState(false);
  const submissionLockRef = useRef(false);

  // ── Per-question state ───────────────────────────────────────────────────────
  const [language, setLanguage] = useState<CodingLanguage>("python");
  // codes: questionId → languageId → code
  const [codes, setCodes] = useState<Map<string, Map<string, string>>>(new Map());
  // submissionResults: questionId → submission result
  const [submissionMap, setSubmissionMap] = useState<
    Map<string, { passed_tests: number; total_tests: number; score: number; status: string }>
  >(new Map());
  // run results for currently visible test run
  const [runResults, setRunResults] = useState<Array<{
    passed: boolean;
    input: string;
    expected_output: string;
    actual_output: string;
    stderr: string;
  }> | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmittingQ, setIsSubmittingQ] = useState(false);

  // ── Timer ────────────────────────────────────────────────────────────────────
  const { timeRemaining, isExpired } = useRealtimeExamTimer({
    examId,
    attemptId: attempt?.id || "",
    durationMs: (exam?.duration_mins || 60) * 60 * 1000,
    enabled: !!attempt && attempt.status === "in_progress",
    onTimeUpdate: (s) => setTimeLeft(s),
    onTimeExpired: () => {
      toast.error("Time is up! Auto-submitting...");
      executeSubmit(true);
    },
  });

  // ── Activity heartbeat ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!attempt) return;
    const interval = setInterval(() => updateAttemptActivity(attempt.id), 60000);
    return () => clearInterval(interval);
  }, [attempt?.id]);

  // ── Initialization ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || !institute?.id) return;

    const init = async () => {
      setIsLoading(true);

      const timingRes = await validateExamTiming(examId);
      if (!timingRes.success || !timingRes.data?.isAvailable) {
        toast.error(timingRes.data?.reason || "Exam not available");
        navigate({ to: "/dashboard/student/exams" });
        setIsLoading(false);
        return;
      }

      const singleRes = await validateSingleAttempt(examId, user.id);
      if (!singleRes.success || !singleRes.data?.canAttempt) {
        toast.error(singleRes.data?.reason || "Cannot attempt this test");
        navigate({ to: "/dashboard/student/exams" });
        setIsLoading(false);
        return;
      }

      const [examRes, attemptRes] = await Promise.all([
        getExamDetail(examId),
        startExamAttempt(examId, user.id, institute.id),
      ]);

      if (!examRes.success || !examRes.data || !attemptRes.success || !attemptRes.data) {
        toast.error("Failed to load exam. Please try again.");
        navigate({ to: "/dashboard/student/exams" });
        setIsLoading(false);
        return;
      }

      const newAttempt = attemptRes.data;

      if (newAttempt.is_locked || newAttempt.status !== "in_progress") {
        toast.info("Test already submitted");
        navigate({ to: "/dashboard/student/exams" });
        setIsLoading(false);
        return;
      }

      setExam(examRes.data);
      setAttempt(newAttempt);

      // Create session
      const fingerprint = generateBrowserFingerprint();
      const deviceId = getOrCreateDeviceId();
      await createExamSession(newAttempt.id, newAttempt.student_id, examId, institute.id, {
        browserFingerprint: fingerprint,
        deviceId,
        userAgent: navigator.userAgent,
      });

      // Restore existing coding submissions
      const { data: existingSubs } = await getCodingSubmissions(newAttempt.id);
      if (existingSubs?.length) {
        const subMap = new Map(
          existingSubs.map((s) => [
            s.question_id,
            {
              passed_tests: s.passed_tests,
              total_tests: s.total_tests,
              score: s.score,
              status: s.status,
            },
          ]),
        );
        setSubmissionMap(subMap);

        // Restore code from submissions
        const restoredCodes = new Map<string, Map<string, string>>();
        for (const sub of existingSubs) {
          const qMap = restoredCodes.get(sub.question_id) ?? new Map<string, string>();
          qMap.set(sub.language, sub.code);
          restoredCodes.set(sub.question_id, qMap);
        }
        setCodes(restoredCodes);
      }

      setTimeLeft((examRes.data.duration_mins || 60) * 60);
      setIsLoading(false);
    };

    init();
  }, [examId, user?.id, institute?.id]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const currentQuestion = exam?.questions?.[currentQuestionIdx] as
    | (ExamQuestion & {
        problem_statement?: string | null;
        constraints_text?: string | null;
        examples?: Array<{ input: string; output: string; explanation?: string }> | null;
        test_cases?: Array<{ input: string; expected_output: string; is_hidden: boolean }> | null;
        starter_code?: Record<string, string> | null;
      })
    | undefined;

  const currentCode = currentQuestion
    ? (codes.get(currentQuestion.id)?.get(language) ??
      currentQuestion.starter_code?.[language] ??
      DEFAULT_CODE[language])
    : DEFAULT_CODE[language];

  const setCurrentCode = useCallback(
    (code: string) => {
      if (!currentQuestion) return;
      setCodes((prev) => {
        const next = new Map(prev);
        const qMap = new Map(next.get(currentQuestion.id) ?? []);
        qMap.set(language, code);
        next.set(currentQuestion.id, qMap);
        return next;
      });
      setRunResults(null);
    },
    [currentQuestion?.id, language],
  );

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Run visible tests ────────────────────────────────────────────────────────
  const handleRun = async () => {
    if (!currentQuestion || !attempt) return;
    const visibleTests = (currentQuestion.test_cases ?? []).filter((tc) => !tc.is_hidden);
    if (visibleTests.length === 0) {
      toast.info(
        "No visible test cases to run. Your code will be evaluated against hidden tests on submit.",
      );
      return;
    }
    setIsRunning(true);
    setRunResults(null);
    try {
      const results = await runVisibleTests(
        language,
        currentCode,
        currentQuestion.test_cases ?? [],
      );
      setRunResults(results);
      const passedCount = results.filter((r) => r.passed).length;
      if (passedCount === results.length) {
        toast.success(`All ${results.length} visible tests passed! ✅`);
      } else {
        toast.warning(`${passedCount}/${results.length} visible tests passed.`);
      }
    } catch (err) {
      toast.error("Failed to run code. Check your code and try again.");
    } finally {
      setIsRunning(false);
    }
  };

  // ── Submit individual question ───────────────────────────────────────────────
  const handleSubmitQuestion = async () => {
    if (!currentQuestion || !attempt || !user?.id || !institute?.id) return;
    const testCases = currentQuestion.test_cases ?? [];
    if (testCases.length === 0) {
      toast.error("This question has no test cases. Contact your instructor.");
      return;
    }
    setIsSubmittingQ(true);
    try {
      const { success, data, error } = await submitCodingAnswer(
        attempt.id,
        currentQuestion.id,
        attempt.student_id,
        institute.id,
        language,
        currentCode,
        testCases,
        currentQuestion.marks,
      );
      if (success && data) {
        setSubmissionMap((prev) => {
          const next = new Map(prev);
          next.set(currentQuestion.id, data);
          return next;
        });
        if (data.status === "accepted") {
          toast.success(`All ${data.total_tests} test cases passed! 🎉`);
        } else {
          toast.warning(`${data.passed_tests}/${data.total_tests} test cases passed.`);
        }
      } else {
        toast.error(error || "Failed to submit. Try again.");
      }
    } catch (err) {
      toast.error("Submission failed. Check your connection.");
    } finally {
      setIsSubmittingQ(false);
    }
  };

  // ── Submit entire exam ───────────────────────────────────────────────────────
  const executeSubmit = async (isAuto = false) => {
    if (!attempt || isSubmittingExam) return;
    submissionLockRef.current = true;
    setIsSubmitDialogOpen(false);
    setIsSubmittingExam(true);
    try {
      if (isAuto) toast.info("Auto-submitting your exam...");
      await lockExamAttempt(attempt.id);
      const { success, error } = await submitCodingExamAttempt(attempt.id, {
        autoSubmitReason: isAuto ? "time_expired" : null,
      });
      if (success) {
        toast.success("Exam submitted successfully!");
        navigate({ to: "/dashboard/student/exams" });
      } else {
        toast.error(error || "Failed to submit exam.");
      }
    } catch (err) {
      toast.error("Error during submission.");
    } finally {
      submissionLockRef.current = false;
      setIsSubmittingExam(false);
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────────
  if (isLoading || !exam || !attempt) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalQuestions = exam.questions?.length ?? 0;
  const submittedCount = submissionMap.size;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Code2 className="h-5 w-5 text-violet-600" />
          <h1 className="font-bold text-sm truncate max-w-[200px] sm:max-w-xs">{exam.title}</h1>
          <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">
            {submittedCount}/{totalQuestions} Solved
          </Badge>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-full font-mono text-base font-bold border",
            timeLeft < 300
              ? "bg-red-50 text-red-600 border-red-200 animate-pulse"
              : "bg-primary/5 text-primary border-primary/20",
          )}
        >
          <Clock className="h-4 w-4" />
          {formatTime(timeLeft)}
        </div>

        <Button
          onClick={() => setIsSubmitDialogOpen(true)}
          disabled={isSubmittingExam}
          className="bg-green-600 hover:bg-green-700 h-9"
          size="sm"
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          Submit All
        </Button>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-16 sm:w-20 border-r border-border bg-card flex flex-col items-center py-3 gap-2 overflow-y-auto shrink-0">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
            Problems
          </p>
          {exam.questions?.map((q, idx) => {
            const status = getQuestionStatus(q.id, submissionMap, codes);
            const isCurrent = idx === currentQuestionIdx;
            return (
              <button
                key={q.id}
                onClick={() => {
                  setCurrentQuestionIdx(idx);
                  setRunResults(null);
                }}
                title={`Problem ${idx + 1}`}
                className={cn(
                  "w-10 h-10 rounded-lg text-xs font-bold border-2 flex flex-col items-center justify-center transition-all",
                  isCurrent
                    ? "border-violet-500 bg-violet-100 text-violet-700 scale-110 dark:bg-violet-900"
                    : status === "submitted_full"
                      ? "border-green-400 bg-green-50 text-green-700 dark:bg-green-950/40"
                      : status === "submitted_partial"
                        ? "border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40"
                        : status === "in_progress"
                          ? "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/40"
                          : "border-border hover:border-violet-300",
                )}
              >
                {idx + 1}
                {status === "submitted_full" && (
                  <CheckCircle2 className="h-2.5 w-2.5 mt-0.5 text-green-600" />
                )}
              </button>
            );
          })}
        </aside>

        {/* Main area — two-column split */}
        {currentQuestion ? (
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Problem statement */}
            <div className="w-2/5 min-w-0 border-r border-border flex flex-col overflow-hidden">
              <Tabs defaultValue="problem" className="flex flex-col h-full">
                <TabsList className="shrink-0 rounded-none border-b border-border justify-start h-9 px-3 gap-1">
                  <TabsTrigger value="problem" className="text-xs h-7">
                    <BookOpen className="h-3 w-3 mr-1" /> Problem
                  </TabsTrigger>
                  {(currentQuestion.examples?.length ?? 0) > 0 && (
                    <TabsTrigger value="examples" className="text-xs h-7">
                      <Lightbulb className="h-3 w-3 mr-1" /> Examples
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="testcases" className="text-xs h-7">
                    <FlaskConical className="h-3 w-3 mr-1" /> Test Cases
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  value="problem"
                  className="flex-1 overflow-y-auto m-0 p-4 text-sm space-y-4"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-base">
                      {currentQuestionIdx + 1}. {currentQuestion.question_text}
                    </h2>
                    <Badge variant="secondary">{currentQuestion.marks} pts</Badge>
                  </div>
                  {currentQuestion.problem_statement && (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-foreground whitespace-pre-wrap leading-relaxed">
                      {currentQuestion.problem_statement}
                    </div>
                  )}
                  {currentQuestion.constraints_text && (
                    <div className="p-3 rounded-lg bg-muted/50 border text-xs">
                      <p className="font-bold text-muted-foreground uppercase tracking-wider text-[10px] mb-1">
                        Constraints
                      </p>
                      <pre className="whitespace-pre-wrap font-mono">
                        {currentQuestion.constraints_text}
                      </pre>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="examples" className="flex-1 overflow-y-auto m-0 p-4 space-y-4">
                  {currentQuestion.examples?.map((ex, i) => (
                    <div key={i} className="space-y-2">
                      <p className="text-xs font-bold text-muted-foreground">Example {i + 1}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded bg-muted/50 border">
                          <p className="text-[10px] text-muted-foreground font-bold mb-1">INPUT</p>
                          <pre className="text-xs font-mono whitespace-pre-wrap">{ex.input}</pre>
                        </div>
                        <div className="p-2 rounded bg-muted/50 border">
                          <p className="text-[10px] text-muted-foreground font-bold mb-1">OUTPUT</p>
                          <pre className="text-xs font-mono whitespace-pre-wrap">{ex.output}</pre>
                        </div>
                      </div>
                      {ex.explanation && (
                        <p className="text-xs text-muted-foreground italic">{ex.explanation}</p>
                      )}
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="testcases" className="flex-1 overflow-y-auto m-0 p-4 space-y-3">
                  {(currentQuestion.test_cases ?? [])
                    .filter((tc) => !tc.is_hidden)
                    .map((tc, i) => (
                      <div key={i} className="p-3 rounded-lg border bg-muted/30 text-xs space-y-2">
                        <p className="font-bold">Visible Test Case {i + 1}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-muted-foreground text-[10px] font-bold">INPUT</p>
                            <pre className="font-mono mt-0.5 whitespace-pre-wrap">{tc.input}</pre>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] font-bold">
                              EXPECTED OUTPUT
                            </p>
                            <pre className="font-mono mt-0.5 whitespace-pre-wrap">
                              {tc.expected_output}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  {(currentQuestion.test_cases ?? []).filter((tc) => tc.is_hidden).length > 0 && (
                    <p className="text-xs text-muted-foreground italic px-1">
                      + {(currentQuestion.test_cases ?? []).filter((tc) => tc.is_hidden).length}{" "}
                      hidden test case(s) — will be checked on submit.
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            {/* Right: Code editor + run/submit */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Editor toolbar */}
              <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
                <Select
                  value={language}
                  onValueChange={(v) => {
                    setLanguage(v as CodingLanguage);
                    setRunResults(null);
                  }}
                >
                  <SelectTrigger className="h-7 w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(LANGUAGE_LABELS) as [CodingLanguage, string][]).map(
                      ([key, label]) => (
                        <SelectItem key={key} value={key} className="text-xs">
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>

                <button
                  onClick={() => {
                    const starter =
                      currentQuestion.starter_code?.[language] ?? DEFAULT_CODE[language];
                    setCurrentCode(starter);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors"
                  title="Reset to starter code"
                >
                  <RefreshCw className="h-3 w-3" /> Reset
                </button>
              </div>

              {/* Monaco editor */}
              <div className="flex-1 min-h-0">
                <CodeEditor
                  value={currentCode}
                  onChange={setCurrentCode}
                  language={language}
                  height="100%"
                />
              </div>

              {/* Run/submit bar */}
              <div className="shrink-0 border-t border-border px-3 py-2 flex items-center justify-between gap-2 bg-card">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRun}
                  disabled={isRunning || isSubmittingQ}
                  className="h-8 text-xs gap-1.5"
                >
                  {isRunning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {isRunning ? "Running..." : "Run Tests"}
                </Button>

                <Button
                  size="sm"
                  onClick={handleSubmitQuestion}
                  disabled={isRunning || isSubmittingQ}
                  className="h-8 text-xs bg-violet-600 hover:bg-violet-700 gap-1.5"
                >
                  {isSubmittingQ ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {isSubmittingQ ? "Submitting..." : "Submit Problem"}
                </Button>
              </div>

              {/* Test results panel */}
              {runResults && (
                <div className="shrink-0 max-h-48 overflow-y-auto border-t border-border bg-zinc-950 text-xs font-mono">
                  <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
                    <Terminal className="h-3 w-3 text-zinc-400" />
                    <span className="text-zinc-300 font-sans font-medium text-[11px]">
                      Run Results
                    </span>
                    <span className="ml-auto text-zinc-400 font-sans">
                      {runResults.filter((r) => r.passed).length}/{runResults.length} passed
                    </span>
                  </div>
                  <div className="p-3 space-y-3">
                    {runResults.map((r, i) => (
                      <div
                        key={i}
                        className={cn(
                          "p-2 rounded border text-[11px]",
                          r.passed
                            ? "border-green-800 bg-green-950/40"
                            : "border-red-800 bg-red-950/40",
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {r.passed ? (
                            <CheckCircle2 className="h-3 w-3 text-green-400" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-400" />
                          )}
                          <span className={r.passed ? "text-green-400" : "text-red-400"}>
                            Test {i + 1} — {r.passed ? "Passed" : "Failed"}
                          </span>
                        </div>
                        {!r.passed && (
                          <div className="space-y-0.5 pl-5 text-zinc-400">
                            <p>
                              <span className="text-zinc-500">Input: </span>
                              {r.input}
                            </p>
                            <p>
                              <span className="text-zinc-500">Expected: </span>
                              <span className="text-green-400">{r.expected_output}</span>
                            </p>
                            <p>
                              <span className="text-zinc-500">Got: </span>
                              <span className="text-red-400">{r.actual_output || "(empty)"}</span>
                            </p>
                            {r.stderr && (
                              <p className="text-orange-400">{r.stderr.slice(0, 200)}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Submission result badge */}
              {submissionMap.has(currentQuestion.id) &&
                (() => {
                  const sub = submissionMap.get(currentQuestion.id)!;
                  return (
                    <div
                      className={cn(
                        "shrink-0 px-3 py-2 text-xs font-medium flex items-center gap-2 border-t",
                        sub.status === "accepted"
                          ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:border-green-800"
                          : "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800",
                      )}
                    >
                      {sub.status === "accepted" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      )}
                      Last submission: {sub.passed_tests}/{sub.total_tests} tests passed · Score:{" "}
                      {sub.score.toFixed(1)} pts
                    </div>
                  );
                })()}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            No questions found in this exam.
          </div>
        )}
      </div>

      {/* ── Submit All Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" /> Submit Coding Exam
            </DialogTitle>
            <DialogDescription>Review your progress before final submission.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-green-50 border border-green-100 p-3">
                <p className="text-2xl font-bold text-green-700">{submittedCount}</p>
                <p className="text-xs text-green-600 font-medium mt-1">Submitted</p>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                <p className="text-2xl font-bold text-red-700">{totalQuestions - submittedCount}</p>
                <p className="text-xs text-red-600 font-medium mt-1">Not Submitted</p>
              </div>
              <div className="rounded-lg bg-muted border p-3">
                <p className="text-2xl font-bold">{totalQuestions}</p>
                <p className="text-xs text-muted-foreground font-medium mt-1">Total</p>
              </div>
            </div>
            {totalQuestions - submittedCount > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  <strong>{totalQuestions - submittedCount}</strong> problem(s) not submitted.
                  They'll receive zero marks.
                </span>
              </div>
            )}
            <p className="text-sm text-muted-foreground text-center">
              Once submitted, you cannot make changes.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsSubmitDialogOpen(false)}
              disabled={isSubmittingExam}
            >
              Keep Working
            </Button>
            <Button
              onClick={() => executeSubmit(false)}
              disabled={isSubmittingExam}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSubmittingExam ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" /> Confirm Submit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
