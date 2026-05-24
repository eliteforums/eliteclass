import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  BadgeDollarSign,
  BookOpen,
  Download,
  RefreshCw,
  School,
  TrendingUp,
  Users,
  Wallet,
  CalendarDays,
  FileText,
} from "lucide-react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkedStudentCards } from "@/modules/parents/components/LinkedStudentCards";
import { useAuthStore } from "@/store/authStore";
import {
  useStudentDashboardStore,
} from "@/store/studentDashboardStore";
import { getParentFeeSummary } from "@/services/fee.service";
import { getParentPortalBootstrap, getParentChildSnapshot } from "@/services/parentPortal.service";
import type {
  Parent,
  ParentFeeSummary,
  ParentPortalChildSnapshot,
  Student,
} from "@/types";
import { SchedulePortalView } from "@/modules/schedule/components/SchedulePortalView";
import {
  getSchedulesByBatch,
  getScheduleExceptions,
} from "@/services/schedule.service";

const PARENT_DASHBOARD_TIMEOUT_MS = 15_000;

export const Route = createFileRoute("/dashboard/parent/")({
  head: () => ({ meta: [{ title: "Parent Dashboard — EduOS" }] }),
  component: ParentDashboard,
});

function ParentDashboard() {
  const { user } = useAuthStore();
  const parentChildrenCache = useStudentDashboardStore((state) => state.parentChildren);
  const selectedChildId = useStudentDashboardStore((state) => state.parentSelectedChildId);
  const setParentChildSnapshot = useStudentDashboardStore((state) => state.setParentChildSnapshot);
  const setParentSelectedChildId = useStudentDashboardStore(
    (state) => state.setParentSelectedChildId,
  );

  const [parent, setParent] = useState<Parent | null>(null);
  const [children, setChildren] = useState<Student[]>([]);
  const [feeSummary, setFeeSummary] = useState<ParentFeeSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFeeLoading, setIsFeeLoading] = useState(true);
  const [isChildLoading, setIsChildLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [childError, setChildError] = useState<string | null>(null);

  const currentChildId =
    selectedChildId && children.some((child) => child.id === selectedChildId)
      ? selectedChildId
      : children[0]?.id ?? null;
  const currentSnapshot = currentChildId ? parentChildrenCache[currentChildId] ?? null : null;
  const currentChild = children.find((child) => child.id === currentChildId) ?? null;

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadParentPortal() {
      setIsLoading(true);
      setIsFeeLoading(true);
      setError(null);
      setFeeError(null);
      setChildError(null);

      try {
        const bootstrapResult = await Promise.race([
          getParentPortalBootstrap(user.id, user.institute_id),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Parent portal load timed out.")), PARENT_DASHBOARD_TIMEOUT_MS);
          }),
        ]);

        if (cancelled) return;

        if (!bootstrapResult.success || !bootstrapResult.data) {
          setError(bootstrapResult.error ?? "Unable to load parent profile.");
          setParent(null);
          setChildren([]);
          setFeeSummary(null);
          return;
        }

        setParent(bootstrapResult.data.parent);
        setChildren(bootstrapResult.data.children);

        if (bootstrapResult.data.children.length > 0) {
          const preferredChildId =
            selectedChildId && bootstrapResult.data.children.some((child) => child.id === selectedChildId)
              ? selectedChildId
              : bootstrapResult.data.children[0].id;
          if (preferredChildId !== selectedChildId) {
            setParentSelectedChildId(preferredChildId);
          }
        } else {
          setParentSelectedChildId(null);
        }

        const feeResult = await Promise.race([
          getParentFeeSummary(bootstrapResult.data.parent.id),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Fee summary load timed out.")), PARENT_DASHBOARD_TIMEOUT_MS);
          }),
        ]);

        if (cancelled) return;

        if (feeResult.success && feeResult.data) {
          setFeeSummary(feeResult.data);
        } else {
          setFeeError(feeResult.error ?? "Failed to load fee summary.");
          setFeeSummary(null);
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load parent profile.");
        setParent(null);
        setChildren([]);
        setFeeSummary(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsFeeLoading(false);
        }
      }
    }

    void loadParentPortal();
    return () => {
      cancelled = true;
    };
  }, [setParentSelectedChildId, user]);

  useEffect(() => {
    if (!currentChildId) return;
    if (useStudentDashboardStore.getState().parentChildren[currentChildId]) return;

    let cancelled = false;

    async function loadSelectedChild() {
      setIsChildLoading(true);
      setChildError(null);

      try {
        const snapshotResult = await Promise.race([
          getParentChildSnapshot(currentChildId),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Child analytics load timed out.")), PARENT_DASHBOARD_TIMEOUT_MS);
          }),
        ]);

        if (cancelled) return;

        if (snapshotResult.success && snapshotResult.data) {
          setParentChildSnapshot(currentChildId, snapshotResult.data);
        } else {
          setChildError(snapshotResult.error ?? "Failed to load child analytics.");
        }
      } catch (loadError) {
        if (cancelled) return;
        setChildError(loadError instanceof Error ? loadError.message : "Failed to load child analytics.");
      } finally {
        if (!cancelled) {
          setIsChildLoading(false);
        }
      }
    }

    void loadSelectedChild();
    return () => {
      cancelled = true;
    };
  }, [currentChildId, setParentChildSnapshot]);

  async function refreshParentPortal() {
    if (!user) return;

    setIsLoading(true);
    setIsFeeLoading(true);
    setChildError(null);
    setFeeError(null);

    try {
      const bootstrapResult = await Promise.race([
        getParentPortalBootstrap(user.id, user.institute_id),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Parent portal refresh timed out.")), PARENT_DASHBOARD_TIMEOUT_MS);
        }),
      ]);

      if (bootstrapResult.success && bootstrapResult.data) {
        setParent(bootstrapResult.data.parent);
        setChildren(bootstrapResult.data.children);

        const feeResult = await Promise.race([
          getParentFeeSummary(bootstrapResult.data.parent.id),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Fee summary refresh timed out.")), PARENT_DASHBOARD_TIMEOUT_MS);
          }),
        ]);

        if (feeResult.success && feeResult.data) {
          setFeeSummary(feeResult.data);
        } else {
          setFeeError(feeResult.error ?? "Failed to load fee summary.");
        }

        if (currentChildId) {
          const snapshotResult = await Promise.race([
            getParentChildSnapshot(currentChildId),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error("Child analytics refresh timed out.")), PARENT_DASHBOARD_TIMEOUT_MS);
            }),
          ]);

          if (snapshotResult.success && snapshotResult.data) {
            setParentChildSnapshot(currentChildId, snapshotResult.data);
          } else {
            setChildError(snapshotResult.error ?? "Failed to refresh selected child.");
          }
        }
      } else {
        setError(bootstrapResult.error ?? "Unable to refresh parent portal.");
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh parent portal.");
    } finally {
      setIsLoading(false);
      setIsFeeLoading(false);
    }
  }

  function downloadReport(format: "json" | "csv") {
    if (!parent || !currentChild || !currentSnapshot) return;

    const filenameBase = `parent-report-${currentChild.admission_no}`;
    const generatedAt = new Date().toISOString();

    if (format === "json") {
      const payload = {
        generated_at: generatedAt,
        parent: {
          id: parent.id,
          name: parent.user?.name ?? "Parent",
          email: parent.user?.email ?? null,
          phone: parent.user?.phone ?? null,
        },
        child: {
          id: currentChild.id,
          name: currentChild.user?.name ?? "Child",
          admission_no: currentChild.admission_no,
          batch: currentSnapshot.batch,
        },
        attendance: currentSnapshot.stats,
        fees: currentSnapshot.fees,
        remarks: currentSnapshot.student_history,
        documents: currentSnapshot.documents,
        courses: currentSnapshot.courses,
        history: currentSnapshot.history,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      triggerDownload(blob, `${filenameBase}.json`);
      return;
    }

    const rows = [
      ["Child", currentChild.user?.name ?? "Child"],
      ["Admission No", currentChild.admission_no],
      ["Batch", currentSnapshot.batch?.name ?? "Unassigned"],
      ["Attendance %", String(currentSnapshot.stats.percentage)],
      ["Sessions", String(currentSnapshot.stats.total_sessions)],
      ["Pending Fees", String(calcPendingFees(currentSnapshot.fees))],
      ["Documents", String(currentSnapshot.documents.length)],
      ["Courses", String(currentSnapshot.courses.length)],
      ["Remarks", String(getRemarkEntries(currentSnapshot).length)],
    ];

    const csv = [
      ["Field", "Value"],
      ...rows,
    ]
      .map((line) => line.map((value) => `"${String(value).replaceAll("\"", '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, `${filenameBase}.csv`);
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ProtectedRoute allowedRoles={["parent"]}>
      <PageHeader
        title={`Hello, ${user?.name?.split(" ")[0] ?? "there"}!`}
        subtitle="Track linked children, attendance, fees, remarks, and reports from one place."
        actions={
          <button
            type="button"
            onClick={() => void refreshParentPortal()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Children"
          value={children.length.toString()}
          icon={<Users className="h-4 w-4" />}
        />
        <MetricCard
          label="Attendance"
          value={currentSnapshot ? `${currentSnapshot.stats.percentage}%` : "—"}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="success"
        />
        <MetricCard
          label="Fees due"
          value={currentSnapshot ? inr(calcPendingFees(currentSnapshot.fees)) : "—"}
          icon={<Wallet className="h-4 w-4" />}
          tone="warning"
        />
        <MetricCard
          label="Reports"
          value={currentSnapshot ? String(currentSnapshot.documents.length) : "—"}
          icon={<FileText className="h-4 w-4" />}
        />
      </div>

      {error ? (
        <Notice tone="warning" className="mt-4" message={error} />
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="border-border/60 bg-card shadow-sm">
          <CardContent className="space-y-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Linked children</h2>
                <p className="text-xs text-muted-foreground">Select a child to view attendance, progress, fees, and reports.</p>
              </div>
              <Badge variant="outline">Secure parent access</Badge>
            </div>

            <LinkedStudentCards students={children} isLoading={isLoading} />

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Active child</span>
                <select
                  value={currentChildId ?? ""}
                  onChange={(event) => setParentSelectedChildId(event.target.value || null)}
                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary"
                >
                  {children.length === 0 ? (
                    <option value="">No linked children</option>
                  ) : null}
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.user?.name ?? child.admission_no}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => downloadReport("json")}
                  disabled={!currentSnapshot}
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  JSON
                </button>
                <button
                  type="button"
                  onClick={() => downloadReport("csv")}
                  disabled={!currentSnapshot}
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  CSV
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card shadow-sm">
          <CardContent className="space-y-4 p-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Current child snapshot</h2>
              <p className="text-xs text-muted-foreground">Realtime summary for the selected child.</p>
            </div>

            {isChildLoading && !currentSnapshot ? (
              <p className="text-sm text-muted-foreground">Loading child analytics...</p>
            ) : currentSnapshot && currentChild ? (
              <>
                <div className="space-y-1 rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-foreground">{currentChild.user?.name ?? "Child"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{currentChild.admission_no}</p>
                    </div>
                    <Badge variant="secondary">{currentSnapshot.batch?.name ?? "No batch"}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {currentSnapshot.batch
                      ? `Academic year ${currentSnapshot.batch.academic_year}`
                      : "No batch assignment has been linked yet."}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniMetric label="Present" value={`${currentSnapshot.stats.present}`} icon={<CalendarDays className="h-4 w-4" />} />
                  <MiniMetric label="Absent" value={`${currentSnapshot.stats.absent}`} icon={<CalendarDays className="h-4 w-4" />} />
                  <MiniMetric label="Courses" value={`${currentSnapshot.courses.length}`} icon={<BookOpen className="h-4 w-4" />} />
                  <MiniMetric label="Documents" value={`${currentSnapshot.documents.length}`} icon={<FileText className="h-4 w-4" />} />
                </div>

                {childError ? <Notice tone="warning" message={childError} /> : null}
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 p-5 text-sm text-muted-foreground">
                Select a child to view analytics.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {currentSnapshot && currentChild ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card className="border-border/60 bg-card shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Attendance trend</h2>
                  <p className="text-xs text-muted-foreground">Weekly trend based on the latest attendance records.</p>
                </div>
                <Badge variant="outline">{currentSnapshot.stats.percentage}%</Badge>
              </div>

              <div className="space-y-3">
                {currentSnapshot.stats.weekly_trend.map((point) => (
                  <div key={point.period} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{point.label}</span>
                      <span>{point.percentage}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, point.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <MiniMetric label="Total sessions" value={`${currentSnapshot.stats.total_sessions}`} />
                <MiniMetric label="Present" value={`${currentSnapshot.stats.present}`} />
                <MiniMetric label="Late" value={`${currentSnapshot.stats.late}`} />
                <MiniMetric label="Leave" value={`${currentSnapshot.stats.leave}`} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Recent attendance</h2>
                <p className="text-xs text-muted-foreground">The latest child attendance records from the institution.</p>
              </div>
              <div className="space-y-2">
                {currentSnapshot.history.slice(0, 6).map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{formatDate(record.session?.session_date ?? record.marked_at)}</p>
                      <p className="text-xs text-muted-foreground">{record.session?.topic ?? "Attendance entry"}</p>
                    </div>
                    <Badge variant={attendanceVariant(record.status)}>{record.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Academic progress</h2>
                <p className="text-xs text-muted-foreground">Courses and batch assignment currently linked to the child.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniMetric label="Active" value={countByStatus(currentSnapshot.courses, "active")} icon={<School className="h-4 w-4" />} />
                <MiniMetric label="Completed" value={countByStatus(currentSnapshot.courses, "completed")} icon={<School className="h-4 w-4" />} />
                <MiniMetric label="Dropped" value={countByStatus(currentSnapshot.courses, "dropped")} icon={<School className="h-4 w-4" />} />
              </div>
              <div className="space-y-2">
                {currentSnapshot.courses.length > 0 ? (
                  currentSnapshot.courses.map((course) => (
                    <div
                      key={course.id}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{course.course?.name ?? "Course"}</p>
                        <p className="text-xs text-muted-foreground">{course.course?.code ?? "No code"}</p>
                      </div>
                      <Badge variant="outline">{course.status}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No course enrollments have been linked yet.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Homework, reports, and downloads</h2>
                <p className="text-xs text-muted-foreground">Uploaded documents and shareable learning files for the selected child.</p>
              </div>
              <div className="space-y-2">
                {getHomeworkDocuments(currentSnapshot.documents).length > 0 ? (
                  getHomeworkDocuments(currentSnapshot.documents).map((document) => (
                    <a
                      key={document.id}
                      href={document.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/40"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{document.file_name}</p>
                        <p className="text-xs text-muted-foreground">{document.document_type}</p>
                      </div>
                      <Download className="h-4 w-4 text-muted-foreground" />
                    </a>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No homework or report files have been uploaded yet.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {currentChild.batch_id ? (
            <Card className="border-border/60 bg-card shadow-sm xl:col-span-2">
              <CardContent className="p-5">
                <SchedulePortalView
                  title={`${currentChild.user?.name ?? "Child"}'s timetable`}
                  subtitle={currentSnapshot.batch?.name ?? "Class schedule"}
                  batchId={currentChild.batch_id}
                  loadSchedules={() => getSchedulesByBatch(currentChild.batch_id!, true)}
                  loadExceptions={() =>
                    user?.institute_id
                      ? getScheduleExceptions(user.institute_id, currentChild.batch_id!)
                      : Promise.resolve({ success: false, data: null, error: "Not signed in" })
                  }
                />
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-border/60 bg-card shadow-sm xl:col-span-2">
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Remarks and academic notes</h2>
                <p className="text-xs text-muted-foreground">Recent teacher or staff remarks captured in the student history log.</p>
              </div>
              <div className="space-y-2">
                {getRemarkEntries(currentSnapshot).length > 0 ? (
                  getRemarkEntries(currentSnapshot).map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{entry.action}</p>
                        <span className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{entry.remark ?? "No remark text provided."}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No remarks have been recorded for this child yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <ParentFeeMetric label="Total due" value={isFeeLoading ? "—" : inr(feeSummary?.total_due ?? 0)} icon={<Wallet className="h-4 w-4" />} />
        <ParentFeeMetric label="Paid" value={isFeeLoading ? "—" : inr(feeSummary?.total_paid ?? 0)} icon={<BadgeDollarSign className="h-4 w-4" />} tone="success" />
        <ParentFeeMetric label="Pending" value={isFeeLoading ? "—" : inr(feeSummary?.remaining_due ?? 0)} icon={<Wallet className="h-4 w-4" />} tone="warning" />
        <ParentFeeMetric label="Children" value={String(children.length)} icon={<Users className="h-4 w-4" />} />
      </div>

      {feeError ? <Notice tone="warning" className="mt-4" message={feeError} /> : null}

      {feeSummary ? (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Fee overview</h2>
              <p className="text-xs text-muted-foreground">Linked fee records grouped by child.</p>
            </div>
            <Badge variant="outline">Read-only parent access</Badge>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {feeSummary.children.map((child) => (
              <Card key={child.student.id} className="border-border/60 bg-card shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{child.student.user?.name ?? "Child"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{child.student.admission_no}</p>
                    </div>
                    <Badge variant="secondary">{child.fee_items.length} bills</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <MiniMetric label="Due" value={inr(child.total_due)} />
                    <MiniMetric label="Paid" value={inr(child.total_paid)} />
                    <MiniMetric label="Pending" value={inr(child.remaining_due)} />
                  </div>
                  <div className="mt-4 space-y-2">
                    {child.fee_items.slice(0, 3).map((item) => (
                      <div
                        key={item.student_fee.id}
                        className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium text-foreground">{item.student_fee.fee_structure?.fee_name ?? item.student_fee.fee_structure?.name ?? "Fee"}</p>
                          <p className="text-xs text-muted-foreground">Due {item.next_due_date ? formatDate(item.next_due_date) : "—"}</p>
                        </div>
                        <span className="font-semibold text-foreground">{inr(item.remaining_due)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </ProtectedRoute>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "default" | "success" | "warning";
}) {
  const toneClasses: Record<"default" | "success" | "warning", string> = {
    default: "bg-muted/40 text-foreground",
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  };

  return (
    <Card className="border-border/60 bg-card shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ParentFeeMetric({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "default" | "success" | "warning";
}) {
  const toneClasses: Record<"default" | "success" | "warning", string> = {
    default: "bg-muted/40 text-foreground",
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  };

  return (
    <Card className="border-border/60 bg-card shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-2">
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function Notice({
  message,
  tone = "warning",
  className = "",
}: {
  message: string;
  tone?: "warning";
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200 ${className}`}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function inr(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function calcPendingFees(fees: Array<{ final_amount: number; paid_so_far: number }>) {
  return fees.reduce((total, fee) => total + Math.max(0, fee.final_amount - fee.paid_so_far), 0);
}

function attendanceVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "present") return "default";
  if (status === "late") return "secondary";
  if (status === "leave") return "outline";
  return "destructive";
}

function countByStatus(courses: Array<{ status: string }>, target: string) {
  return courses.filter((course) => course.status === target).length.toString();
}

function getRemarkEntries(snapshot: ParentPortalChildSnapshot) {
  return snapshot.student_history.filter((entry) => Boolean(entry.remark) || entry.action === "remark_added");
}

function getHomeworkDocuments(documents: ParentPortalChildSnapshot["documents"]) {
  return documents.filter((document) => /homework|assignment|worksheet|report|note/i.test(document.document_type) || /homework|assignment|worksheet|report|note/i.test(document.file_name));
}
