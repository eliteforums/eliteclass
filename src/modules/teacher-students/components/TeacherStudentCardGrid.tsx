// ---------------------------------------------------------------------------
// EduOS — TeacherStudentCardGrid
// ---------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { TeacherStudentListItem } from "@/types";
import { getInitials } from "@/utils/helpers";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PerformanceBadge } from "./PerformanceBadge";
import { EmptyState } from "@/components/ui/EmptyState";

interface TeacherStudentCardGridProps {
  students: TeacherStudentListItem[];
  isLoading: boolean;
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="h-2 w-32 rounded bg-muted" />
        </div>
      </div>
      <div className="h-2 w-full rounded bg-muted" />
    </div>
  );
}

export function TeacherStudentCardGrid({ students, isLoading }: TeacherStudentCardGridProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <EmptyState
        title="No students found"
        description="Try adjusting your filters or check your batch assignments."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {students.map((student) => (
        <Link
          key={student.id}
          to="/dashboard/staff/students/$studentId"
          params={{ studentId: student.id }}
          className="group rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/20"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {student.avatar_url ? (
                <img
                  src={student.avatar_url}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                getInitials(student.name)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{student.name}</p>
              <p className="truncate text-xs text-muted-foreground">{student.admission_no}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {student.batch_name ?? "Unassigned batch"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge status={student.status} size="sm" />
            <PerformanceBadge status={student.performance_status} />
            <span className="ml-auto text-xs font-medium tabular-nums text-foreground">
              {student.attendance_rate}% att.
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

