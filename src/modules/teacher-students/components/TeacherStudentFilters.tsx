// ---------------------------------------------------------------------------
// EduOS — TeacherStudentFilters
// ---------------------------------------------------------------------------

import { SearchInput } from "@/components/ui/SearchInput";
import type { Batch, StudentStatus, TeacherStudentsFilters } from "@/types";

interface TeacherStudentFiltersProps {
  filters: TeacherStudentsFilters;
  batches: Batch[];
  onChange: (next: Partial<TeacherStudentsFilters>) => void;
}

const STATUS_OPTIONS: { value: StudentStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
  { value: "graduated", label: "Graduated" },
];

export function TeacherStudentFilters({ filters, batches, onChange }: TeacherStudentFiltersProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex-1 min-w-[200px]">
          <SearchInput
            value={filters.search ?? ""}
            onChange={(v) => onChange({ search: v })}
            placeholder="Search by name, email, or admission no…"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:flex-wrap">
          <select
            value={filters.batchId ?? ""}
            onChange={(e) => onChange({ batchId: e.target.value || null })}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            aria-label="Filter by batch"
          >
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={filters.status ?? ""}
            onChange={(e) => onChange({ status: (e.target.value as StudentStatus) || null })}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            aria-label="Filter by status"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={filters.attendanceBand ?? "all"}
            onChange={(e) =>
              onChange({
                attendanceBand: e.target.value as TeacherStudentsFilters["attendanceBand"],
              })
            }
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            aria-label="Filter by attendance"
          >
            <option value="all">All attendance</option>
            <option value="high">85%+ attendance</option>
            <option value="medium">70–84% attendance</option>
            <option value="low">Below 70%</option>
          </select>
          <select
            value={filters.performance ?? "all"}
            onChange={(e) =>
              onChange({
                performance: e.target.value as TeacherStudentsFilters["performance"],
              })
            }
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            aria-label="Filter by performance"
          >
            <option value="all">All performance</option>
            <option value="excellent">Excellent</option>
            <option value="good">Good</option>
            <option value="needs_attention">Needs attention</option>
            <option value="unknown">No data yet</option>
          </select>
        </div>
      </div>
    </div>
  );
}
