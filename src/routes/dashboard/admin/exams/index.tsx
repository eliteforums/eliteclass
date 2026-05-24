import { createFileRoute } from "@tanstack/react-router";
import { ExamList } from "@/modules/exams/components/admin/ExamList";

export const Route = createFileRoute("/dashboard/admin/exams/")({
  component: ExamList,
});
