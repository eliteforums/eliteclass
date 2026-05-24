import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X, Users, BookOpen, CheckCircle2, Info, Plus } from "lucide-react";
import { getAssignableStudents, getActiveAttendanceBatches, getBatchStudents } from "@/services/batch.service";
import { getInitials } from "@/utils/helpers";
import type { Student, AttendanceBatchOption } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useExamAssignees } from "../../hooks/useExams";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ExamAssigneeSelectorProps {
  isOpen: boolean;
  instituteId: string;
  examId: string;
  onClose: () => void;
  onAssign: (studentIds: string[]) => Promise<void>;
}

export function ExamAssigneeSelector({
  isOpen,
  instituteId,
  examId,
  onClose,
  onAssign,
}: ExamAssigneeSelectorProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<AttendanceBatchOption[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: existingAssignees, isLoading: isLoadingAssignees } = useExamAssignees(examId);

  // Initialize selected from existing assignees only ONCE when data arrives
  useEffect(() => {
    if (isOpen && existingAssignees?.success && existingAssignees.data && !hasInitialized && !isLoadingAssignees) {
      const initialSelected: Record<string, boolean> = {};
      existingAssignees.data.forEach((id: string) => {
        initialSelected[id] = true;
      });
      // MERGE with any manual selections made while loading
      setSelected((prev) => ({ ...initialSelected, ...prev }));
      setHasInitialized(true);
    }
  }, [existingAssignees, isLoadingAssignees, isOpen, hasInitialized]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasInitialized(false);
      setSelected({});
      setSearch("");
      setSelectedBatchId("all");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !instituteId) return;

    let cancelled = false;

    async function load() {
      // Don't show full loader if we already have students, unless searching
      if (students.length === 0 || search) {
        setIsLoading(true);
      }
      setError(null);

      const [studentResult, batchResult] = await Promise.all([
        getAssignableStudents(instituteId, search),
        getActiveAttendanceBatches(instituteId)
      ]);

      if (cancelled) return;

      if (studentResult.success && studentResult.data) {
        setStudents(studentResult.data);
      } else {
        setError(studentResult.error ?? "Failed to load students");
      }

      if (batchResult.success && batchResult.data) {
        setBatches(batchResult.data);
      }

      setIsLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, instituteId, search]);

  const filteredStudents = useMemo(() => {
    if (selectedBatchId === "all") return students;
    return students.filter(s => s.batch_id === selectedBatchId);
  }, [students, selectedBatchId]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((studentId) => selected[studentId]),
    [selected],
  );

  async function handleAssign() {
    setIsSubmitting(true);
    setError(null);

    try {
      await onAssign(selectedIds);
      toast.success("Assignments updated successfully");
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
    setSelected((prev) => {
      const newSelected = { ...prev };
      filteredStudents.forEach((s) => {
        newSelected[s.id] = true;
      });
      return newSelected;
    });
  }

  function deselectAll() {
    setSelected((prev) => {
      if (selectedBatchId === "all") {
        return {};
      }
      const newSelected = { ...prev };
      filteredStudents.forEach((s) => {
        delete newSelected[s.id];
      });
      return newSelected;
    });
  }

  const [isBatchLoading, setIsBatchLoading] = useState<string | null>(null);

  async function selectByBatch(batchId: string) {
    if (isBatchLoading) return;
    setIsBatchLoading(batchId);
    const { success, data, error } = await getBatchStudents(instituteId, batchId);
    setIsBatchLoading(null);
    
    if (!success || !data) {
      toast.error(error || "Failed to load batch students");
      return;
    }

    if (data.length === 0) {
      toast.info("No students found in this batch");
      return;
    }

    setSelected((prev) => {
      const newSelected = { ...prev };
      data.forEach(s => {
        newSelected[s.id] = true;
      });
      return newSelected;
    });
    
    toast.success(`Selected all ${data.length} students from the batch`);
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
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-card border border-border/50 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 shrink-0 border-b border-border/50 flex items-center justify-between bg-muted/20">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Assign Students to Test
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select students who should attempt this MCQ test
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-0 flex-1 flex flex-col min-h-0">
          <Tabs defaultValue="students" className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="students" className="flex items-center gap-2">
                  <Users className="h-4 w-4" /> Individual Students
                </TabsTrigger>
                <TabsTrigger value="batches" className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" /> Select by Batch
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="students" className="flex-1 flex flex-col min-h-0 p-6 pt-4 space-y-4 overflow-y-auto">
              <div className="flex gap-4 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search students..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="w-48">
                  <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by Batch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Batches</SelectItem>
                      {batches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs px-1">
                <div className="flex gap-2">
                  <Button variant="link" size="sm" className="h-auto p-0 text-primary font-bold" onClick={selectAll}>
                    Select All {selectedBatchId !== "all" ? "in Batch" : "Visible"}
                  </Button>
                  <span className="text-muted-foreground">•</span>
                  <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={deselectAll}>
                    Deselect {selectedBatchId !== "all" ? "in Batch" : "All"}
                  </Button>
                </div>
                <div className="text-muted-foreground font-medium">
                  {selectedIds.length} students selected
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden bg-background/50 flex-1 overflow-y-auto relative">
                {(isLoading || isLoadingAssignees) && students.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium">Loading students...</p>
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                    <Users className="h-10 w-10 opacity-20" />
                    <p className="text-sm font-medium">No students found</p>
                  </div>
                ) : (
                  <>
                    {(isLoading || isLoadingAssignees) && (
                      <div className="absolute top-0 inset-x-0 h-1 z-20">
                        <div className="h-full bg-primary animate-pulse w-full opacity-50" />
                      </div>
                    )}
                    <div className="divide-y divide-border/50">
                      {filteredStudents.map((student) => (
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
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="batches" className="flex-1 flex flex-col min-h-0 p-6 pt-4 space-y-4 overflow-hidden">
              <div className="text-sm text-muted-foreground bg-muted/30 p-4 rounded-lg border border-border/50 flex items-start gap-3">
                <Info className="h-4 w-4 mt-0.5 text-primary" />
                <p>Select a batch below to automatically assign all its students to this test. You can assign multiple batches.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 overflow-y-auto pr-1">
                {batches.map((batch) => {
                  const batchStudents = students.filter(s => s.batch_id === batch.id);
                  const selectedInBatch = batchStudents.filter(s => !!selected[s.id]).length;
                  const isAllSelected = batchStudents.length > 0 && selectedInBatch === batchStudents.length;
                  const isLoadingThisBatch = isBatchLoading === batch.id;

                  return (
                    <Card 
                      key={batch.id} 
                      className={cn(
                        "cursor-pointer hover:border-primary/50 transition-all relative overflow-hidden",
                        isAllSelected ? "border-primary bg-primary/5" : "border-border",
                        isLoadingThisBatch && "opacity-50 cursor-not-allowed"
                      )}
                      onClick={() => selectByBatch(batch.id)}
                    >
                      {isLoadingThisBatch && (
                        <div className="absolute inset-0 bg-background/20 flex items-center justify-center z-10">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </div>
                      )}
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="font-semibold text-sm">{batch.name}</p>
                          <p className="text-[10px] text-muted-foreground">{batch.course_name}</p>
                          <p className="text-[10px] font-medium text-primary">
                            {selectedInBatch} / {batchStudents.length} Students Selected
                          </p>
                        </div>
                        {isAllSelected ? (
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        ) : (
                          <Plus className="h-5 w-5 text-muted-foreground opacity-20" />
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>

          {error && (
            <div className="px-6 pb-2">
              <p className="text-xs text-destructive bg-destructive/5 p-2 rounded border border-destructive/20">
                {error}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 shrink-0 bg-muted/20 border-t border-border/50 flex justify-end gap-3">
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
