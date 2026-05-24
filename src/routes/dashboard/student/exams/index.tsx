import { createFileRoute } from "@tanstack/react-router";
import { StudentExamDashboard } from "@/modules/exams/components/student/StudentExamDashboard";

export const Route = createFileRoute("/dashboard/student/exams/")({
  component: StudentExamDashboard,
});
