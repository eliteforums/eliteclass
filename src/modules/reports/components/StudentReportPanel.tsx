// ---------------------------------------------------------------------------
// StudentReportPanel — shared report-card UI for admin/staff/student
// ---------------------------------------------------------------------------
//
// Admin/staff: pass `canEdit={true}` + a `studentId` to view, add, edit and
// delete reports for that student.
//
// Student: pass `canEdit={false}` + their own `studentId` to view only.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Plus,
  Pencil,
  Trash2,
  FileText,
  Loader2,
  AlertCircle,
  X,
  Award,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

import {
  createStudentReport,
  updateStudentReport,
  deleteStudentReport,
  listReportsByStudent,
  computeReportTotals,
  type ReportEntry,
  type StudentReport,
} from "@/services/studentReports.service";

interface StudentReportPanelProps {
  studentId: string;
  instituteId: string;
  canEdit: boolean;
  /** Used in the dialog title — defaults to "Student" */
  studentName?: string;
}

const TASK_TYPES = [
  "Test",
  "Assignment",
  "Project",
  "Quiz",
  "Practical",
  "Participation",
  "Mid-Term",
  "Final",
  "Other",
];

const emptyEntry = (): ReportEntry => ({
  subject: "",
  task_type: "Test",
  task_name: "",
  marks_obtained: 0,
  max_marks: 100,
  remark: "",
});

export function StudentReportPanel({
  studentId,
  instituteId,
  canEdit,
  studentName,
}: StudentReportPanelProps) {
  const user = useAuthStore((s) => s.user);
  const [reports, setReports] = useState<StudentReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [editingReport, setEditingReport] = useState<StudentReport | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState("");
  const [entries, setEntries] = useState<ReportEntry[]>([emptyEntry()]);
  const [overallRemark, setOverallRemark] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = async () => {
    setIsLoading(true);
    const res = await listReportsByStudent(studentId);
    if (res.success && res.data) {
      setReports(res.data);
      setError(null);
    } else {
      setError(res.error ?? "Failed to load reports");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  // ── Form management ─────────────────────────────────────────────────────

  const resetForm = () => {
    setEditingReport(null);
    setTitle("");
    setPeriod("");
    setEntries([emptyEntry()]);
    setOverallRemark("");
  };

  const openCreateForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditForm = (report: StudentReport) => {
    setEditingReport(report);
    setTitle(report.title);
    setPeriod(report.period ?? "");
    setEntries(
      report.entries.length > 0
        ? report.entries.map((e) => ({ ...e, remark: e.remark ?? "" }))
        : [emptyEntry()],
    );
    setOverallRemark(report.overall_remark ?? "");
    setIsFormOpen(true);
  };

  const addEntry = () => setEntries((prev) => [...prev, emptyEntry()]);

  const removeEntry = (idx: number) =>
    setEntries((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const updateEntry = (idx: number, patch: Partial<ReportEntry>) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  const handleSubmit = async () => {
    if (!user) return;
    setIsSubmitting(true);
    const payload = {
      institute_id: instituteId,
      student_id: studentId,
      title,
      period: period || null,
      entries: entries.map((e) => ({
        ...e,
        marks_obtained: Number(e.marks_obtained) || 0,
        max_marks: Number(e.max_marks) || 0,
      })),
      overall_remark: overallRemark,
      created_by: user.id,
    };
    const res = editingReport
      ? await updateStudentReport(editingReport.id, {
          title: payload.title,
          period: payload.period,
          entries: payload.entries,
          overall_remark: payload.overall_remark,
        })
      : await createStudentReport(payload);
    setIsSubmitting(false);
    if (res.success) {
      toast.success(editingReport ? "Report updated" : "Report added");
      setIsFormOpen(false);
      resetForm();
      refresh();
    } else {
      toast.error(res.error ?? "Failed to save report");
    }
  };

  const handleDelete = async (report: StudentReport) => {
    if (!window.confirm(`Delete report "${report.title}"? This cannot be undone.`)) return;
    const res = await deleteStudentReport(report.id);
    if (res.success) {
      toast.success("Report deleted");
      refresh();
    } else {
      toast.error(res.error ?? "Failed to delete report");
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Manual Reports
          </h2>
          <p className="text-xs text-muted-foreground">
            Detailed marks across tasks and subjects added by staff/admin.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreateForm}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Report
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading reports…
        </div>
      )}

      {!isLoading && error && (
        <div className="flex items-center gap-2 py-6 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {!isLoading && !error && reports.length === 0 && (
        <div className="rounded-md border border-dashed py-10 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm font-medium text-muted-foreground">No reports yet</p>
          {canEdit && (
            <p className="text-xs text-muted-foreground mt-1">
              Click "Add Report" to create the first one.
            </p>
          )}
        </div>
      )}

      {!isLoading && !error && reports.length > 0 && (
        <div className="space-y-4">
          {reports.map((report) => {
            const totals = computeReportTotals(report.entries);
            return (
              <Card key={report.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{report.title}</CardTitle>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {report.period && (
                          <span className="inline-flex items-center gap-1">
                            <Badge variant="outline">{report.period}</Badge>
                          </span>
                        )}
                        <span>
                          {format(new Date(report.created_at), "MMM d, yyyy")}
                        </span>
                        {report.created_by_name && (
                          <span>by {report.created_by_name}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        className={cn(
                          "text-sm font-bold",
                          totals.percentage >= 60
                            ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                            : totals.percentage >= 40
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
                        )}
                      >
                        <Award className="h-3 w-3 mr-1" />
                        {totals.total} / {totals.max} ({totals.percentage.toFixed(1)}%)
                      </Badge>
                      {canEdit && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openEditForm(report)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(report)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Subject</th>
                          <th className="text-left px-3 py-2 font-medium">Type</th>
                          <th className="text-left px-3 py-2 font-medium">Task</th>
                          <th className="text-right px-3 py-2 font-medium">Marks</th>
                          <th className="text-left px-3 py-2 font-medium">Remark</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.entries.map((entry, idx) => {
                          const pct =
                            entry.max_marks > 0
                              ? (entry.marks_obtained / entry.max_marks) * 100
                              : 0;
                          return (
                            <tr key={idx} className="border-t">
                              <td className="px-3 py-2 font-medium">{entry.subject}</td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="text-xs">
                                  {entry.task_type}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {entry.task_name}
                              </td>
                              <td
                                className={cn(
                                  "px-3 py-2 text-right font-semibold tabular-nums",
                                  pct >= 60
                                    ? "text-green-600"
                                    : pct >= 40
                                      ? "text-amber-600"
                                      : "text-red-600",
                                )}
                              >
                                {entry.marks_obtained} / {entry.max_marks}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground text-xs">
                                {entry.remark || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {report.overall_remark && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-primary mb-1">
                        Overall remark
                      </p>
                      <p className="text-sm">{report.overall_remark}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Form dialog */}
      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (!isSubmitting) {
              setIsFormOpen(false);
              resetForm();
            }
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingReport ? "Edit Report" : "Add Report"}
              {studentName && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  for {studentName}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Add detailed marks across subjects and tasks. Click "Add Entry" for more rows.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="report-title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="report-title"
                  placeholder="Mid-Term Report 2025"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="report-period">Period</Label>
                <Input
                  id="report-period"
                  placeholder="e.g. Q1 2025, Sem 1"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  Entries <span className="text-destructive">*</span>
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addEntry}
                  disabled={isSubmitting}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Entry
                </Button>
              </div>
              <div className="space-y-2">
                {entries.map((entry, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border p-3 space-y-2 bg-muted/20"
                  >
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Entry #{idx + 1}</span>
                      {entries.length > 1 && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => removeEntry(idx)}
                          disabled={isSubmitting}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        placeholder="Subject (e.g. Mathematics)"
                        value={entry.subject}
                        onChange={(e) => updateEntry(idx, { subject: e.target.value })}
                        disabled={isSubmitting}
                      />
                      <select
                        value={entry.task_type}
                        onChange={(e) => updateEntry(idx, { task_type: e.target.value })}
                        disabled={isSubmitting}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {TASK_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Input
                      placeholder="Task name (e.g. Unit Test 1)"
                      value={entry.task_name}
                      onChange={(e) => updateEntry(idx, { task_name: e.target.value })}
                      disabled={isSubmitting}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Marks Obtained</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.5"
                          value={entry.marks_obtained}
                          onChange={(e) =>
                            updateEntry(idx, { marks_obtained: Number(e.target.value) })
                          }
                          disabled={isSubmitting}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max Marks</Label>
                        <Input
                          type="number"
                          min={1}
                          step="0.5"
                          value={entry.max_marks}
                          onChange={(e) =>
                            updateEntry(idx, { max_marks: Number(e.target.value) })
                          }
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>
                    <Input
                      placeholder="Remark (optional)"
                      value={entry.remark ?? ""}
                      onChange={(e) => updateEntry(idx, { remark: e.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="overall-remark">Overall Remark</Label>
              <Textarea
                id="overall-remark"
                placeholder="Optional summary, feedback, or recommendations…"
                rows={3}
                value={overallRemark}
                onChange={(e) => setOverallRemark(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!isSubmitting) {
                  setIsFormOpen(false);
                  resetForm();
                }
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving…
                </>
              ) : editingReport ? (
                "Update Report"
              ) : (
                "Add Report"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
