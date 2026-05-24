// ---------------------------------------------------------------------------
// EnrollmentManager — Dialog to enroll students or a batch into a course.
//
// Two tabs:
//   "By Student" — searchable checkbox list of institute students
//   "By Batch"   — single batch selector
//
// Uses useEnrollStudents() and useEnrollBatch() mutations.
// Direct Supabase queries are used for the student/batch dropdowns because
// there are no dedicated hooks for those resource lists yet.
// ---------------------------------------------------------------------------

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { Search, Users, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useEnrollStudents, useEnrollBatch } from "@/modules/courses/hooks/useEnrollment";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

// ── Local types ───────────────────────────────────────────────────────────────

interface StudentRow {
  id: string;
  user_id: string;
  admission_no: string;
  users: { name: string; email: string } | null;
}

interface BatchRow {
  id: string;
  name: string;
  academic_year: string;
  course_name: string | null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface EnrollmentManagerProps {
  courseId: string;
  open: boolean;
  onClose: () => void;
  instituteId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EnrollmentManager({
  courseId,
  open,
  onClose,
  instituteId,
}: EnrollmentManagerProps) {
  const { user } = useAuthStore();

  // ── Remote data ─────────────────────────────────────────────────────────
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!open || !supabase || !instituteId) return;

    setLoadingData(true);

    const fetchStudents = supabase
      .from("students")
      .select("id, user_id, admission_no, users!inner(name, email)")
      .eq("institute_id", instituteId)
      .eq("status", "active")
      .order("admission_no", { ascending: true })
      .then(({ data }) => setStudents((data as unknown as StudentRow[]) ?? []));

    const fetchBatches = supabase
      .from("batches")
      .select("id, name, academic_year, course_name")
      .eq("institute_id", instituteId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .then(({ data }) => setBatches((data as BatchRow[]) ?? []));

    Promise.all([fetchStudents, fetchBatches]).finally(() => setLoadingData(false));
  }, [open, instituteId]);

  // ── "By Student" tab state ───────────────────────────────────────────────
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.toLowerCase().trim();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.users?.name.toLowerCase().includes(q) ||
        s.users?.email.toLowerCase().includes(q) ||
        s.admission_no.toLowerCase().includes(q),
    );
  }, [students, studentSearch]);

  const toggleStudent = (userId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const toggleAll = () => {
    const allFiltered = filteredStudents.map((s) => s.user_id);
    const allSelected = allFiltered.every((id) => selectedStudentIds.includes(id));
    if (allSelected) {
      setSelectedStudentIds((prev) => prev.filter((id) => !allFiltered.includes(id)));
    } else {
      setSelectedStudentIds((prev) => Array.from(new Set([...prev, ...allFiltered])));
    }
  };

  const allFilteredSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every((s) => selectedStudentIds.includes(s.user_id));

  // ── "By Batch" tab state ─────────────────────────────────────────────────
  const [selectedBatchId, setSelectedBatchId] = useState("");

  // ── Mutations ────────────────────────────────────────────────────────────
  const { mutate: enrollStudents, isPending: enrollingStudents } = useEnrollStudents();
  const { mutate: enrollBatch, isPending: enrollingBatch } = useEnrollBatch();

  const handleClose = () => {
    setStudentSearch("");
    setSelectedStudentIds([]);
    setSelectedBatchId("");
    onClose();
  };

  const handleEnrollStudents = () => {
    if (selectedStudentIds.length === 0) return;
    enrollStudents(
      {
        payload: { course_id: courseId, student_ids: selectedStudentIds },
        enrolledBy: user?.id ?? "",
      },
      {
        onSuccess: () => {
          toast.success(
            `${selectedStudentIds.length} student${selectedStudentIds.length !== 1 ? "s" : ""} enrolled successfully`,
          );
          handleClose();
        },
        onError: (err: Error) => toast.error(err.message ?? "Failed to enroll students"),
      },
    );
  };

  const handleEnrollBatch = () => {
    if (!selectedBatchId) return;
    enrollBatch(
      {
        courseId,
        batchId: selectedBatchId,
        enrolledBy: user?.id ?? "",
      },
      {
        onSuccess: () => {
          toast.success("Batch enrolled successfully");
          handleClose();
        },
        onError: (err: Error) => toast.error(err.message ?? "Failed to enroll batch"),
      },
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Enroll Students
          </DialogTitle>
          <DialogDescription>
            Choose to enroll individual students or an entire batch into this course.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="student" className="mt-1">
          <TabsList className="w-full">
            <TabsTrigger value="student" className="flex-1">
              By Student
            </TabsTrigger>
            <TabsTrigger value="batch" className="flex-1">
              By Batch
            </TabsTrigger>
          </TabsList>

          {/* ── By Student tab ────────────────────────────────────────────── */}
          <TabsContent value="student" className="mt-4 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search by name, email, or admission no..."
                className="pl-9"
              />
            </div>

            {/* Select all row */}
            {filteredStudents.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  id="select-all"
                  checked={allFilteredSelected}
                  onCheckedChange={toggleAll}
                />
                <label
                  htmlFor="select-all"
                  className="text-xs text-muted-foreground cursor-pointer"
                >
                  Select all {filteredStudents.length > 0 ? `(${filteredStudents.length})` : ""}
                </label>
                {selectedStudentIds.length > 0 && (
                  <span className="ml-auto text-xs font-medium text-primary">
                    {selectedStudentIds.length} selected
                  </span>
                )}
              </div>
            )}

            {/* Student list */}
            {loadingData ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading students…
              </div>
            ) : filteredStudents.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {studentSearch ? "No students match your search." : "No active students found."}
              </p>
            ) : (
              <ScrollArea className="h-60 rounded-md border">
                <div className="divide-y divide-border">
                  {filteredStudents.map((student) => {
                    const isSelected = selectedStudentIds.includes(student.user_id);
                    return (
                      <button
                        key={student.id}
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
                        onClick={() => toggleStudent(student.user_id)}
                        aria-pressed={isSelected}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleStudent(student.user_id)}
                          onClick={(e) => e.stopPropagation()}
                          tabIndex={-1}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {student.users?.name ?? "—"}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {student.admission_no}
                            {student.users?.email ? ` · ${student.users.email}` : ""}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={enrollingStudents}>
                Cancel
              </Button>
              <Button
                onClick={handleEnrollStudents}
                disabled={selectedStudentIds.length === 0 || enrollingStudents}
              >
                {enrollingStudents && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enroll{" "}
                {selectedStudentIds.length > 0
                  ? `${selectedStudentIds.length} Student${selectedStudentIds.length !== 1 ? "s" : ""}`
                  : "Students"}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* ── By Batch tab ──────────────────────────────────────────────── */}
          <TabsContent value="batch" className="mt-4 space-y-4">
            {loadingData ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading batches…
              </div>
            ) : batches.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No batches found for this institute.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Select a batch to enroll all active students in that batch into this course.
                  Students already enrolled will be silently skipped.
                </p>
                <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                  <SelectTrigger aria-label="Select batch">
                    <SelectValue placeholder="Select a batch…" />
                  </SelectTrigger>
                  <SelectContent>
                    {batches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        <div className="flex flex-col py-0.5">
                          <span className="font-medium">{batch.name}</span>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-tight">
                            {batch.academic_year} • {batch.course_name || "General"}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={enrollingBatch}>
                Cancel
              </Button>
              <Button
                onClick={handleEnrollBatch}
                disabled={!selectedBatchId || enrollingBatch || batches.length === 0}
              >
                {enrollingBatch && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enroll Batch
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
