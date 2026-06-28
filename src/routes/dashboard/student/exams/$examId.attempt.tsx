import { createFileRoute, useParams } from "@tanstack/react-router";
import { ExamPlayer } from "@/modules/exams/components/student/ExamPlayer";
import { CodingExamPlayer } from "@/modules/exams/components/student/CodingExamPlayer";
import { ExamReviewView } from "@/modules/exams/components/student/ExamReviewView";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { Loader2 } from "lucide-react";
import type { ExamAttempt } from "@/modules/exams/types";

export const Route = createFileRoute("/dashboard/student/exams/$examId/attempt")({
  component: AttemptPage,
});

function AttemptPage() {
  const { examId } = useParams({ from: "/dashboard/student/exams/$examId/attempt" });
  const user = useAuthStore((s) => s.user);
  const [examType, setExamType] = useState<string | null>(null);
  const [completedAttempt, setCompletedAttempt] = useState<ExamAttempt | null>(null);
  const [isDetecting, setIsDetecting] = useState(true);

  useEffect(() => {
    if (!supabase || !user?.id) {
      setExamType("mcq");
      setIsDetecting(false);
      return;
    }
    const client = supabase;
    const detect = async () => {
      try {
        // 1. Load exam type
        const examQuery = client.from("exams").select("exam_type").eq("id", examId).single();

        // 2. Load student id, then check for a completed attempt
        const studentQuery = client
          .from("students")
          .select("id")
          .eq("user_id", user.id)
          .single();

        const [examRes, studentRes] = await Promise.all([examQuery, studentQuery]);

        const detectedExamType = examRes.data?.exam_type ?? "mcq";
        setExamType(detectedExamType);

        // Coding exams: skip the review fork for now (review view is MCQ-only)
        if (detectedExamType !== "mcq" || !studentRes.data?.id) {
          setIsDetecting(false);
          return;
        }

        // Look for the most recent submitted/graded/auto-submitted attempt
        // that has NOT been granted a reattempt. If we find one, the student
        // is in review mode rather than re-taking.
        const { data: attemptRow } = await client
          .from("exam_attempts")
          .select("*")
          .eq("exam_id", examId)
          .eq("student_id", studentRes.data.id)
          .in("status", ["submitted", "auto_submitted", "graded"])
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (attemptRow && !attemptRow.reattempt_granted) {
          setCompletedAttempt(attemptRow as ExamAttempt);
        }
      } catch {
        setExamType("mcq");
      } finally {
        setIsDetecting(false);
      }
    };
    detect();
  }, [examId, user?.id]);

  if (isDetecting) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Submitted attempt that hasn't been re-granted → show the review view
  if (completedAttempt) {
    return <ExamReviewView examId={examId} attempt={completedAttempt} />;
  }

  if (examType === "coding") {
    return <CodingExamPlayer examId={examId} />;
  }

  return <ExamPlayer examId={examId} />;
}
