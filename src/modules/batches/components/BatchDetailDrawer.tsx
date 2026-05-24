import { useEffect, useState } from "react";
import { BookOpen, Calendar, Loader2, Users, X } from "lucide-react";

import { formatDate, getInitials } from "@/utils/helpers";
import { getBatchStudents, removeStudentsFromBatch } from "@/services/batch.service";
import type { Batch, Student } from "@/types";

interface BatchDetailDrawerProps {
  batch: Batch | null;
  isOpen: boolean;
  instituteId: string;
  onClose: () => void;
  onAssignStudents: () => void;
  onRefreshRequested?: () => void;
}

export function BatchDetailDrawer({
  batch,
  isOpen,
  instituteId,
  onClose,
  onAssignStudents,
  onRefreshRequested,
}: BatchDetailDrawerProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !batch || !instituteId) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      if (!batch) return;
      const result = await getBatchStudents(instituteId, batch.id);
      if (cancelled) return;

      if (result.success && result.data) {
        setStudents(result.data);
      } else {
        setStudents([]);
        setError(result.error ?? "Failed to load batch students");
      }

      setIsLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, batch, instituteId]);

  async function handleRemoveStudent(student: Student) {
    if (!batch) return;

    const result = await removeStudentsFromBatch(instituteId, batch.id, [student.id]);
    if (!result.success) {
      setError(result.error ?? "Failed to remove student from batch");
      return;
    }

    setStudents((prev) => prev.filter((s) => s.id !== student.id));
    onRefreshRequested?.();
  }

  if (!batch) return null;

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Batch details: ${batch.name}`}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">{batch.name}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {batch.batch_code} • {batch.course_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-border px-5 py-4 text-sm">
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Capacity</p>
            <p className="mt-1 font-semibold text-foreground">{batch.capacity}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="mt-1 font-semibold capitalize text-foreground">
              {batch.is_active ? "Active" : "Inactive"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">Start</p>
            <p className="mt-1 font-semibold text-foreground">
              {batch.start_date ? formatDate(batch.start_date) : "—"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">End</p>
            <p className="mt-1 font-semibold text-foreground">
              {batch.end_date ? formatDate(batch.end_date) : "—"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold text-foreground">Assigned Students</p>
          <button
            type="button"
            onClick={onAssignStudents}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Assign Students
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading students...
            </div>
          ) : students.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
              <Users className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">No students assigned</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Assign students to use this batch in attendance.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {students.map((student) => (
                <li
                  key={student.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {getInitials(student.user?.name ?? "?")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {student.user?.name ?? "Unknown"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{student.admission_no}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveStudent(student)}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Course: {batch.course_name}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Academic year: {batch.academic_year}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
