import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { Plus, AlertCircle, RefreshCw, X } from "lucide-react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { useAuthStore } from "@/store/authStore";
import { useStaff } from "@/modules/staff/hooks/useStaff";
import { StaffTable } from "@/modules/staff/components/StaffTable";
import { StaffAdmissionForm } from "@/modules/staff/components/StaffAdmissionForm";
import { StaffProfileSheet } from "@/modules/staff/components/StaffProfileSheet";
import type { Staff } from "@/types";

export const Route = createFileRoute("/dashboard/admin/staff/")({
  head: () => ({ meta: [{ title: "Staff Management — EduOS" }] }),
  component: StaffPage,
});

function StaffPage() {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? null;

  const { staff, isLoading, error, fetchStaff, deleteStaffMember } = useStaff({ instituteId });

  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [isAdmitModalOpen, setIsAdmitModalOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const handleView = useCallback((s: Staff) => {
    setSelectedStaff(s);
  }, []);

  const handleEdit = useCallback((s: Staff) => {
    setSelectedStaff(null);
    setEditingStaff(s);
  }, []);

  const handleAssignedCoursesChange = useCallback((assigned_courses: Staff["assigned_courses"]) => {
    setSelectedStaff((prev) => (prev ? { ...prev, assigned_courses } : prev));
  }, []);

  const handleDelete = useCallback(
    async (s: Staff) => {
      if (window.confirm(`Are you sure you want to remove ${s.user?.name} from staff?`)) {
        await deleteStaffMember(s.id);
        if (selectedStaff?.id === s.id) setSelectedStaff(null);
      }
    },
    [deleteStaffMember, selectedStaff?.id],
  );

  const filteredStaff = staff.filter(
    (s) =>
      s.user?.name?.toLowerCase().includes(searchValue.toLowerCase()) ||
      s.user?.email?.toLowerCase().includes(searchValue.toLowerCase()) ||
      s.designation?.toLowerCase().includes(searchValue.toLowerCase()) ||
      s.department?.toLowerCase().includes(searchValue.toLowerCase()),
  );

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <PageHeader
        title="Staff Management"
        subtitle="Manage teachers, coordinators and other staff members"
        badge={`${staff.length} total`}
        actions={
          <button
            type="button"
            onClick={() => setIsAdmitModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Admit Staff
          </button>
        }
      />

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={fetchStaff}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={searchValue}
          onChange={setSearchValue}
          placeholder="Search staff by name, email, or role…"
          className="w-full sm:max-w-xs"
        />
      </div>

      <div className="mt-4">
        <StaffTable
          staff={filteredStaff}
          isLoading={isLoading}
          onView={handleView}
          onDelete={handleDelete}
        />
      </div>

      <StaffProfileSheet
        staff={selectedStaff}
        isOpen={selectedStaff !== null}
        onClose={() => setSelectedStaff(null)}
        onEdit={selectedStaff ? () => handleEdit(selectedStaff) : undefined}
        onDelete={() => selectedStaff && handleDelete(selectedStaff)}
        onAssignedCoursesChange={handleAssignedCoursesChange}
      />

      {/* Admit Staff Modal */}
      {isAdmitModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAdmitModalOpen(false);
          }}
        >
          <div className="relative bg-card rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 animate-in fade-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setIsAdmitModalOpen(false)}
              className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <StaffAdmissionForm
              instituteId={instituteId ?? ""}
              mode="create"
              onSuccess={() => fetchStaff()}
              onCancel={() => setIsAdmitModalOpen(false)}
            />
          </div>
        </div>
      )}

      {editingStaff && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingStaff(null);
          }}
        >
          <div className="relative bg-card rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 animate-in fade-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setEditingStaff(null)}
              className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <StaffAdmissionForm
              instituteId={instituteId ?? ""}
              mode="edit"
              staff={editingStaff}
              onSuccess={() => {
                setEditingStaff(null);
                fetchStaff();
              }}
              onCancel={() => setEditingStaff(null)}
            />
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
