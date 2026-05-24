// ---------------------------------------------------------------------------
// EduOS — StudentTable
//
// Renders the student list using the generic DataTable component.
// Each column is typed to Student so `render` functions have full autocomplete.
// Actions (View / Archive / Restore) bubble up to the parent via callbacks.
// ---------------------------------------------------------------------------

import * as React from "react";
import { Eye, Archive, RotateCcw, GraduationCap } from "lucide-react";

import type { Student } from "@/types";
import { getInitials, formatDate } from "@/utils/helpers";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";

// ── Props ─────────────────────────────────────────────────────────────────────

interface StudentTableProps {
  students: Student[];
  isLoading: boolean;
  onView: (student: Student) => void;
  onArchive: (student: Student) => void;
  onRestore: (student: Student) => void;
}

// ── Columns ───────────────────────────────────────────────────────────────────

/**
 * Build typed column definitions.
 * Callbacks are passed in so they have access to the parent component's
 * scope (toast notifications, modal state, etc.) without prop drilling.
 */
function buildColumns(
  onView: StudentTableProps["onView"],
  onArchive: StudentTableProps["onArchive"],
  onRestore: StudentTableProps["onRestore"],
): DataTableColumn<Student>[] {
  return [
    // ── 1. Student (avatar + name + email) ──────────────────────────────────
    {
      key: "student",
      header: "Student",
      render: (student) => (
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar — initials circle */}
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground select-none"
            aria-hidden="true"
          >
            {getInitials(student.user?.name ?? "?")}
          </div>
          {/* Name + email */}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {student.user?.name ?? "—"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{student.user?.email ?? "—"}</p>
          </div>
        </div>
      ),
    },

    // ── 2. Admission Number ───────────────────────────────────────────────────
    {
      key: "admissionNo",
      header: "Admission No",
      render: (student) => (
        <span className="font-mono text-sm text-foreground">{student.admission_no}</span>
      ),
    },

    // ── 3. Batch ─────────────────────────────────────────────────────────────
    {
      key: "batch",
      header: "Batch",
      render: (student) => (
        <span className="text-sm text-muted-foreground">{student.batch_id ?? "—"}</span>
      ),
    },

    // ── 4. Status ────────────────────────────────────────────────────────────
    {
      key: "status",
      header: "Status",
      render: (student) => <StatusBadge status={student.status} />,
    },

    // ── 5. Joined date ────────────────────────────────────────────────────────
    {
      key: "joined",
      header: "Joined",
      render: (student) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(student.created_at)}
        </span>
      ),
    },

    // ── 6. Actions ────────────────────────────────────────────────────────────
    {
      key: "actions",
      header: "",
      headerClassName: "w-px",
      cellClassName: "text-right",
      render: (student) => (
        <div className="flex items-center justify-end gap-1">
          {/* View */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onView(student);
            }}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label={`View ${student.user?.name ?? "student"}`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            View
          </button>

          {/* Archive / Restore toggle */}
          {student.status !== "inactive" ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onArchive(student);
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
              aria-label={`Archive ${student.user?.name ?? "student"}`}
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              Archive
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRestore(student);
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-950 dark:hover:text-green-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40"
              aria-label={`Restore ${student.user?.name ?? "student"}`}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Restore
            </button>
          )}
        </div>
      ),
    },
  ];
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * `StudentTable` — the primary student list table.
 *
 * Renders loading skeletons while data is being fetched, shows an empty state
 * when no students match the current filters, and renders action buttons for
 * viewing, archiving, and restoring each student.
 *
 * Columns:
 *  1. Name (avatar initials + email)
 *  2. Admission No
 *  3. Batch
 *  4. Status (StatusBadge)
 *  5. Joined date
 *  6. Actions (View / Archive or Restore)
 */
function StudentTableInner({
  students,
  isLoading,
  onView,
  onArchive,
  onRestore,
}: StudentTableProps) {
  // Memoised so column definitions are stable across re-renders that don't
  // change the callbacks (useCallback in the parent is sufficient for this).
  const columns = React.useMemo(
    () => buildColumns(onView, onArchive, onRestore),
    [onView, onArchive, onRestore],
  );

  return (
    <DataTable
      columns={columns}
      data={students}
      isLoading={isLoading}
      loadingRows={6}
      keyExtractor={(s) => s.id}
      emptyState={
        <EmptyState
          icon={<GraduationCap />}
          title="No students found"
          description="Try adjusting your search or filters, or admit a new student."
        />
      }
    />
  );
}

export const StudentTable = React.memo(StudentTableInner);
