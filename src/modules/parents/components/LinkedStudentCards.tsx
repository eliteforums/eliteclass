// ---------------------------------------------------------------------------
// EduOS — LinkedStudentCards
//
// Renders the list of students linked to a parent, used in the parent
// dashboard and in admin parent-profile views.
//
// States:
//  - Loading  → 3 animated skeleton cards
//  - Empty    → "No students linked yet." message
//  - Data     → one card per student (name, admission no, status, batch)
// ---------------------------------------------------------------------------

import * as React from "react";
import { GraduationCap } from "lucide-react";

import type { Student } from "@/types";
import { getInitials, formatDate } from "@/utils/helpers";
import { StatusBadge } from "@/components/ui/StatusBadge";

// ── Props ─────────────────────────────────────────────────────────────────────

interface LinkedStudentCardsProps {
  /** The students to display. Each item should have the joined `user` relation. */
  students: Student[];
  /** When `true` renders skeleton placeholder cards instead of data. */
  isLoading: boolean;
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

/**
 * A single animated skeleton placeholder that mirrors the layout of a real
 * student card. Shown in groups of 3 while data loads.
 */
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 animate-pulse" aria-hidden="true">
      <div className="flex items-start gap-3">
        {/* Avatar placeholder */}
        <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
        {/* Text lines */}
        <div className="flex-1 space-y-2 pt-0.5">
          <div className="h-4 w-3/4 rounded-md bg-muted" />
          <div className="h-3 w-1/2 rounded-md bg-muted" />
        </div>
        {/* Badge placeholder */}
        <div className="h-5 w-14 shrink-0 rounded-full bg-muted" />
      </div>
      {/* Batch line */}
      <div className="mt-3 h-3 w-1/3 rounded-md bg-muted" />
    </div>
  );
}

// ── Student card ──────────────────────────────────────────────────────────────

/**
 * A single student card showing name, admission number, status badge, and batch.
 */
function StudentCard({ student }: { student: Student }) {
  const name = student.user?.name ?? "Unknown Student";

  return (
    <article className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/30">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground select-none"
          aria-hidden="true"
        >
          {getInitials(name)}
        </div>

        {/* Name + admission number */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{name}</p>
          <p className="font-mono text-xs text-muted-foreground">{student.admission_no}</p>
        </div>

        {/* Status badge */}
        <StatusBadge status={student.status} size="sm" />
      </div>

      {/* Secondary info row */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {student.batch_id && (
          <span className="flex items-center gap-1">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
            {student.batch_id}
          </span>
        )}
        <span>Joined {formatDate(student.created_at)}</span>
      </div>
    </article>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * `LinkedStudentCards` — responsive card grid of students linked to a parent.
 *
 * Renders in a single column on mobile and a 2-column grid on larger screens.
 * Shows 3 skeleton cards while `isLoading` is true, and an empty-state message
 * when `students` is empty after loading.
 *
 * @example
 * ```tsx
 * <LinkedStudentCards students={students} isLoading={isLoading} />
 * ```
 */
export function LinkedStudentCards({ students, isLoading }: LinkedStudentCardsProps) {
  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2" role="status" aria-label="Loading linked students">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-muted/30 py-12 px-6 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"
          aria-hidden="true"
        >
          <GraduationCap className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">No students linked yet</p>
          <p className="text-xs text-muted-foreground">
            Students linked by an admin will appear here.
          </p>
        </div>
      </div>
    );
  }

  // ── Data state ─────────────────────────────────────────────────────────────
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="list" aria-label="Linked students">
      {students.map((student) => (
        <div key={student.id} role="listitem">
          <StudentCard student={student} />
        </div>
      ))}
    </div>
  );
}
