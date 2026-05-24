import React, { useEffect, useState, useCallback, useRef } from "react";
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  Send, 
  AlertTriangle,
  FileQuestion,
  Info,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  getExamDetail, 
  startExamAttempt, 
  saveExamAnswer,
  recordViolationWithCheck,
  submitExamAttempt,
  createExamSession,
  validateSingleAttempt,
  validateExamTiming,
  updateAttemptActivity,
  lockExamAttempt,
} from "../../services/exam.service";
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
  const sessionTokenRef = useRef<string>('');
  const submissionLockRef = useRef(false);

  // ── Validation Hooks ────────────────────────────────────────────────────────

  const attemptValidation = useAttemptValidation({
    examId,
    userId: user?.id || '',
    enabled: true,
  });

  const { timeRemaining, isExpired } = useRealtimeExamTimer({
    examId,
    attemptId: attempt?.id || '',
    durationMs: (exam?.duration_mins || 60) * 60 * 1000,
    enabled: !!attempt && attempt.status === 'in_progress',
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
        toast.error(timingRes.data?.reason || 'Exam is not available at this time');
        navigate({ to: "/dashboard/student/exams" });
        setIsLoading(false);
        return;
      }

      // 2. Validate single attempt
      const singleAttemptRes = await validateSingleAttempt(examId, user.id);
      if (!singleAttemptRes.success || !singleAttemptRes.data?.canAttempt) {
        toast.error(singleAttemptRes.data?.reason || 'You cannot attempt this test');
        navigate({ to: "/dashboard/student/exams" });
        setIsLoading(false);
        return;
      }

      // 3. Get exam details and create/resume attempt
      const [examRes, attemptRes] = await Promise.all([
        getExamDetail(examId),
        startExamAttempt(examId, user.id, institute.id)
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
          
          // Check if attempt is locked or already submitted
          if (newAttempt.is_locked) {
            toast.error("This test attempt is locked. You cannot make changes.");
            navigate({ to: "/dashboard/student/exams" });
            setIsLoading(false);
            return;
          }

          if (newAttempt.status !== 'in_progress') {
            toast.info("Test already submitted");
            navigate({ to: "/dashboard/student/exams" });
            setIsLoading(false);
            return;
          }

          // Proctoring only after the attempt row exists in exam_attempts.
          setSecurityEnabled(true);

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
            }
          );

          if (sessionRes.success && sessionRes.data) {
            sessionTokenRef.current = sessionRes.data.sessionToken;
          }

          // 5. Load saved answers
          const savedAnswers: Record<string, string> = {};
          newAttempt.answers?.forEach(a => {
            if (a.selected_option_id) savedAnswers[a.question_id] = a.selected_option_id;
          });
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
    }, 30000); // Update every 30 seconds

    return () => clearInterval(activityInterval);
  }, [attempt?.id]);

  // ── Timer Expiry Handler ─────────────────────────────────────────────────

  useEffect(() => {
    if (isExpired && attempt) {
      handleSubmit(true);
    }
  }, [isExpired]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleOptionSelect = async (questionId: string, optionId: string) => {
    if (!attempt || attempt.is_locked) return;
    
    setAnswers(prev => ({ ...prev, [questionId]: optionId }));
    
    const { success } = await saveExamAnswer(attempt.id, questionId, optionId);
    if (!success) {
      toast.error("Failed to auto-save answer. Please check your connection.");
    }
  };

  const handleSubmit = async (isAuto = false) => {
    if (!attempt || isSubmittingExam) return;

    submissionLockRef.current = true;
    setIsSubmittingExam(true);
    try {
      if (!isAuto) {
        const confirmSubmit = window.confirm("Are you sure you want to submit your test?");
        if (!confirmSubmit) return;
      } else {
        toast.info("Submitting your test automatically...");
      }

      // Lock attempt before submission
      await lockExamAttempt(attempt.id);

      // Submit
      const { success, error } = await submitExamAttempt(attempt.id);
      
      if (success) {
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
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SecureExamWrapper
      attemptId={attempt.id}
      initialViolationCount={attempt.violation_count ?? 0}
      submissionLockRef={submissionLockRef}
      enabled={securityEnabled}
      onAutoSubmit={() => navigate({ to: "/dashboard/student/exams" })}
    >
      <div className="min-h-screen bg-muted/30 flex flex-col">
        {/* Header */}
        <header className="bg-card border-b border-border h-16 px-6 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <FileQuestion className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-lg truncate max-w-[200px] sm:max-w-md">{exam.title}</h1>
          </div>

          <div className={cn(
            "flex items-center gap-2 px-4 py-1.5 rounded-full font-mono text-lg font-bold border",
            timeLeft < 300 ? "bg-red-50 text-red-600 border-red-200 animate-pulse" : "bg-primary/5 text-primary border-primary/20"
          )}>
            <Clock className="h-5 w-5" />
            {formatTime(timeLeft)}
          </div>

          <Button variant="default" onClick={() => handleSubmit(false)} disabled={isSubmittingExam || attempt.is_locked}>
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
                        isCurrent ? "border-primary bg-primary text-primary-foreground scale-110 z-10" : 
                        isAnswered ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30" : 
                        "border-border hover:bg-muted"
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
                                  : "border-border hover:border-primary/50 hover:bg-muted/50"
                            )}
                          >
                            <div className={cn(
                              "h-8 w-8 rounded-full flex items-center justify-center font-bold border-2 transition-colors",
                              isSelected ? "bg-primary border-primary text-primary-foreground" : "border-border group-hover:border-primary/50"
                            )}>
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
                      onClick={() => setCurrentQuestionIdx(prev => Math.max(0, prev - 1))}
                      disabled={currentQuestionIdx === 0 || attempt.is_locked}
                    >
                      <ChevronLeft className="mr-2 h-4 w-4" /> Previous
                    </Button>
                    
                    {currentQuestionIdx < totalQuestions - 1 ? (
                      <Button
                        onClick={() => setCurrentQuestionIdx(prev => prev + 1)}
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
                <p>Your answers are being saved automatically. Do not refresh or leave the page during the exam.</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    </SecureExamWrapper>
  );
}
