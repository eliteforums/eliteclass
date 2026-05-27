import { createFileRoute } from '@tanstack/react-router'
// ---------------------------------------------------------------------------
// EliteClass — Admin: Student Management Page
//
// Full student management interface for institute admins.
// Features:
//  - Virtualized infinite scroll for large datasets (50k+ students)
//  - Searchable, filterable student table
//  - Admission modal with AdmissionForm (fixed overlay)
//  - StudentProfileSheet slide-in panel for per-student actions
//  - Optimistic archive / restore
//  - Error banner on fetch failure
// ---------------------------------------------------------------------------

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Plus, AlertCircle, X, RefreshCw, Loader2 } from "lucide-react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { VirtualDataTable, type ColumnDef } from "@/components/ui/VirtualDataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAuthStore } from "@/store/authStore";
import { useInfiniteStudents } from "@/modules/students/hooks/useInfiniteStudents";
import { updateStudent } from "@/services/student.service";
import { StudentProfileSheet } from "@/modules/students/components/StudentProfileSheet";
import { AdmissionForm } from "@/modules/students/components/AdmissionForm";
import BulkImportModal from "@/modules/students/components/BulkImportModal";
import { AssignFeeModal } from "@/modules/fees/components/AssignFeeModal";
import { getFeeStructures } from "@/services/fee.service";
import { getInitials, formatDate } from "@/utils/helpers";
import type { Student, StudentStatus, StudentFilters, FeeStructure } from "@/types";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/admin/students/")({
  head: () => ({ meta: [{ title: "Students — EliteClass" }] }),
  component: StudentsPage,
});

// ── Page component ────────────────────────────────────────────────────────────

function StudentsPage() {
  const { user, isLoading: authLoading } = useAuthStore();
  const instituteId = user?.institute_id ?? null;

  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudentStatus | undefined>(undefined);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchValue), 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  const filters: StudentFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: statusFilter,
    }),
    [debouncedSearch, statusFilter],
  );

  // ── Infinite query for students ───────────────────────────────────────────
  const {
    students,
    total,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteStudents({
    instituteId,
    filters,
    pageSize: 50,
    enabled: !authLoading,
  });

  // ── Local UI state ────────────────────────────────────────────────────────
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isAssignFeeModalOpen, setIsAssignFeeModalOpen] = useState(false);
  const [isAdmitModalOpen, setIsAdmitModalOpen] = useState(false);
  const [admitMode, setAdmitMode] = useState<"manual" | "import">("manual");
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);

  useEffect(() => {
    if (!instituteId) return;
    let cancelled = false;

    async function loadFeeStructures() {
      const result = await getFeeStructures(instituteId ?? "");
      if (!cancelled && result.success && result.data) {
        setFeeStructures(result.data);
      }
    }

    loadFeeStructures();
    return () => { cancelled = true; };
  }, [instituteId]);

  // ── VirtualDataTable columns ──────────────────────────────────────────────
  const columns: ColumnDef<Student>[] = useMemo(
    () => [
      {
        key: "student",
        header: "Student",
        width: "30%",
        render: (student) => (
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground select-none"
              aria-hidden="true"
            >
              {getInitials(student.user?.name ?? "?")}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {student.user?.name ?? "—"}
              </p>
              <p className="truncate text-xs text-muted-foreground">{student.user?.email ?? "—"}</p>
            </div>
          </div>
        ),
      },
      {
        key: "admissionNo",
        header: "Admission No",
        width: "15%",
        render: (student) => (
          <span className="font-mono text-sm text-foreground">{student.admission_no}</span>
        ),
      },
      {
        key: "status",
        header: "Status",
        width: "12%",
        render: (student) => <StatusBadge status={student.status} />,
      },
      {
        key: "joined",
        header: "Joined",
        width: "15%",
        render: (student) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatDate(student.created_at)}
          </span>
        ),
      },
      {
        key: "actions",
        header: "",
        width: "120px",
        render: (student) => (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedStudent(student);
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              View
            </button>
            {student.status !== "inactive" ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleArchive(student);
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                Archive
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRestore(student);
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-950 dark:hover:text-green-400"
              >
                Restore
              </button>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const handleArchive = useCallback(
    async (student: Student) => {
      await updateStudent(student.id, { status: "inactive" });
      refetch();
    },
    [refetch],
  );

  const handleRestore = useCallback(
    async (student: Student) => {
      await updateStudent(student.id, { status: "active" });
      refetch();
    },
    [refetch],
  );

  // ── Profile sheet archive / restore toggle ────────────────────────────────
  const handleSheetArchiveToggle = useCallback(async () => {
    if (!selectedStudent) return;

    if (selectedStudent.status !== "inactive") {
      await updateStudent(selectedStudent.id, { status: "inactive" });
    } else {
      await updateStudent(selectedStudent.id, { status: "active" });
    }

    setSelectedStudent(null);
    refetch();
  }, [selectedStudent, refetch]);

  const handleAssignFee = useCallback(() => {
    setIsAssignFeeModalOpen(true);
  }, []);

  // ── Admission success ─────────────────────────────────────────────────────
  const handleAdmissionSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      {/* ── Page header ───────────────────────────────────────────────── */}
      <PageHeader
        title="Students"
        subtitle="Manage student admissions and records"
        badge={isLoading ? "— students" : `${total} students`}
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
              onClick={() => refetch()}
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
          onChange={setSearchValue}
          placeholder="Search students…"
          className="w-full sm:max-w-xs"
        />
        <select
          value={statusFilter ?? ""}
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

      {/* ── Student table with virtual scrolling ──────────────────────── */}
      <div className="mt-4">
        {isLoading && students.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading students…
          </div>
        ) : students.length === 0 && !isLoading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm font-medium text-foreground">No students found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try adjusting your search or filters, or admit a new student.
            </p>
          </div>
        ) : (
          <VirtualDataTable
            data={students}
            columns={columns}
            rowHeight={56}
            overscan={8}
            onLoadMore={() => fetchNextPage()}
            hasNextPage={hasNextPage}
            isLoading={isFetchingNextPage}
          />
        )}
      </div>

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
                  onSuccess={() => { handleAdmissionSuccess(); }}
                  onCancel={() => setIsAdmitModalOpen(false)}
                />
              ) : (
                <React.Suspense fallback={<div className="p-6">Loading…</div>}>
                  <BulkImportModal
                    instituteId={instituteId ?? ""}
                    instituteName={user?.institute_id ?? undefined}
                    onClose={() => setIsAdmitModalOpen(false)}
                    onComplete={() => refetch()}
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
