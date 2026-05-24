import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X, Check, Users } from "lucide-react";
import { getAssignableStudents } from "@/services/batch.service";
import { getInitials } from "@/utils/helpers";
import type { Student } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useAssignees } from "@/modules/assignments/hooks/useAssignments";

interface AssigneeSelectorProps {
  isOpen: boolean;
  instituteId: string;
  assignmentId: string;
  onClose: () => void;
  onAssign: (studentIds: string[]) => Promise<void>;
}

export function AssigneeSelector({
  isOpen,
  instituteId,
  assignmentId,
  onClose,
  onAssign,
}: AssigneeSelectorProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: existingAssignees, isLoading: isLoadingAssignees } = useAssignees(assignmentId);

  // Initialize selected from existing assignees
  useEffect(() => {
    if (existingAssignees?.success && existingAssignees.data) {
      const initialSelected: Record<string, boolean> = {};
      existingAssignees.data.forEach((id) => {
        initialSelected[id] = true;
      });
      setSelected(initialSelected);
    }
  }, [existingAssignees, isOpen]);

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
    setIsSubmitting(true);
    setError(null);

    try {
      await onAssign(selectedIds);
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Failed to assign students");
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggle(studentId: string) {
    setSelected((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  }

  function selectAll() {
    const allIds: Record<string, boolean> = {};
    students.forEach((s) => {
      allIds[s.id] = true;
    });
    setSelected((prev) => ({ ...prev, ...allIds }));
  }

  function deselectAll() {
    setSelected({});
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl rounded-2xl bg-card border border-border/50 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between bg-muted/20">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Assign Students
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select students who should receive this assignment
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or admission no..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs px-1">
            <div className="flex gap-2">
              <Button variant="link" size="sm" className="h-auto p-0 text-primary font-bold" onClick={selectAll}>
                Select All Visible
              </Button>
              <span className="text-muted-foreground">•</span>
              <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={deselectAll}>
                Deselect All
              </Button>
            </div>
            <div className="text-muted-foreground font-medium">
              {selectedIds.length} students selected
            </div>
          </div>

          <div className="border rounded-xl overflow-hidden bg-background/50 max-h-[400px] overflow-y-auto">
            {isLoading || isLoadingAssignees ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Loading students...</p>
              </div>
            ) : students.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                <Users className="h-10 w-10 opacity-20" />
                <p className="text-sm font-medium">No students found</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {students.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => toggle(student.id)}
                  >
                    <Checkbox
                      checked={!!selected[student.id]}
                      onCheckedChange={() => toggle(student.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs border border-primary/20">
                      {getInitials(student.user?.name ?? "?")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{student.user?.name}</span>
                        <Badge variant="outline" className="text-[10px] h-4 py-0">
                          {student.admission_no}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {student.user?.email || "No email"}
                      </p>
                    </div>
                    {student.batch?.name && (
                      <div className="hidden sm:block">
                        <Badge variant="secondary" className="text-[10px] font-medium bg-muted text-muted-foreground border-none">
                          {student.batch.name}
                        </Badge>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/5 p-2 rounded border border-destructive/20">
              {error}
            </p>
          )}
        </div>

        <div className="px-6 py-4 bg-muted/20 border-t border-border/50 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={isSubmitting || (selectedIds.length === 0 && !existingAssignees?.data?.length)}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Assignments
          </Button>
        </div>
      </div>
    </div>
  );
}
