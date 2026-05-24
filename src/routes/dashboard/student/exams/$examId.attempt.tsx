import { createFileRoute, useParams } from "@tanstack/react-router";
import { ExamPlayer } from "@/modules/exams/components/student/ExamPlayer";

export const Route = createFileRoute("/dashboard/student/exams/$examId/attempt")({
  component: AttemptPage,
});

function AttemptPage() {
  const { examId } = useParams({ from: "/dashboard/student/exams/$examId/attempt" });
  return <ExamPlayer examId={examId} />;
}
