import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ExamForm } from "@/modules/exams/components/admin/ExamForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { createExam } from "@/modules/exams/services/exam.service";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/dashboard/admin/exams/create")({
  component: CreateExamPage,
});

function CreateExamPage() {
  const { institute, user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: any) => {
    if (!institute?.id || !user?.id) return;
    setIsLoading(true);

    const payload = {
      ...data,
      start_time: data.start_time ? new Date(data.start_time).toISOString() : null,
      end_time: data.end_time ? new Date(data.end_time).toISOString() : null,
      institute_id: institute.id,
      created_by: user.id,
    };

    const { success, data: exam } = await createExam(payload);
    setIsLoading(false);

    if (success && exam) {
      toast.success("Exam created successfully. Now add some questions!");
      navigate({ to: `/dashboard/admin/exams/${exam.id}` });
    } else {
      toast.error("Failed to create exam");
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Create New MCQ Test"
        subtitle="Set up the basic details and settings for your assessment"
        actions={
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/dashboard/admin/exams" })}
          >
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        }
      />
      <ExamForm onSubmit={handleSubmit} isLoading={isLoading} />
    </div>
  );
}
