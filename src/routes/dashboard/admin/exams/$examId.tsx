import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getExamDetail, updateExam, assignExamToStudents } from "@/modules/exams/services/exam.service";
import { ExamForm } from "@/modules/exams/components/admin/ExamForm";
import { QuestionManager } from "@/modules/exams/components/admin/QuestionManager";
import { ExamAssigneeSelector } from "@/modules/exams/components/admin/ExamAssigneeSelector";
import { AttemptList } from "@/modules/exams/components/admin/AttemptList";
import { LiveExamMonitoring } from "@/modules/exams/components/admin/LiveExamMonitoring";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Users, Settings, FileQuestion, BarChart3, Loader2, Send, ChevronLeft, Activity } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/dashboard/admin/exams/$examId")({
  component: ManageExamPage,
});

function ManageExamPage() {
  const { examId } = useParams({ from: "/dashboard/admin/exams/$examId" });
  const { institute } = useAuth();
  const navigate = useNavigate();
  const [exam, setExam] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  const fetchDetail = async () => {
    setIsLoading(true);
    const { data, success } = await getExamDetail(examId);
    if (success) setExam(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchDetail();
  }, [examId]);

  const handleUpdate = async (data: any) => {
    const payload = {
      ...data,
      start_time: data.start_time ? new Date(data.start_time).toISOString() : null,
      end_time: data.end_time ? new Date(data.end_time).toISOString() : null,
    };
    
    const { success } = await updateExam(examId, payload);
    if (success) {
      toast.success("Exam updated successfully");
      fetchDetail();
    } else {
      toast.error("Failed to update exam");
    }
  };

  const handlePublish = async () => {
    if (!exam.questions || exam.questions.length === 0) {
      toast.error("Please add at least one question before publishing.");
      return;
    }
    const { success } = await updateExam(examId, { status: "published" });
    if (success) {
      toast.success("Exam published successfully! Students can now see and attempt it.");
      fetchDetail();
    } else {
      toast.error("Failed to publish exam");
    }
  };

  const handleAssign = async (studentIds: string[]) => {
    if (!institute?.id) return;
    const { success } = await assignExamToStudents(examId, institute.id, studentIds);
    if (success) {
      toast.success("Students assigned successfully");
    } else {
      toast.error("Failed to assign students");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!exam) return <div>Exam not found</div>;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={exam.title}
        subtitle={`Manage questions, settings, and student assignments for this test.`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/dashboard/admin/exams" })}
            >
              <ChevronLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            {exam.status === "draft" && (
              <Button onClick={handlePublish} className="bg-green-600 hover:bg-green-700">
                <Send className="mr-2 h-4 w-4" /> Publish Test
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsAssignModalOpen(true)}>
              <Users className="mr-2 h-4 w-4" /> Assign Students
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="questions" className="space-y-6">
        <TabsList>
          <TabsTrigger value="questions" className="flex items-center gap-2">
            <FileQuestion className="h-4 w-4" /> Questions
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" /> Settings
          </TabsTrigger>
          <TabsTrigger value="results" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Results & Analytics
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Live Monitoring
          </TabsTrigger>
        </TabsList>

        <TabsContent value="questions">
          <QuestionManager examId={examId} questions={exam.questions || []} onRefresh={fetchDetail} />
        </TabsContent>

        <TabsContent value="settings">
          <div className="max-w-4xl">
            <ExamForm initialData={exam} onSubmit={handleUpdate} />
          </div>
        </TabsContent>

        <TabsContent value="results">
          <AttemptList examId={examId} />
        </TabsContent>

        <TabsContent value="monitoring">
          <LiveExamMonitoring examId={examId} />
        </TabsContent>
      </Tabs>

      <ExamAssigneeSelector
        isOpen={isAssignModalOpen}
        examId={examId}
        instituteId={institute?.id || ""}
        onClose={() => setIsAssignModalOpen(false)}
        onAssign={handleAssign}
      />
    </div>
  );
}
