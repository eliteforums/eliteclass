import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials, formatDate } from "@/utils/helpers";
import type { Student, StudentStatus } from "@/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface RecentTableProps {
  /** Real students fetched from Supabase (5 most recent). */
  students: Student[];
  /** While true, shows animated skeleton rows instead of real data. */
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Status badge config (mirrors StatusBadge component colours)
// ---------------------------------------------------------------------------
const statusConfig: Record<StudentStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-success/15 text-success border-success/20" },
  inactive: { label: "Inactive", className: "bg-muted text-muted-foreground border-border" },
  graduated: { label: "Graduated", className: "bg-blue-500/15 text-blue-500 border-blue-500/20" },
  suspended: {
    label: "Suspended",
    className: "bg-destructive/15 text-destructive border-destructive/20",
  },
};

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------
function SkeletonRow() {
  return (
    <tr className="border-t border-border">
      {[80, 100, 60, 55, 70].map((w, i) => (
        <td key={i} className="px-5 py-3">
          <div
            className="h-4 animate-pulse rounded bg-muted"
            style={{ width: `${w}px` }}
            aria-hidden="true"
          />
        </td>
      ))}
      <td className="px-5 py-3" />
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Empty state row
// ---------------------------------------------------------------------------
function EmptyRow() {
  return (
    <tr>
      <td colSpan={6} className="px-5 py-12 text-center">
        <p className="text-sm font-medium text-foreground">No students yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Admit your first student to see recent admissions here.
        </p>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// RecentTable
// ---------------------------------------------------------------------------
export function RecentTable({ students, isLoading = false }: RecentTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h3 className="text-sm font-semibold">Recent admissions</h3>
          <p className="text-xs text-muted-foreground">
            Latest student enrolments and their status
          </p>
        </div>
        <Link
          to="/dashboard/admin/students"
          className="text-xs text-primary hover:underline transition-colors"
        >
          View all →
        </Link>
      </div>

      {/* Table */}
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="min-w-[640px] w-full text-xs sm:min-w-full sm:text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-3 text-left font-medium">Student</th>
              <th className="px-5 py-3 text-left font-medium">Admission No</th>
              <th className="px-5 py-3 text-left font-medium">Status</th>
              <th className="px-5 py-3 text-left font-medium">Joined</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              // 5 skeleton rows while fetching
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : students.length === 0 ? (
              <EmptyRow />
            ) : (
              students.map((student) => {
                const displayName = student.user?.name ?? "Unknown";
                const email = student.user?.email ?? "";
                const status = student.status;
                const badge = statusConfig[status] ?? statusConfig.active;

                return (
                  <tr
                    key={student.id}
                    className="border-t border-border transition-colors hover:bg-muted/30"
                  >
                    {/* Name + email */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-semibold text-primary-foreground">
                          {getInitials(displayName)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{displayName}</div>
                          <div className="truncate text-xs text-muted-foreground">{email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Admission number */}
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                      {student.admission_no}
                    </td>

                    {/* Status badge */}
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    </td>

                    {/* Joined date */}
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {formatDate(student.created_at)}
                    </td>

                    {/* Action menu placeholder */}
                    <td className="px-5 py-3">
                      <button
                        aria-label="More options"
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
