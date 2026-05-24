import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import { SearchInput } from "@/components/ui/SearchInput";
import { getInitials } from "@/utils/helpers";
import { getAssignableStudents } from "@/services/batch.service";
import type { Batch, Student } from "@/types";

interface AssignStudentsModalProps {
  isOpen: boolean;
  instituteId: string;
  batch: Batch | null;
  onClose: () => void;
  onAssign: (studentIds: string[]) => Promise<{ success: boolean; error: string | null }>;
}

export function AssignStudentsModal({
  isOpen,
  instituteId,
  batch,
  onClose,
  onAssign,
}: AssignStudentsModalProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !instituteId) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      const result = await getAssignableStudents(instituteId, search);

      if (cancelled) return;

      if (result.success && result.data) {
        setStudents(result.data);
      } else {
        setStudents([]);
        setError(result.error ?? "Failed to load students");
      }

      setIsLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, instituteId, search]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((studentId) => selected[studentId]),
    [selected],
  );

  async function handleAssign() {
    if (selectedIds.length === 0) return;

    setIsSubmitting(true);
    setError(null);

    const result = await onAssign(selectedIds);

    if (!result.success) {
      setError(result.error ?? "Failed to assign students");
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setSelected({});
    onClose();
  }

  function toggle(studentId: string) {
    setSelected((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  }

  if (!isOpen || !batch) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Assign Students"
    >
      <div className="relative w-full max-w-3xl rounded-2xl bg-card p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-semibold text-foreground">Assign Students to {batch.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select one or more students and assign them in bulk.
        </p>

        <div className="mt-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name, email, or admission no..."
            className="w-full"
          />
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mt-4 max-h-[380px] overflow-y-auto rounded-xl border border-border">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading students...
            </div>
          ) : students.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No students available
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {students.map((student) => {
                const checked = !!selected[student.id];
                return (
                  <li key={student.id} className="flex items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(student.id)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {getInitials(student.user?.name ?? "?")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {student.user?.name ?? "Unknown"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {student.admission_no} • {student.user?.email ?? "No email"}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {student.batch_id ? `Current: ${student.batch_id}` : "Unassigned"}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Selected: {selectedIds.length}</p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAssign}
              disabled={isSubmitting || selectedIds.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Assign Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
