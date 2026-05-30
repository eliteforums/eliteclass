// ---------------------------------------------------------------------------
// RecipientSelector — Role-aware target selection for notification compose
//
// Admin: can target "all" students, a specific batch, or individual students
// Instructor (staff): can only target batches assigned to them
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Loader2, Users, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/store/authStore";
import { getActiveAttendanceBatches, getAssignableStudents } from "@/services/batch.service";
import { getStaffBatchAssignments, getStaffByUserId } from "@/services/staff.service";
import type { AttendanceBatchOption, Student, UserRole } from "@/types";

export type TargetType = "all" | "batch" | "individual";

export interface RecipientSelection {
  targetType: TargetType;
  batchId?: string;
  studentIds?: string[];
  estimatedCount: number;
}

interface RecipientSelectorProps {
  value: RecipientSelection;
  onChange: (selection: RecipientSelection) => void;
  disabled?: boolean;
}

export function RecipientSelector({ value, onChange, disabled }: RecipientSelectorProps) {
  const user = useAuthStore((s) => s.user);
  const role = user?.role as UserRole | null;
  const instituteId = user?.institute_id ?? "";

  const [batches, setBatches] = useState<AttendanceBatchOption[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Record<string, boolean>>({});

  const isAdmin = role === "admin" || role === "super_admin";
  const isInstructor = role === "staff";

  // Load batches based on role
  useEffect(() => {
    if (!instituteId) return;

    let cancelled = false;
    setIsLoadingBatches(true);

    async function loadBatches() {
      if (isAdmin) {
        const result = await getActiveAttendanceBatches(instituteId);
        if (!cancelled && result.success && result.data) {
          setBatches(result.data);
        }
      } else if (isInstructor && user?.id) {
        // Get staff record to fetch assigned batches
        const staffResult = await getStaffByUserId(user.id);
        if (!cancelled && staffResult.success && staffResult.data) {
          const assignmentsResult = await getStaffBatchAssignments(staffResult.data.id);
          if (!cancelled && assignmentsResult.success && assignmentsResult.data) {
            const assignedBatches: AttendanceBatchOption[] = assignmentsResult.data
              .filter((a) => a.batch)
              .map((a) => ({
                id: a.batch!.id,
                name: a.batch!.name,
                course_name: a.batch!.course_name ?? "General",
                label: `${a.batch!.name} • ${a.batch!.course_name ?? "General"}`,
              }));
            setBatches(assignedBatches);
          }
        }
      }
      if (!cancelled) setIsLoadingBatches(false);
    }

    loadBatches();
    return () => { cancelled = true; };
  }, [instituteId, isAdmin, isInstructor, user?.id]);

  // Load students when individual targeting is selected (admin only)
  useEffect(() => {
    if (value.targetType !== "individual" || !isAdmin || !instituteId) return;

    let cancelled = false;
    setIsLoadingStudents(true);

    async function loadStudents() {
      const result = await getAssignableStudents(instituteId, search);
      if (!cancelled && result.success && result.data) {
        setStudents(result.data);
      }
      if (!cancelled) setIsLoadingStudents(false);
    }

    loadStudents();
    return () => { cancelled = true; };
  }, [value.targetType, isAdmin, instituteId, search]);

  // Sync selected students to parent
  useEffect(() => {
    if (value.targetType === "individual") {
      const ids = Object.keys(selectedStudents).filter((id) => selectedStudents[id]);
      onChange({
        targetType: "individual",
        studentIds: ids,
        estimatedCount: ids.length,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudents]);

  function handleTargetTypeChange(newType: string) {
    const targetType = newType as TargetType;
    setSelectedStudents({});

    if (targetType === "all") {
      onChange({ targetType: "all", estimatedCount: 0 });
    } else if (targetType === "batch") {
      onChange({ targetType: "batch", batchId: undefined, estimatedCount: 0 });
    } else {
      onChange({ targetType: "individual", studentIds: [], estimatedCount: 0 });
    }
  }

  function handleBatchChange(batchId: string) {
    onChange({ targetType: "batch", batchId, estimatedCount: 0 });
  }

  function toggleStudent(studentId: string) {
    setSelectedStudents((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  }

  // Determine available target types based on role
  const targetOptions: { value: TargetType; label: string }[] = isAdmin
    ? [
        { value: "all", label: "All Students" },
        { value: "batch", label: "Specific Batch" },
        { value: "individual", label: "Individual Students" },
      ]
    : [{ value: "batch", label: "Specific Batch" }];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="target-type">Send To</Label>
        <Select
          value={value.targetType}
          onValueChange={handleTargetTypeChange}
          disabled={disabled}
        >
          <SelectTrigger id="target-type">
            <SelectValue placeholder="Select recipients" />
          </SelectTrigger>
          <SelectContent>
            {targetOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Batch selector */}
      {value.targetType === "batch" && (
        <div className="space-y-2">
          <Label htmlFor="batch-select">Select Batch</Label>
          {isLoadingBatches ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading batches...
            </div>
          ) : batches.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              {isInstructor
                ? "No batches assigned to you."
                : "No active batches found."}
            </p>
          ) : (
            <Select
              value={value.batchId ?? ""}
              onValueChange={handleBatchChange}
              disabled={disabled}
            >
              <SelectTrigger id="batch-select">
                <SelectValue placeholder="Choose a batch" />
              </SelectTrigger>
              <SelectContent>
                {batches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {batch.name} • {batch.course_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Individual student selector (admin only) */}
      {value.targetType === "individual" && isAdmin && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search students by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              disabled={disabled}
            />
          </div>

          <div className="border rounded-lg max-h-48 overflow-y-auto">
            {isLoadingStudents ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm">Loading students...</span>
              </div>
            ) : students.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                <Users className="h-6 w-6 opacity-30 mb-1" />
                <span className="text-sm">No students found</span>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {students.slice(0, 50).map((student) => (
                  <label
                    key={student.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={!!selectedStudents[student.id]}
                      onCheckedChange={() => toggleStudent(student.id)}
                      disabled={disabled}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {student.user?.name ?? "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {student.user?.email ?? ""}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {Object.values(selectedStudents).filter(Boolean).length > 0 && (
            <p className="text-xs text-muted-foreground">
              {Object.values(selectedStudents).filter(Boolean).length} student(s) selected
            </p>
          )}
        </div>
      )}
    </div>
  );
}
