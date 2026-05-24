// ---------------------------------------------------------------------------
// EduOS — PerformanceBadge (teacher student list)
// ---------------------------------------------------------------------------

import type { TeacherStudentPerformanceStatus } from "@/types";
import { cn } from "@/lib/utils";

const CONFIG: Record<
  TeacherStudentPerformanceStatus,
  { label: string; className: string }
> = {
  excellent: {
    label: "Excellent",
    className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  },
  good: {
    label: "Good",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  },
  needs_attention: {
    label: "Needs attention",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400",
  },
  unknown: {
    label: "No data",
    className: "bg-muted text-muted-foreground",
  },
};

export function PerformanceBadge({ status }: { status: TeacherStudentPerformanceStatus }) {
  const cfg = CONFIG[status] ?? CONFIG.unknown;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}
