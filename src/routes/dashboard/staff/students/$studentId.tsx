// ---------------------------------------------------------------------------
// EduOS — Staff: Student Profile
// ---------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuthStore } from "@/store/authStore";
import { getStaffByUserId } from "@/services/staff.service";
import { TeacherStudentProfileView } from "@/modules/teacher-students/components/TeacherStudentProfileView";

export const Route = createFileRoute("/dashboard/staff/students/$studentId")({
  head: () => ({ meta: [{ title: "Student Profile — EduOS" }] }),
  component: TeacherStudentProfilePage,
});

function TeacherStudentProfilePage() {
  const { studentId } = Route.useParams();
  const { user } = useAuthStore();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(true);

  useEffect(() => {
    async function boot() {
      if (!user?.id) return;
      setBootLoading(true);
      const staffRes = await getStaffByUserId(user.id);
      if (staffRes.success && staffRes.data) setStaffId(staffRes.data.id);
      setBootLoading(false);
    }
    void boot();
  }, [user?.id]);

  if (bootLoading || !staffId) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["staff"]}>
      <PageHeader title="Student profile" subtitle="Attendance, performance, and remarks" />
      <TeacherStudentProfileView studentId={studentId} staffId={staffId} />
    </ProtectedRoute>
  );
}
