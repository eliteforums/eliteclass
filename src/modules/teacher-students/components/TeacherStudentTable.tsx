// ---------------------------------------------------------------------------
// EduOS — TeacherStudentTable (read-only list for staff)
// ---------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import type { TeacherStudentListItem } from "@/types";
import { getInitials } from "@/utils/helpers";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PerformanceBadge } from "./PerformanceBadge";

interface TeacherStudentTableProps {
  students: TeacherStudentListItem[];
  isLoading: boolean;
}

function buildColumns(): DataTableColumn<TeacherStudentListItem>[] {
  return [
    {
      key: "student",
      header: "Student",
      render: (row) => (
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            aria-hidden="true"
          >
            {row.avatar_url ? (
              <img src={row.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              getInitials(row.name)
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.email ?? "—"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "admission_no",
      header: "Roll / Adm. No",
      render: (row) => (
        <span className="font-mono text-sm text-foreground">{row.admission_no}</span>
      ),
    },
    {
      key: "batch",
      header: "Class / Batch",
      render: (row) => (
        <span className="text-sm text-muted-foreground">{row.batch_name ?? "—"}</span>
      ),
    },
    {
      key: "attendance",
      header: "Attendance",
      render: (row) => (
        <span className="text-sm font-medium tabular-nums text-foreground">
          {row.attendance_rate}%
        </span>
      ),
    },
    {
      key: "performance",
      header: "Performance",
      render: (row) => <PerformanceBadge status={row.performance_status} />,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} size="sm" />,
    },
    {
      key: "contact",
      header: "Contact",
      render: (row) => (
        <span className="text-xs text-muted-foreground">{row.phone ?? "—"}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Link
          to="/dashboard/staff/students/$studentId"
          params={{ studentId: row.id }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
          aria-label={`View ${row.name}`}
        >
          <Eye className="h-4 w-4" />
        </Link>
      ),
    },
  ];
}

export function TeacherStudentTable({ students, isLoading }: TeacherStudentTableProps) {
  const columns = buildColumns();

  if (!isLoading && students.length === 0) {
    return (
      <EmptyState
        title="No students found"
        description="Students appear here when they are enrolled in your assigned batches or classes."
      />
    );
  }

  return <DataTable columns={columns} data={students} isLoading={isLoading} keyExtractor={(s) => s.id} />;
}
