import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuthStore } from "@/store/authStore";
import { useStudentDashboardStore } from "@/store/studentDashboardStore";
import { StudentStudyLogView } from "@/modules/study-logs/components/StudentStudyLogView";
import { Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/dashboard/student/study-logs")({
  head: () => ({ meta: [{ title: "My Progress Tracker — EduOS" }] }),
  component: StudentStudyLogsPage,
});

function StudentStudyLogsPage() {
  const { user } = useAuthStore();
  const dashboard = useStudentDashboardStore((state) => state.dashboard);
  const isLoading = useStudentDashboardStore((state) => state.isLoading);
  const error = useStudentDashboardStore((state) => state.error);

  const studentId = dashboard?.student?.id;
  const primaryBatchId = dashboard?.student?.batch_id;
  const instituteId = user?.institute_id;

  if (isLoading && !dashboard) {
    return (
      <ProtectedRoute allowedRoles={["student"]}>
        <PageHeader
          title="Progress Tracker"
          subtitle="Loading your learning journey..."
        />
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ProtectedRoute>
    );
  }

  if (error) {
    return (
      <ProtectedRoute allowedRoles={["student"]}>
        <PageHeader
          title="Progress Tracker"
          subtitle="Track your daily learning and assignments"
        />
        <Card className="mt-8 border-destructive/20 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mb-4" />
            <h3 className="text-lg font-bold">Failed to load profile</h3>
            <p className="text-sm text-muted-foreground max-w-xs">{error}</p>
          </CardContent>
        </Card>
      </ProtectedRoute>
    );
  }

  if (!studentId || !primaryBatchId || !instituteId) {
    return (
      <ProtectedRoute allowedRoles={["student"]}>
        <PageHeader
          title="Progress Tracker"
          subtitle="Track your daily learning and assignments"
        />
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="text-lg font-bold">Profile incomplete</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              We couldn't find your student profile or assigned batch. Please contact your institute.
            </p>
          </CardContent>
        </Card>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <PageHeader
        title="Progress Tracker"
        subtitle="Daily study logs and academic consistency monitoring"
      />

      <div className="mt-6">
        <StudentStudyLogView
          studentId={studentId}
          batchId={primaryBatchId}
          instituteId={instituteId}
          assignments={dashboard?.student?.assignments || []}
        />
      </div>
    </ProtectedRoute>
  );
}
