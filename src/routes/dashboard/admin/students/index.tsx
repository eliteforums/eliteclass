import { createFileRoute } from '@tanstack/react-router'
// ---------------------------------------------------------------------------
// EduOS — Admin: Student Management Page
//
// Full student management interface for institute admins.
// Features:
//  - Paginated, searchable, filterable student table
//  - Admission modal with AdmissionForm (fixed overlay)
//  - StudentProfileSheet slide-in panel for per-student actions
//  - Optimistic archive / restore via useStudents hook
//  - Error banner on fetch failure
// ---------------------------------------------------------------------------

import React, { useState, useCallback, useEffect } from "react";
import { Plus, AlertCircle, ChevronLeft, ChevronRight, X, RefreshCw, Loader2 } from "lucide-react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { useAuthStore } from "@/store/authStore";
import { useStudents } from "@/modules/students/hooks/useStudents";
import { StudentTable } from "@/modules/students/components/StudentTable";
import { StudentProfileSheet } from "@/modules/students/components/StudentProfileSheet";
import { AdmissionForm } from "@/modules/students/components/AdmissionForm";
import BulkImportModal from "@/modules/students/components/BulkImportModal";
import { AssignFeeModal } from "@/modules/fees/components/AssignFeeModal";
import { getFeeStructures } from "@/services/fee.service";
import type { Student, StudentStatus, FeeStructure } from "@/types";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/admin/students/")({
  head: () => ({ meta: [{ title: "Students — EduOS" }] }),
  component: StudentsPage,
});

// ── Page component ────────────────────────────────────────────────────────────

function StudentsPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const instituteId = user?.institute_id ?? null;

  // ── Data hook ────────────────────────────────────────────────────────────
  const {
    students,
    isLoading,
    error,
    pagination,
    filters,
    setSearch,
    setStatusFilter,
    archiveStudent,
    restoreStudent,
    fetchStudents,
  } = useStudents({ instituteId });

  // ── Local UI state ────────────────────────────────────────────────────────
  /** Currently viewed student — null means the profile sheet is closed. */
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  /** Controls the per-student fee assignment modal. */
  const [isAssignFeeModalOpen, setIsAssignFeeModalOpen] = useState(false);
  /** Controls visibility of the Admit Student modal. */
  const [isAdmitModalOpen, setIsAdmitModalOpen] = useState(false);
  const [admitMode, setAdmitMode] = useState<"manual" | "import">("manual");
  /** Tracks the raw SearchInput value (synced with hook's filters.search). */
  const [searchValue, setSearchValue] = useState("");
  /** Fee structures available for assignment in the current institute. */
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);

  useEffect(() => {
    if (!instituteId) return;

    let cancelled = false;

    async function loadFeeStructures() {
      // OPTIMIZATION: Only fetch if the modal is about to be used or on mount
      const result = await getFeeStructures(instituteId);
      if (!cancelled && result.success && result.data) {
        setFeeStructures(result.data);
      }
    }

    loadFeeStructures();

    return () => {
      cancelled = true;
    };
  }, [instituteId]);

  // ── Table callbacks ───────────────────────────────────────────────────────

  const handleView = useCallback((student: Student) => {
    setSelectedStudent(student);
  }, []);

  const handleArchive = useCallback(
    async (student: Student) => {
      await archiveStudent(student.id);
    },
    [archiveStudent],
  );

  const handleRestore = useCallback(
    async (student: Student) => {
      await restoreStudent(student.id);
    },
    [restoreStudent],
  );

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      setSearch(value);
    },
    [setSearch],
  );

  // ── Profile sheet archive / restore toggle ────────────────────────────────

  /** Toggles archive ↔ restore for the currently selected student, then closes the sheet. */
  const handleSheetArchiveToggle = useCallback(async () => {
    if (!selectedStudent) return;

    if (selectedStudent.status !== "inactive") {
      await archiveStudent(selectedStudent.id);
    } else {
      await restoreStudent(selectedStudent.id);
    }

    setSelectedStudent(null);
  }, [selectedStudent, archiveStudent, restoreStudent]);

  const handleAssignFee = useCallback(() => {
    setIsAssignFeeModalOpen(true);
  }, []);

  // ── Admission success ─────────────────────────────────────────────────────

  const handleAdmissionSuccess = useCallback(() => {
    // Refresh from page 1 so the new student appears immediately.
    // NOTE: We don't close the modal here because the AdmissionForm
    // needs to display the generated credentials. The user will
    // close it via the "Done" button on the success screen.
    fetchStudents(1);
  }, [fetchStudents]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      {/* ── Page header ───────────────────────────────────────────────── */}
      <PageHeader
        title="Students"
        subtitle="Manage student admissions and records"
        badge={isLoading ? "— students" : `${pagination.total} students`}
        actions={
          <button
            type="button"
            onClick={() => setIsAdmitModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Admit Student
          </button>
        }
      />

      {/* ── Auth still loading — show inline hint ─────────────────────── */}
      {authLoading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading session…</span>
        </div>
      )}

      {/* ── Error banner with retry ───────────────────────────────────── */}
      {error && !authLoading && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => fetchStudents(1)}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* ── Filter bar ────────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={searchValue}
          onChange={handleSearchChange}
          placeholder="Search students…"
          className="w-full sm:max-w-xs"
        />
        <select
          value={filters.status ?? ""}
          onChange={(e) =>
            setStatusFilter((e.target.value as StudentStatus | undefined) || undefined)
          }
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="graduated">Graduated</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* ── Student table ─────────────────────────────────────────────── */}
      <div className="mt-4">
        <StudentTable
          students={students}
          isLoading={isLoading}
          onView={handleView}
          onArchive={handleArchive}
          onRestore={handleRestore}
        />
      </div>

      {/* ── Pagination ────────────────────────────────────────────────── */}
      {pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => fetchStudents(pagination.page - 1)}
            disabled={pagination.page <= 1 || isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Prev
          </button>

          <span className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </span>

          <button
            type="button"
            onClick={() => fetchStudents(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages || isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ── Student Profile Sheet ─────────────────────────────────────── */}
      <StudentProfileSheet
        student={selectedStudent}
        isOpen={selectedStudent !== null}
        onClose={() => setSelectedStudent(null)}
        onArchive={handleSheetArchiveToggle}
        onAssignFee={handleAssignFee}
      />

      {selectedStudent && (
        <AssignFeeModal
          studentId={selectedStudent.id}
          studentName={selectedStudent.user?.name ?? selectedStudent.admission_no}
          instituteId={instituteId ?? ""}
          feeStructures={feeStructures}
          isOpen={isAssignFeeModalOpen}
          onClose={() => setIsAssignFeeModalOpen(false)}
          onSuccess={() => {
            setIsAssignFeeModalOpen(false);
            setSelectedStudent(null);
          }}
        />
      )}

      {/* ── Admit Student Modal ───────────────────────────────────────── */}
      {isAdmitModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          aria-modal="true"
          role="dialog"
          aria-label="Admit Student"
          onClick={(e) => {
            // Close when clicking the backdrop, not the card itself.
            if (e.target === e.currentTarget) setIsAdmitModalOpen(false);
          }}
        >
          <div className="relative w-full max-w-4xl">
            <div className="relative bg-card rounded-2xl shadow-xl w-full max-h-[90vh] overflow-y-auto p-6">
              <button
                type="button"
                onClick={() => setIsAdmitModalOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>

              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Admit Student</h2>
                <div className="flex gap-2">
                  <button onClick={() => setAdmitMode("manual")} className={`px-3 py-2 rounded-lg ${admitMode==='manual' ? 'bg-primary text-primary-foreground' : 'border border-border'}`}>Manual</button>
                  <button onClick={() => setAdmitMode("import")} className={`px-3 py-2 rounded-lg ${admitMode==='import' ? 'bg-primary text-primary-foreground' : 'border border-border'}`}>Import</button>
                </div>
              </div>

              {admitMode === "manual" ? (
                <AdmissionForm
                  instituteId={instituteId ?? ""}
                  onSuccess={() => { handleAdmissionSuccess(); /* keep modal open for credentials */ }}
                  onCancel={() => setIsAdmitModalOpen(false)}
                />
              ) : (
                // Lazy import BulkImportModal component
                <React.Suspense fallback={<div className="p-6">Loading…</div>}>
                  <BulkImportModal
                    instituteId={instituteId ?? ""}
                    instituteName={user?.institute_id ?? undefined}
                    onClose={() => setIsAdmitModalOpen(false)}
                    onComplete={() => fetchStudents(1)}
                  />
                </React.Suspense>
              )}
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
