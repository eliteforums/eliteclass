import { createFileRoute, useParams } from "@tanstack/react-router";
import { ExamPlayer } from "@/modules/exams/components/student/ExamPlayer";
import { CodingExamPlayer } from "@/modules/exams/components/student/CodingExamPlayer";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/student/exams/$examId/attempt")({
  component: AttemptPage,
});

function AttemptPage() {
  const { examId } = useParams({ from: "/dashboard/student/exams/$examId/attempt" });
  const [examType, setExamType] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setExamType("mcq");
      setIsDetecting(false);
      return;
    }
    const client = supabase;
    const detect = async () => {
      try {
        const { data } = await client.from("exams").select("exam_type").eq("id", examId).single();
        setExamType(data?.exam_type ?? "mcq");
      } catch {
        setExamType("mcq");
      } finally {
        setIsDetecting(false);
      }
    };
    detect();
  }, [examId]);

  if (isDetecting) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (examType === "coding") {
    return <CodingExamPlayer examId={examId} />;
  }

  return <ExamPlayer examId={examId} />;
}
