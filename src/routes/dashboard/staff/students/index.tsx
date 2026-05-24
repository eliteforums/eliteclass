// ---------------------------------------------------------------------------
// EduOS — Staff: My Students
// ---------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuthStore } from "@/store/authStore";
import { getStaffByUserId, getStaffAssignments } from "@/services/staff.service";
import { useTeacherStudents } from "@/modules/teacher-students/hooks/useTeacherStudents";
import { TeacherStudentFilters } from "@/modules/teacher-students/components/TeacherStudentFilters";
import { TeacherStudentTable } from "@/modules/teacher-students/components/TeacherStudentTable";
import { TeacherStudentCardGrid } from "@/modules/teacher-students/components/TeacherStudentCardGrid";
import type { Batch } from "@/types";

export const Route = createFileRoute("/dashboard/staff/students/")({
  head: () => ({ meta: [{ title: "My Students — EduOS" }] }),
  component: TeacherStudentsPage,
});

function TeacherStudentsPage() {
  const { user } = useAuthStore();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [bootLoading, setBootLoading] = useState(true);

  const {
    students,
    isLoading,
    error,
    filters,
    setFilters,
    page,
    setPage,
    total,
    totalPages,
    refresh,
  } = useTeacherStudents({ staffId });

  useEffect(() => {
    async function boot() {
      if (!user?.id) return;
      setBootLoading(true);
      const staffRes = await getStaffByUserId(user.id);
      if (staffRes.success && staffRes.data) {
        setStaffId(staffRes.data.id);
        const assignRes = await getStaffAssignments(staffRes.data.id);
        if (assignRes.success && assignRes.data) {
          const unique = new Map<string, Batch>();
          for (const a of assignRes.data) {
            if (a.batch) unique.set(a.batch.id, a.batch);
          }
          setBatches([...unique.values()]);
        }
      }
      setBootLoading(false);
    }
    void boot();
  }, [user?.id]);

  const badge = useMemo(() => {
    if (isLoading && students.length === 0) return undefined;
    return `${total} student${total === 1 ? "" : "s"}`;
  }, [total, isLoading, students.length]);

  const updateFilters = (next: Partial<typeof filters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  };

  if (bootLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["staff"]}>
      <PageHeader
        title="My Students"
        subtitle="Students in your assigned batches and classes"
        badge={badge}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`rounded-md p-2 ${viewMode === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                aria-label="Table view"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`rounded-md p-2 ${viewMode === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                aria-label="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-4">
        <TeacherStudentFilters filters={filters} batches={batches} onChange={updateFilters} />

        {viewMode === "table" ? (
          <TeacherStudentTable students={students} isLoading={isLoading} />
        ) : (
          <TeacherStudentCardGrid students={students} isLoading={isLoading} />
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
