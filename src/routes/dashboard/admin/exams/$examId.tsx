import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getExamDetail,
  updateExam,
  assignExamToStudents,
} from "@/modules/exams/services/exam.service";
import { ExamForm } from "@/modules/exams/components/admin/ExamForm";
import { QuestionManager } from "@/modules/exams/components/admin/QuestionManager";
import { ExamAssigneeSelector } from "@/modules/exams/components/admin/ExamAssigneeSelector";
import { AttemptList } from "@/modules/exams/components/admin/AttemptList";
import { AttemptOverridePanel } from "@/modules/exams/components/admin/AttemptOverridePanel";
import { LiveExamMonitoring } from "@/modules/exams/components/admin/LiveExamMonitoring";
import { ProctoringStatusBadges } from "@/modules/exams/components/admin/ProctoringStatusBadges";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Settings,
  FileQuestion,
  BarChart3,
  Loader2,
  Send,
  ChevronLeft,
  Activity,
  Camera,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ProctoringCapturesGallery } from "@/modules/exams/components/admin/ProctoringCapturesGallery";
import { getExamCaptures } from "@/modules/exams/services/exam.service";
import type { ProctoringCapture } from "@/modules/exams/types";

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
  const [examCaptures, setExamCaptures] = useState<ProctoringCapture[]>([]);
  const [isLoadingCaptures, setIsLoadingCaptures] = useState(false);
  const [capturesLoaded, setCapturesLoaded] = useState(false);

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
          <div className="flex items-center gap-2">
            <ProctoringStatusBadges
              enableTabDetection={exam.enable_tab_detection}
              enableCameraMic={exam.enable_camera_mic}
              enableDeterrentUi={exam.enable_deterrent_ui}
            />
            <Button variant="outline" onClick={() => navigate({ to: "/dashboard/admin/exams" })}>
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
          <TabsTrigger value="reattempts" className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" /> Reattempts
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Live Monitoring
          </TabsTrigger>
          <TabsTrigger
            value="captures"
            className="flex items-center gap-2"
            onClick={() => {
              if (!capturesLoaded) {
                setIsLoadingCaptures(true);
                getExamCaptures(examId).then(({ data, success }) => {
                  if (success && data) setExamCaptures(data);
                  setIsLoadingCaptures(false);
                  setCapturesLoaded(true);
                });
              }
            }}
          >
            <Camera className="h-4 w-4" /> Captures
          </TabsTrigger>
        </TabsList>

        <TabsContent value="questions">
          <QuestionManager
            examId={examId}
            questions={exam.questions || []}
            onRefresh={fetchDetail}
            examType={exam.exam_type ?? "mcq"}
          />
        </TabsContent>

        <TabsContent value="settings">
          <div className="max-w-4xl">
            <ExamForm initialData={exam} onSubmit={handleUpdate} />
          </div>
        </TabsContent>

        <TabsContent value="results">
          <AttemptList examId={examId} />
        </TabsContent>

        <TabsContent value="reattempts">
          <AttemptOverridePanel examId={examId} />
        </TabsContent>

        <TabsContent value="monitoring">
          <LiveExamMonitoring examId={examId} />
        </TabsContent>

        <TabsContent value="captures">
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Webcam photos and screen captures taken during active proctoring sessions. Captures
              are only recorded when <strong>Camera &amp; Microphone</strong> or{" "}
              <strong>Screen Capture</strong> is enabled on this exam.
            </p>

            {isLoadingCaptures ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading captures…
              </div>
            ) : examCaptures.length === 0 && capturesLoaded ? (
              <div className="flex flex-col items-center py-12 text-muted-foreground text-sm gap-2">
                <Camera className="h-10 w-10 opacity-20" />
                <p>No proctoring captures found for this exam.</p>
              </div>
            ) : (
              /* Group captures by attempt/student */
              (() => {
                const byAttempt = examCaptures.reduce<
                  Record<
                    string,
                    { captures: ProctoringCapture[]; studentName?: string; admissionNo?: string }
                  >
                >((acc, cap) => {
                  if (!acc[cap.attempt_id]) {
                    acc[cap.attempt_id] = {
                      captures: [],
                      studentName: cap.student_name,
                      admissionNo: cap.admission_no,
                    };
                  }
                  acc[cap.attempt_id].captures.push(cap);
                  return acc;
                }, {});

                return (
                  <div className="space-y-8">
                    {Object.entries(byAttempt).map(
                      ([attemptId, { captures: acs, studentName, admissionNo }]) => (
                        <div key={attemptId} className="rounded-xl border bg-card p-4 space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                              {(studentName?.[0] ?? "?").toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold">
                                {studentName ?? "Unknown Student"}
                              </p>
                              {admissionNo && (
                                <p className="text-xs text-muted-foreground">{admissionNo}</p>
                              )}
                            </div>
                            <Badge variant="outline" className="ml-auto text-xs">
                              {acs.length} capture{acs.length !== 1 ? "s" : ""}
                            </Badge>
                          </div>
                          <ProctoringCapturesGallery attemptId={attemptId} />
                        </div>
                      ),
                    )}
                  </div>
                );
              })()
            )}
          </div>
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
