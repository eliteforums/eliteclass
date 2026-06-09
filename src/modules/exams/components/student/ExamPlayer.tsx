import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Send,
  AlertTriangle,
  FileQuestion,
  Info,
  Loader2,
  RefreshCw,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  getExamDetail,
  startExamAttempt,
  batchSaveAnswers,
  recordViolationWithCheck,
  submitExamAttempt,
  createExamSession,
  validateSingleAttempt,
  validateExamTiming,
  updateAttemptActivity,
  lockExamAttempt,
} from "../../services/exam.service";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Exam, ExamAttempt } from "../../types";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SecureExamWrapper } from "../SecureExamWrapper";
import { useRealtimeExamTimer } from "../../hooks/useRealtimeExamTimer";
import { useAttemptValidation } from "../../hooks/useAttemptValidation";
import { generateBrowserFingerprint, getOrCreateDeviceId } from "../../utils/exam-security";
import { useProctoring } from "../../hooks/useProctoring";
import { useProctoringCapture } from "../../hooks/useProctoringCapture";
import { ProctoringOverlay } from "./ProctoringOverlay";

/** Seeded Fisher-Yates shuffle. Given the same seed (attempt ID) produces the same order every time, so a student who resumes the exam sees questions in the same order. */
function seededShuffle<T>(array: T[], seed: string): T[] {
  const arr = [...array];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  }
  const rand = () => {
    hash ^= hash << 13;
    hash ^= hash >> 17;
    hash ^= hash << 5;
    return (hash >>> 0) / 0xffffffff;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface ExamPlayerProps {
  examId: string;
}

export function ExamPlayer({ examId }: ExamPlayerProps) {
  const { user, institute } = useAuth();
  const navigate = useNavigate();

  const [exam, setExam] = useState<Exam | null>(null);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingExam, setIsSubmittingExam] = useState(false);
  const [securityEnabled, setSecurityEnabled] = useState(false);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [screenShareStatus, setScreenShareStatus] = useState<
    "not_required" | "pending" | "granted" | "denied"
  >("not_required");
  const sessionTokenRef = useRef<string>("");
  const submissionLockRef = useRef(false);
  // Refs for debounced answer saving
  const pendingAnswersRef = useRef<Set<string>>(new Set());
  const answersRef = useRef<Record<string, string>>({});
  const [perQTimeLeft, setPerQTimeLeft] = useState<number | null>(null);
  const perQTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // ── Validation Hooks ────────────────────────────────────────────────────────

  const attemptValidation = useAttemptValidation({
    examId,
    userId: user?.id || "",
    enabled: true,
  });

  // ── Proctoring Hook ─────────────────────────────────────────────────────────

  const enableTabDetection = exam?.enable_tab_detection ?? false;
  const enableCameraMic = exam?.enable_camera_mic ?? false;
  const enableDeterrentUi = exam?.enable_deterrent_ui ?? false;

  const proctoring = useProctoring({
    enabled: securityEnabled && (enableCameraMic || enableDeterrentUi || enableTabDetection),
    enableTabDetection,
    enableCameraMic,
    enableDeterrentUi,
    attemptId: attempt?.id || "",
  });

  // ── Proctoring Capture Hook ───────────────────────────────────────────────
  // Schedules silent webcam photos (×2) and optional screen screenshots (×1)
  // at randomised intervals. Uploads in background — never blocks the exam.
  useProctoringCapture({
    enabled: !!attempt && attempt.status === "in_progress" && securityEnabled,
    attemptId: attempt?.id ?? "",
    studentId: attempt?.student_id ?? "",
    examId,
    instituteId: institute?.id ?? "",
    cameraStream: proctoring.cameraStream,
    screenStream,
    durationMs: (exam?.duration_mins || 60) * 60 * 1000,
    currentQuestionIdx,
    timeRemaining: timeLeft,
  });

  const { timeRemaining, isExpired } = useRealtimeExamTimer({
    examId,
    attemptId: attempt?.id || "",
    durationMs: (exam?.duration_mins || 60) * 60 * 1000,
    enabled: !!attempt && attempt.status === "in_progress",
    onTimeUpdate: (seconds) => {
      setTimeLeft(seconds);
    },
    onTimeExpired: () => {
      toast.error("Time is up! Auto-submitting your test...");
      handleSubmit(true);
    },
  });

  // ── Initialization ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.id || !institute?.id) return;

    const init = async () => {
      setIsLoading(true);

      // 1. Validate exam timing (server-side)
      const timingRes = await validateExamTiming(examId);
      if (!timingRes.success || !timingRes.data?.isAvailable) {
        toast.error(timingRes.data?.reason || "Exam is not available at this time");
        navigate({ to: "/dashboard/student/exams" });
        setIsLoading(false);
        return;
      }

      // 2. Validate single attempt
      const singleAttemptRes = await validateSingleAttempt(examId, user.id);
      if (!singleAttemptRes.success || !singleAttemptRes.data?.canAttempt) {
        toast.error(singleAttemptRes.data?.reason || "You cannot attempt this test");
        navigate({ to: "/dashboard/student/exams" });
        setIsLoading(false);
        return;
      }

      // 3. Get exam details and create/resume attempt
      const [examRes, attemptRes] = await Promise.all([
        getExamDetail(examId),
        startExamAttempt(examId, user.id, institute.id),
      ]);

      if (examRes.success && examRes.data) {
        setExam(examRes.data);

        if (!attemptRes.success || !attemptRes.data) {
          toast.error(attemptRes.error || "Failed to start exam attempt. Please try again.");
          navigate({ to: "/dashboard/student/exams" });
          setIsLoading(false);
          return;
        }

        {
          const newAttempt = attemptRes.data;
          setAttempt(newAttempt);

          // Apply deterministic per-student shuffle AFTER we have the attempt ID as seed
          if (examRes.data.randomize_questions && examRes.data.questions?.length) {
            examRes.data = {
              ...examRes.data,
              questions: seededShuffle(examRes.data.questions, newAttempt.id),
            };
            setExam(examRes.data);
          }

          // Check if attempt is locked or already submitted
          if (newAttempt.is_locked) {
            toast.error("This test attempt is locked. You cannot make changes.");
            navigate({ to: "/dashboard/student/exams" });
            setIsLoading(false);
            return;
          }

          if (newAttempt.status !== "in_progress") {
            toast.info("Test already submitted");
            navigate({ to: "/dashboard/student/exams" });
            setIsLoading(false);
            return;
          }

          // Proctoring only after the attempt row exists in exam_attempts.
          setSecurityEnabled(true);

          // Trigger screen-share prompt if the exam requires it
          if (examRes.data.enable_screen_capture) {
            setScreenShareStatus("pending");
          }

          // 4. Create secure exam session
          const browserFingerprint = generateBrowserFingerprint();
          const deviceId = getOrCreateDeviceId();

          const sessionRes = await createExamSession(
            newAttempt.id,
            newAttempt.student_id,
            examId,
            institute.id,
            {
              browserFingerprint,
              deviceId,
              userAgent: navigator.userAgent,
            },
          );

          if (sessionRes.success && sessionRes.data) {
            sessionTokenRef.current = sessionRes.data.sessionToken;
          }

          // 5. Load saved answers (DB first, then merge localStorage as backup)
          const savedAnswers: Record<string, string> = {};
          newAttempt.answers?.forEach((a) => {
            if (a.selected_option_id) savedAnswers[a.question_id] = a.selected_option_id;
          });
          // Merge any locally-stored answers (captures answers saved while offline)
          try {
            const storageKey = `exam_answers_${newAttempt.id}`;
            const localAnswers: Record<string, string> = JSON.parse(
              localStorage.getItem(storageKey) || "{}",
            );
            Object.entries(localAnswers).forEach(([qId, optId]) => {
              if (!savedAnswers[qId]) savedAnswers[qId] = optId;
            });
          } catch (_e) {
            // localStorage failures are non-critical
          }
          answersRef.current = savedAnswers;
          setAnswers(savedAnswers);

          // 6. Start timer from server time
          setTimeLeft((examRes.data.duration_mins || 60) * 60);
        }
      } else {
        toast.error(examRes.error || "Failed to load exam");
        navigate({ to: "/dashboard/student/exams" });
      }

      setIsLoading(false);
    };

    init();
  }, [examId, user?.id, institute?.id, navigate]);

  // ── Track Activity for Session Monitoring ────────────────────────────────

  useEffect(() => {
    if (!attempt) return;

    const activityInterval = setInterval(() => {
      updateAttemptActivity(attempt.id);
    }, 60000); // Update every 60 seconds to reduce DB load

    return () => clearInterval(activityInterval);
  }, [attempt?.id]);

  // ── Debounced Batch Answer Save ────────────────────────────────────────────
  // Answers are saved to localStorage immediately on every click.
  // Every 3 seconds, pending dirty answers are batch-flushed to Supabase.
  // This dramatically reduces concurrent DB writes with 50+ students.

  useEffect(() => {
    if (!attempt) return;

    const flushInterval = setInterval(async () => {
      const dirty = Array.from(pendingAnswersRef.current);
      if (dirty.length === 0) return;
      pendingAnswersRef.current.clear();

      const answersToSave: Record<string, string> = {};
      dirty.forEach((qId) => {
        const opt = answersRef.current[qId];
        if (opt) answersToSave[qId] = opt;
      });

      if (Object.keys(answersToSave).length > 0) {
        await batchSaveAnswers(attempt.id, answersToSave);
      }
    }, 3000);

    return () => clearInterval(flushInterval);
  }, [attempt?.id]);

  // ── Per-Question Timer ────────────────────────────────────────────────────
  // When time_per_question_seconds is set on the exam, each question gets its
  // own countdown that resets every time the student navigates to a new question.

  useEffect(() => {
    const tpq = exam?.time_per_question_seconds;
    if (!tpq || !attempt || attempt.status !== "in_progress") {
      setPerQTimeLeft(null);
      return;
    }

    if (perQTimerRef.current) clearInterval(perQTimerRef.current);
    setPerQTimeLeft(tpq);

    perQTimerRef.current = setInterval(() => {
      setPerQTimeLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (perQTimerRef.current) clearInterval(perQTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (perQTimerRef.current) clearInterval(perQTimerRef.current);
    };
  }, [currentQuestionIdx, exam?.time_per_question_seconds, attempt?.status]);

  // Auto-advance (or auto-submit on last question) when per-question timer reaches 0
  useEffect(() => {
    if (perQTimeLeft !== 0 || !exam?.time_per_question_seconds) return;
    const totalQ = exam?.questions?.length ?? 0;
    if (currentQuestionIdx < totalQ - 1) {
      setCurrentQuestionIdx((prev) => prev + 1);
    } else {
      // Last question — auto-submit the whole exam
      handleSubmit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perQTimeLeft]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleOptionSelect = (questionId: string, optionId: string) => {
    if (!attempt || attempt.is_locked) return;

    // Update state immediately (no Supabase call here)
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: optionId };
      answersRef.current = next;
      return next;
    });

    // Persist to localStorage as backup
    try {
      const storageKey = `exam_answers_${attempt.id}`;
      const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
      stored[questionId] = optionId;
      localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch {
      // localStorage failures are non-critical
    }

    // Mark as dirty for the next batch flush
    pendingAnswersRef.current.add(questionId);
  };

  // Called by the dialog's "Confirm" button or auto-submit
  const executeSubmit = async (isAuto = false) => {
    if (!attempt || isSubmittingExam) return;

    submissionLockRef.current = true;
    setIsSubmitDialogOpen(false);
    setIsSubmittingExam(true);

    try {
      if (isAuto) toast.info("Submitting your test automatically...");

      // Flush any pending answers before submitting
      const dirty = Array.from(pendingAnswersRef.current);
      pendingAnswersRef.current.clear();
      if (dirty.length > 0) {
        const answersToSave: Record<string, string> = {};
        dirty.forEach((qId) => {
          const opt = answersRef.current[qId];
          if (opt) answersToSave[qId] = opt;
        });
        if (Object.keys(answersToSave).length > 0) {
          await batchSaveAnswers(attempt.id, answersToSave);
        }
      }

      // Also sync from localStorage as final safety net
      try {
        const storageKey = `exam_answers_${attempt.id}`;
        const stored: Record<string, string> = JSON.parse(localStorage.getItem(storageKey) || "{}");
        if (Object.keys(stored).length > 0) {
          await batchSaveAnswers(attempt.id, stored);
        }
      } catch {
        // Non-critical
      }

      // Stop proctoring streams before submission
      proctoring.stopStreams();
      screenStream?.getTracks().forEach((t) => t.stop());
      setScreenStream(null);

      // Lock attempt before submission
      await lockExamAttempt(attempt.id);

      // Submit
      const { success, error } = await submitExamAttempt(attempt.id);

      if (success) {
        // Clear localStorage backup on success
        try {
          localStorage.removeItem(`exam_answers_${attempt.id}`);
        } catch (_e) {
          // Non-critical
        }
        toast.success("Test submitted successfully!");
        navigate({ to: "/dashboard/student/exams" });
      } else {
        toast.error(error || "Failed to submit test. Please try again.");
      }
    } catch (error) {
      toast.error("An error occurred while submitting. Please try again.");
    } finally {
      submissionLockRef.current = false;
      setIsSubmittingExam(false);
    }
  };

  const handleSubmit = (isAuto = false) => {
    if (!attempt || isSubmittingExam) return;
    if (isAuto) {
      executeSubmit(true);
    } else {
      setIsSubmitDialogOpen(true);
    }
  };

  const handleRequestScreenShare = async () => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: false,
      });
      setScreenStream(stream);
      setScreenShareStatus("granted");
      // If user manually stops sharing via the browser's "Stop sharing" button
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setScreenStream(null);
        // Don't re-prompt — capture whatever we have from this point
      });
    } catch {
      // User dismissed the browser picker
      setScreenShareStatus("denied");
      toast.warning("Screen monitoring was skipped. This exam session has been flagged.");
    }
  };

  if (isLoading || !exam || !attempt || attemptValidation.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Check if attempt is valid
  if (!attemptValidation.canAttempt) {
    return (
      <div className="flex h-screen items-center justify-center bg-muted/30">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Exam Not Available</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{attemptValidation.reason}</p>
            {attemptValidation.timingMessage && (
              <p className="text-sm text-yellow-600">{attemptValidation.timingMessage}</p>
            )}
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/dashboard/student/exams" })}
              className="w-full"
            >
              Go Back
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const currentQuestion = exam.questions?.[currentQuestionIdx];
  const totalQuestions = exam.questions?.length || 0;
  const answeredCount = Object.keys(answers).length;
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <SecureExamWrapper
      attemptId={attempt.id}
      initialViolationCount={attempt.violation_count ?? 0}
      submissionLockRef={submissionLockRef}
      enabled={securityEnabled}
      enableTabDetection={enableTabDetection}
      onAutoSubmit={() => {
        proctoring.stopStreams();
        navigate({ to: "/dashboard/student/exams" });
      }}
    >
      <div className="min-h-screen bg-muted/30 flex flex-col">
        {/* Proctoring Overlay */}
        <ProctoringOverlay
          cameraStream={proctoring.cameraStream}
          showCameraPreview={enableDeterrentUi && enableCameraMic && proctoring.isCameraActive}
          showRecordingIndicator={enableDeterrentUi}
        />

        {/* Blocking Overlay - shown when camera/mic is denied or hardware unavailable */}
        {proctoring.showBlockingOverlay && (
          <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex items-center justify-center p-6 text-center">
            <div className="max-w-md space-y-6">
              <div className="mx-auto size-16 bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertTriangle className="size-8 text-destructive" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Camera & Microphone Required</h2>
                <p className="text-muted-foreground">
                  {proctoring.blockingReason ||
                    "Camera and microphone access is required to proceed with this exam."}
                </p>
              </div>
              <Button size="lg" className="w-full" onClick={() => proctoring.retryCamera()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry Permissions
              </Button>
              <p className="text-xs text-muted-foreground">
                Please allow camera and microphone access in your browser settings, then click
                retry.
              </p>
            </div>
          </div>
        )}

        {/* Screen-Share Consent Overlay */}
        {exam?.enable_screen_capture &&
          screenShareStatus === "pending" &&
          !proctoring.showBlockingOverlay && (
            <div className="fixed inset-0 z-[9998] bg-background/95 backdrop-blur-sm flex items-center justify-center p-6 text-center">
              <div className="max-w-md space-y-6">
                <div className="mx-auto size-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <Monitor className="size-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">Screen Monitoring</h2>
                  <p className="text-muted-foreground">
                    This exam uses screen monitoring. Your screen will be captured once during the
                    exam as part of the proctoring process. Please click{" "}
                    <strong>Share Screen</strong> and select your full screen or browser window.
                  </p>
                </div>
                <div className="space-y-3">
                  <Button size="lg" className="w-full" onClick={handleRequestScreenShare}>
                    <Monitor className="mr-2 h-4 w-4" />
                    Share Screen &amp; Continue
                  </Button>
                  <button
                    type="button"
                    onClick={() => setScreenShareStatus("denied")}
                    className="text-sm text-muted-foreground hover:text-foreground underline"
                  >
                    Skip — I understand this will be flagged
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* Header */}
        <header className="bg-card border-b border-border h-16 px-6 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <FileQuestion className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-lg truncate max-w-[200px] sm:max-w-md">{exam.title}</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Main exam timer */}
            <div
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-full font-mono text-lg font-bold border",
                timeLeft < 300
                  ? "bg-red-50 text-red-600 border-red-200 animate-pulse"
                  : "bg-primary/5 text-primary border-primary/20",
              )}
            >
              <Clock className="h-5 w-5" />
              {formatTime(timeLeft)}
            </div>
            {/* Per-question timer (only visible when exam has time_per_question_seconds) */}
            {exam?.time_per_question_seconds && perQTimeLeft !== null && (
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-sm font-bold border",
                  perQTimeLeft <= 10
                    ? "bg-orange-50 text-orange-600 border-orange-200 animate-pulse"
                    : "bg-muted text-muted-foreground border-border",
                )}
                title="Time for this question"
              >
                <Clock className="h-3.5 w-3.5" />
                {perQTimeLeft}s
              </div>
            )}
          </div>

          <Button
            variant="default"
            onClick={() => handleSubmit(false)}
            disabled={isSubmittingExam || attempt.is_locked}
          >
            {isSubmittingExam ? "Submitting..." : "Submit Test"} <Send className="ml-2 h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - Navigation Palette */}
          <aside className="w-80 border-r border-border bg-card hidden lg:flex flex-col">
            <div className="p-6 border-b border-border">
              <h2 className="font-semibold mb-4">Question Palette</h2>
              <div className="grid grid-cols-5 gap-2">
                {exam.questions?.map((q, idx) => {
                  const isAnswered = !!answers[q.id];
                  const isCurrent = currentQuestionIdx === idx;

                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQuestionIdx(idx)}
                      className={cn(
                        "h-10 w-10 rounded-md text-xs font-bold transition-all border",
                        isCurrent
                          ? "border-primary bg-primary text-primary-foreground scale-110 z-10"
                          : isAnswered
                            ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30"
                            : "border-border hover:bg-muted",
                      )}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span>Overall Progress</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              <div className="space-y-2 pt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span>Answered ({answeredCount})</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-3 w-3 rounded-full border border-border" />
                  <span>Unanswered ({totalQuestions - answeredCount})</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-3 w-3 rounded-full bg-primary" />
                  <span>Current</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto p-6 md:p-10">
            <div className="max-w-3xl mx-auto space-y-8">
              {currentQuestion && (
                <Card className="border-none shadow-lg">
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-sm font-bold text-primary uppercase tracking-wider">
                        Question {currentQuestionIdx + 1} of {totalQuestions}
                      </span>
                      <Badge variant="secondary">{currentQuestion.marks} Marks</Badge>
                    </div>
                    <CardTitle className="text-xl leading-relaxed">
                      {currentQuestion.question_text}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {currentQuestion.code_snippet && (
                      <div className="mt-3 p-4 rounded-lg bg-slate-900 dark:bg-slate-950 text-slate-100 text-sm font-mono overflow-x-auto border border-slate-700">
                        <div className="mb-2 text-xs text-slate-400 font-sans">Code Snippet:</div>
                        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                          {currentQuestion.code_snippet}
                        </pre>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-3">
                      {currentQuestion.options?.map((option, oIdx) => {
                        const isSelected = answers[currentQuestion.id] === option.id;
                        const label = String.fromCharCode(65 + oIdx); // A, B, C, D

                        return (
                          <button
                            key={option.id}
                            onClick={() => handleOptionSelect(currentQuestion.id, option.id)}
                            disabled={attempt.is_locked}
                            className={cn(
                              "flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all group",
                              attempt.is_locked
                                ? "opacity-50 cursor-not-allowed"
                                : isSelected
                                  ? "border-primary bg-primary/5 shadow-md"
                                  : "border-border hover:border-primary/50 hover:bg-muted/50",
                            )}
                          >
                            <div
                              className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center font-bold border-2 transition-colors",
                                isSelected
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-border group-hover:border-primary/50",
                              )}
                            >
                              {label}
                            </div>
                            <span className="flex-1 font-medium">{option.option_text}</span>
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between pt-6 border-t border-border/50">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentQuestionIdx((prev) => Math.max(0, prev - 1))}
                      disabled={currentQuestionIdx === 0 || attempt.is_locked}
                    >
                      <ChevronLeft className="mr-2 h-4 w-4" /> Previous
                    </Button>

                    {currentQuestionIdx < totalQuestions - 1 ? (
                      <Button
                        onClick={() => setCurrentQuestionIdx((prev) => prev + 1)}
                        disabled={attempt.is_locked}
                      >
                        Next <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleSubmit(false)}
                        disabled={attempt.is_locked}
                      >
                        Finish Test
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              )}

              <div className="flex items-center gap-2 p-4 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-sm">
                <Info className="h-4 w-4 shrink-0" />
                <p>
                  Your answers are being saved automatically. Do not refresh or leave the page
                  during the exam.
                </p>
              </div>
            </div>
          </main>
        </div>
      </div>
      {/* Submit Confirmation Dialog */}
      <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" /> Submit Test
            </DialogTitle>
            <DialogDescription>Review your progress before submitting.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-green-50 border border-green-100 p-3">
                <p className="text-2xl font-bold text-green-700">{Object.keys(answers).length}</p>
                <p className="text-xs text-green-600 font-medium mt-1">Answered</p>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                <p className="text-2xl font-bold text-red-700">
                  {(exam?.questions?.length ?? 0) - Object.keys(answers).length}
                </p>
                <p className="text-xs text-red-600 font-medium mt-1">Unanswered</p>
              </div>
              <div className="rounded-lg bg-muted border p-3">
                <p className="text-2xl font-bold">{exam?.questions?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground font-medium mt-1">Total</p>
              </div>
            </div>
            {(exam?.questions?.length ?? 0) - Object.keys(answers).length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  You have{" "}
                  <strong>{(exam?.questions?.length ?? 0) - Object.keys(answers).length}</strong>{" "}
                  unanswered question(s). Unanswered questions receive zero marks.
                </span>
              </div>
            )}
            <p className="text-sm text-muted-foreground text-center">
              Once submitted, you cannot change your answers.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setIsSubmitDialogOpen(false)}
              disabled={isSubmittingExam}
            >
              Keep Reviewing
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
    </SecureExamWrapper>
  );
}
