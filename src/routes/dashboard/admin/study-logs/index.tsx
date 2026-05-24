import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuthStore } from "@/store/authStore";
import { getActiveAttendanceBatches } from "@/services/batch.service";
import { getStaffBatchAssignments, getStaffByUserId } from "@/services/staff.service";
import { StaffStudyLogView } from "@/modules/study-logs/components/StaffStudyLogView";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/admin/study-logs/")({
  head: () => ({ meta: [{ title: "Progress Tracker — EduOS" }] }),
  component: StudyLogsPage,
});

function StudyLogsPage() {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id || "";
  const isStaffUser = user?.role === "staff";

  const [batches, setBatches] = useState<{ id: string; label: string }[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(true);

  const loadBatches = useCallback(async () => {
    if (!instituteId) return;

    setIsLoadingBatches(true);

    if (isStaffUser && user?.id) {
      const staffResult = await getStaffByUserId(user.id);

      if (!staffResult.success || !staffResult.data) {
        setBatches([]);
        setIsLoadingBatches(false);
        if (staffResult.error) toast.error(staffResult.error);
        return;
      }

      const assignmentsResult = await getStaffBatchAssignments(staffResult.data.id);

      if (!assignmentsResult.success || !assignmentsResult.data) {
        setBatches([]);
        setIsLoadingBatches(false);
        if (assignmentsResult.error) toast.error(assignmentsResult.error);
        return;
      }

      const scopedBatches = assignmentsResult.data
        .filter((a) => a.batch && a.batch.is_active !== false)
        .map((a) => ({
          id: a.batch!.id,
          label: a.batch!.course_name
            ? `${a.batch!.name} • ${a.batch!.course_name}`
            : a.batch!.name,
        }));

      setBatches(scopedBatches);
      setIsLoadingBatches(false);
      return;
    }

    const result = await getActiveAttendanceBatches(instituteId);
    if (result.success && result.data) {
      setBatches(
        result.data.map((b) => ({
          id: b.id,
          label: b.course_name ? `${b.name} • ${b.course_name}` : b.name,
        })),
      );
    } else if (result.error) {
      toast.error(result.error);
    }

    setIsLoadingBatches(false);
  }, [instituteId, isStaffUser, user?.id]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      <PageHeader
        title="Progress Tracker"
        subtitle="Daily student study logs and progress monitoring"
      />

      <div className="mt-6">
        {isLoadingBatches ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-3 text-sm">Loading batches...</span>
          </div>
        ) : batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Loader2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold">No Batches Found</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              You don't have access to any active batches. Please check your assignments.
            </p>
          </div>
        ) : (
          <StaffStudyLogView instituteId={instituteId} batches={batches} />
        )}
      </div>
    </ProtectedRoute>
  );
}
