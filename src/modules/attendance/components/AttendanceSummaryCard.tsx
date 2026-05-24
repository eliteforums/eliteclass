// ---------------------------------------------------------------------------
// EduOS — AttendanceSummaryCard
//
// Displays aggregate attendance statistics for a single student.
//
// Layout:
//  ┌────────────────────────────────────────────────────────┐
//  │  [Name + admission no if showStudentName]              │
//  │  ── Large percentage circle ──  4 mini stat cells      │
//  │  ── Horizontal progress bar ──                         │
//  │  [Low attendance warning badge if percentage < 75%]    │
//  └────────────────────────────────────────────────────────┘
//
// PERCENTAGE COLOUR THRESHOLDS
//   ≥ 75% → green  (meets or exceeds the typical attendance requirement)
//   50–74% → yellow (at risk)
//   < 50%  → red    (critical)
// ---------------------------------------------------------------------------

import { AlertTriangle } from "lucide-react";

import type { AttendanceSummary } from "@/types";
import { getInitials } from "@/utils/helpers";

// Re-export for convenience so the route file can import from one place
export type { AttendanceSummary };

// ── Props ─────────────────────────────────────────────────────────────────────

interface AttendanceSummaryCardProps {
  /** The aggregated attendance stats to display. */
  summary: AttendanceSummary;
  /**
   * When true, the student's name and admission number are shown at the top
   * of the card. Useful in batch-wide reports; hide in single-student views.
   */
  showStudentName?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns Tailwind colour classes for the percentage value based on thresholds:
 *  ≥75  → green
 *  50–74 → yellow
 *  <50  → red
 */
function percentageColorClass(pct: number): string {
  if (pct >= 75) return "text-green-600 dark:text-green-400";
  if (pct >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function progressBarColorClass(pct: number): string {
  if (pct >= 75) return "bg-green-500";
  if (pct >= 50) return "bg-yellow-500";
  return "bg-red-500";
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** A single mini stat cell (label + count). */
function StatCell({
  label,
  count,
  colorClass,
}: {
  label: string;
  count: number;
  colorClass: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-background px-3 py-2 text-center">
      <span className={`text-lg font-bold tabular-nums leading-none ${colorClass}`}>{count}</span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `AttendanceSummaryCard` — displays attendance statistics for a student.
 *
 * Shows a large attendance percentage (colour-coded by threshold), four
 * mini stat cells, a progress bar, and a low-attendance warning badge when
 * the percentage falls below 75%.
 */
export function AttendanceSummaryCard({
  summary,
  showStudentName = false,
}: AttendanceSummaryCardProps) {
  const { percentage, present, absent, late, leave, total_sessions, student_name, admission_no } =
    summary;

  const isLowAttendance = percentage < 75;

  return (
    <div
      className={`rounded-xl border bg-card p-5 transition-shadow hover:shadow-md ${
        isLowAttendance ? "border-red-200 dark:border-red-800" : "border-border"
      }`}
    >
      {/* ── Student identity (optional) ───────────────────────────────── */}
      {showStudentName && student_name && (
        <div className="mb-4 flex items-center gap-3">
          {/* Avatar — uses student_name initials */}
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground select-none"
            aria-hidden="true"
          >
            {getInitials(student_name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{student_name}</p>
            <p className="truncate text-xs text-muted-foreground">{admission_no}</p>
          </div>
          {/* Low-attendance badge inline with name */}
          {isLowAttendance && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Low
            </span>
          )}
        </div>
      )}

      {/* ── Main stats row ────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        {/* Large percentage display */}
        <div className="shrink-0 text-center">
          <p
            className={`text-4xl font-bold tabular-nums leading-none ${percentageColorClass(percentage)}`}
            aria-label={`${percentage}% attendance`}
          >
            {percentage}
            <span className="text-xl">%</span>
          </p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {total_sessions} session{total_sessions !== 1 ? "s" : ""}
          </p>
        </div>

        {/* 4 mini stat cells */}
        <div className="grid flex-1 grid-cols-4 gap-1.5 sm:gap-2">
          <StatCell
            label="Present"
            count={present}
            colorClass="text-green-600 dark:text-green-400"
          />
          <StatCell label="Absent" count={absent} colorClass="text-red-600 dark:text-red-400" />
          <StatCell label="Late" count={late} colorClass="text-yellow-600 dark:text-yellow-400" />
          <StatCell label="Leave" count={leave} colorClass="text-blue-600 dark:text-blue-400" />
        </div>
      </div>

      {/* ── Progress bar ──────────────────────────────────────────────── */}
      <div className="mt-4">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${percentage}% attendance`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${progressBarColorClass(percentage)}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span className={`font-medium ${percentageColorClass(percentage)}`}>{percentage}%</span>
          <span>100%</span>
        </div>
      </div>

      {/* ── Low attendance warning ─────────────────────────────────────── */}
      {isLowAttendance && (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Attendance below 75% — student is at risk of shortage.</span>
        </div>
      )}
    </div>
  );
}
