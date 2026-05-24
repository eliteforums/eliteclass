// ---------------------------------------------------------------------------
// EduOS — AttendanceMarkingTable
//
// The core attendance-marking UI. Renders a session header, bulk-action
// buttons, a per-student status/notes table, a live summary footer, and
// a "Save Attendance" button.
//
// STATE MODEL
//   Local state holds a Map<studentId, { status, notes }> that is initialised
//   from `existingRecords` on mount and whenever the session changes.
//   Mutating the map produces a new Map reference so React re-renders correctly.
//
// LOCKING
//   When `isLocked` is true every input and button is disabled and a
//   prominent "Session locked" badge is shown in the header.
//
// COLOR CODING (status pills)
//   Present → green   (bg-green-100  text-green-700)
//   Absent  → red     (bg-red-100    text-red-700)
//   Late    → yellow  (bg-yellow-100 text-yellow-700)
//   Leave   → blue    (bg-blue-100   text-blue-700)
// ---------------------------------------------------------------------------

import { useState, useEffect, useMemo } from "react";
import { CheckCircle2, XCircle, Lock, Loader2, Save, Users } from "lucide-react";

import { formatDate } from "@/utils/helpers";
import type {
  AttendanceSession,
  AttendanceRecord,
  AttendanceStatus,
  BulkAttendanceEntry,
  Student,
} from "@/types";

// ── Style constants ───────────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttendanceEntry {
  status: AttendanceStatus;
  notes: string;
}

interface AttendanceMarkingTableProps {
  /** The session being marked. Drives the header display. */
  session: AttendanceSession;
  /** All students enrolled in the session's batch. */
  students: Student[];
  /** Pre-existing records for this session (may be empty for a fresh session). */
  existingRecords: AttendanceRecord[];
  /** True while the parent is fetching students/records. */
  isLoading: boolean;
  /** Called when the user clicks "Save Attendance". */
  onSave: (records: BulkAttendanceEntry[]) => Promise<boolean>;
  /** True while the save operation is in flight. */
  isSaving: boolean;
  /** When true, all inputs are disabled and a locked badge is shown. */
  isLocked: boolean;
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "leave", label: "Leave" },
];

function statusPillClass(status: AttendanceStatus): string {
  switch (status) {
    case "present":
      return "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400";
    case "absent":
      return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400";
    case "late":
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400";
    case "leave":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400";
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

/** Build a fresh attendance Map from the existing records + student list. */
function buildInitialMap(
  students: Student[],
  existingRecords: AttendanceRecord[],
): Map<string, AttendanceEntry> {
  const map = new Map<string, AttendanceEntry>();

  // Seed from existing records first (preserves prior partial saves).
  for (const record of existingRecords) {
    map.set(record.student_id, {
      status: record.status,
      notes: record.notes ?? "",
    });
  }

  // Fill in any students not yet in the records with a "present" default.
  for (const student of students) {
    if (!map.has(student.id)) {
      map.set(student.id, { status: "present", notes: "" });
    }
  }

  return map;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * `AttendanceMarkingTable` — marks attendance for every student in a session.
 *
 * Renders:
 *  1. Session info header  — batch, date, type, topic, lock status
 *  2. Bulk-action buttons  — "Mark All Present" / "Mark All Absent"
 *  3. Student table        — # | Name | Admission No | Status | Notes
 *  4. Summary footer       — live count of each status
 *  5. Save button          — flushes local state via `onSave`
 */
export function AttendanceMarkingTable({
  session,
  students,
  existingRecords,
  isLoading,
  onSave,
  isSaving,
  isLocked,
}: AttendanceMarkingTableProps) {
  // ── Local attendance state ────────────────────────────────────────────────
  const [attendance, setAttendance] = useState<Map<string, AttendanceEntry>>(() =>
    buildInitialMap(students, existingRecords),
  );
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  // Re-initialise whenever the session or its pre-existing records change
  // (e.g. user switches from one session to another).
  useEffect(() => {
    if (hasPendingChanges) return;
    setAttendance(buildInitialMap(students, existingRecords));
  }, [students, existingRecords, hasPendingChanges]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function updateEntry(studentId: string, field: keyof AttendanceEntry, value: string) {
    setHasPendingChanges(true);
    setAttendance((prev) => {
      const next = new Map(prev);
      const current = next.get(studentId) ?? {
        status: "present" as AttendanceStatus,
        notes: "",
      };
      next.set(studentId, { ...current, [field]: value });
      return next;
    });
  }

  function markAll(status: AttendanceStatus) {
    setHasPendingChanges(true);
    setAttendance((prev) => {
      const next = new Map(prev);
      for (const [id, entry] of next) {
        next.set(id, { ...entry, status });
      }
      return next;
    });
  }

  async function handleSave() {
    const records: BulkAttendanceEntry[] = students.map((s) => {
      const entry = attendance.get(s.id) ?? {
        status: "present" as AttendanceStatus,
        notes: "",
      };
      return {
        student_id: s.id,
        status: entry.status,
        notes: entry.notes || undefined,
      };
    });
    const saved = await onSave(records);
    if (saved) {
      setHasPendingChanges(false);
    }
  }

  // ── Derived summary ───────────────────────────────────────────────────────
  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;

    for (const { status } of attendance.values()) {
      if (status === "present") present++;
      else if (status === "absent") absent++;
      else if (status === "late") late++;
      else if (status === "leave") leave++;
    }

    return { present, absent, late, leave };
  }, [attendance]);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading students…</p>
        </div>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-card p-8 text-center">
        <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">No students in this batch</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Assign students to the batch before marking attendance.
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mt-4 rounded-xl border border-border bg-card overflow-hidden">
      {/* ── Session info header ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-b border-border bg-muted/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {session.batch?.name ?? "Unknown Batch"}
            </h3>
            {/* Session type badge */}
            <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground capitalize">
              {session.session_type}
            </span>
            {/* Locked badge */}
            {isLocked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                <Lock className="h-3 w-3" aria-hidden="true" />
                Session locked
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(session.session_date)}
            {session.topic ? ` · ${session.topic}` : ""}
          </p>
        </div>

        {/* Bulk action buttons */}
        {!isLocked && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => markAll("present")}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40 disabled:opacity-50 dark:border-green-800 dark:bg-green-950 dark:text-green-400 dark:hover:bg-green-900"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Mark All Present
            </button>
            <button
              type="button"
              onClick={() => markAll("absent")}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-50 dark:border-red-800 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Mark All Absent
            </button>
          </div>
        )}
      </div>

      {/* ── Student table ──────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-10">
                #
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Student
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Admission No
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-36">
                Status
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {students.map((student, index) => {
              const entry = attendance.get(student.id) ?? {
                status: "present" as AttendanceStatus,
                notes: "",
              };

              return (
                <tr key={student.id} className="transition-colors hover:bg-muted/20">
                  {/* # */}
                  <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                    {index + 1}
                  </td>

                  {/* Student name */}
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{student.user?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{student.user?.email ?? ""}</p>
                  </td>

                  {/* Admission No */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-foreground">
                      {student.admission_no}
                    </span>
                  </td>

                  {/* Status selector */}
                  <td className="px-4 py-3">
                    <div className="relative">
                      <select
                        aria-label={`Attendance status for ${student.user?.name ?? "student"}`}
                        value={entry.status}
                        onChange={(e) => updateEntry(student.id, "status", e.target.value)}
                        disabled={isLocked || isSaving}
                        className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-medium outline-none transition focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 ${statusPillClass(entry.status)} border-transparent`}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>

                  {/* Notes */}
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      aria-label={`Notes for ${student.user?.name ?? "student"}`}
                      value={entry.notes}
                      onChange={(e) => updateEntry(student.id, "notes", e.target.value)}
                      placeholder="Optional note"
                      disabled={isLocked || isSaving}
                      className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Summary + Save footer ──────────────────────────────────────── */}
      <div className="flex flex-col gap-4 border-t border-border bg-muted/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Live summary counts */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Summary:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-400">
            {summary.present} Present
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
            {summary.absent} Absent
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400">
            {summary.late} Late
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-400">
            {summary.leave} Leave
          </span>
        </div>

        {/* Save button (hidden when locked) */}
        {!isLocked && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" aria-hidden="true" />
                Save Attendance
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
