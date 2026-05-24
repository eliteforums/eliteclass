import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AttendanceCalendar } from "@/components/dashboard/student/AttendanceCalendar";
import { AttendanceChart } from "@/components/dashboard/student/AttendanceChart";
import { AttendanceHistoryTable } from "@/components/dashboard/student/AttendanceHistoryTable";
import { AttendanceStatsCard } from "@/components/dashboard/student/AttendanceStatsCard";
import { BatchInfoCard } from "@/components/dashboard/student/BatchInfoCard";
import { StudentProfileCard } from "@/components/dashboard/student/StudentProfileCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentStudentDashboard } from "@/services/student.service";
import { useAuthStore } from "@/store/authStore";
import { useStudentDashboardStore } from "@/store/studentDashboardStore";
import type { AttendanceStatus, StudentAttendanceRecord } from "@/types";
import { AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { StudentLearningSection } from "@/modules/courses/components/student/StudentLearningSection";

const STUDENT_DASHBOARD_TIMEOUT_MS = 15_000;

export const Route = createFileRoute("/dashboard/student/")({
  head: () => ({ meta: [{ title: "Student Dashboard — EduOS" }] }),
  component: StudentDashboard,
});

function StudentDashboard() {
  const { user } = useAuthStore();
  const dashboard = useStudentDashboardStore((state) => state.dashboard);
  const cachedStudentId = useStudentDashboardStore((state) => state.studentId);
  const isLoading = useStudentDashboardStore((state) => state.isLoading);
  const error = useStudentDashboardStore((state) => state.error);
  const lastUpdated = useStudentDashboardStore((state) => state.lastUpdated);
  const setLoading = useStudentDashboardStore((state) => state.setLoading);
  const setError = useStudentDashboardStore((state) => state.setError);
  const setDashboard = useStudentDashboardStore((state) => state.setDashboard);

  const [warning, setWarning] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "all">("all");
  const [sortDirection, setSortDirection] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    if (!user.institute_id) {
      setError("Student session is missing the linked institute.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const userId = user.id;
    const instituteId = user.institute_id;

    async function loadDashboard() {
      setLoading(true);
      setWarning(null);

      try {
        const response = await Promise.race([
          getCurrentStudentDashboard(userId, instituteId),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Student dashboard load timed out.")), STUDENT_DASHBOARD_TIMEOUT_MS);
          }),
        ]);

        if (cancelled) return;

        if (response.success && response.data) {
          setDashboard(userId, response.data);
          setWarning(response.error);
          setError(null);
        } else {
          setError(response.error ?? "Failed to load the student dashboard.");
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load the student dashboard.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard().catch((loadError) => {
      if (cancelled) return;
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load the student dashboard.",
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [setDashboard, setError, setLoading, user?.id, user?.institute_id]);

  const activeDashboard = dashboard && cachedStudentId === user?.id ? dashboard : null;
  const attendanceRecords = activeDashboard?.history ?? [];

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    const items = attendanceRecords.filter((record) => {
      const sessionDate = record.session?.session_date ?? record.marked_at.slice(0, 10);
      const batchName = record.session?.batch?.name ?? "general";
      const note = record.notes ?? "";

      const matchesSearch =
        !query ||
        sessionDate.includes(query) ||
        record.status.includes(query) ||
        batchName.toLowerCase().includes(query) ||
        note.toLowerCase().includes(query);

      const matchesStatus = statusFilter === "all" || record.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    const sorted = [...items].sort((a, b) => {
      const left = new Date(a.session?.session_date ?? a.marked_at).getTime();
      const right = new Date(b.session?.session_date ?? b.marked_at).getTime();
      return sortDirection === "newest" ? right - left : left - right;
    });

    return sorted;
  }, [attendanceRecords, search, sortDirection, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, page]);

  const refresh = () => {
    if (!user?.id || !user.institute_id) return;

    setLoading(true);
    setWarning(null);
    void Promise.race([
      getCurrentStudentDashboard(user.id, user.institute_id),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Student dashboard refresh timed out.")), STUDENT_DASHBOARD_TIMEOUT_MS);
      }),
    ])
      .then((response) => {
        if (response.success && response.data) {
          setDashboard(user.id, response.data);
          setWarning(response.error);
          setError(null);
        } else {
          setError(response.error ?? "Failed to refresh the student dashboard.");
        }
      })
      .catch((refreshError) => {
        setError(
          refreshError instanceof Error ? refreshError.message : "Failed to refresh the student dashboard.",
        );
      })
      .finally(() => setLoading(false));
  };

  const attendanceRate = activeDashboard?.stats.percentage ?? 0;
  const studentName = activeDashboard?.student.user?.name ?? user?.name ?? "Student";
  const pageLabel = `${page} / ${totalPages}`;

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[2rem] border border-border/40 bg-card p-6 md:p-10 shadow-lg">
          {/* Decorative background blobs */}
          <div className="absolute top-0 left-0 -ml-20 -mt-20 size-[300px] rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 -mr-20 -mb-20 size-[200px] rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-4 max-w-2xl">
              <Badge
                variant="outline"
                className="gap-1.5 px-3 py-1 bg-background/50 backdrop-blur-sm border-primary/20 text-primary w-fit"
              >
                <Sparkles className="size-3.5" />
                Student Portal
              </Badge>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl leading-tight">
                  Welcome back,{" "}
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600">
                    {studentName.split(" ")[0]}
                  </span>
                  .
                </h1>
                <p className="mt-4 max-w-2xl text-base text-muted-foreground leading-relaxed">
                  View your profile, batch assignment, attendance trend, and session history in one
                  place.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {warning ? (
                <Badge
                  variant="outline"
                  className="gap-1.5 border-amber-500/30 text-amber-700 dark:text-amber-300"
                >
                  <AlertCircle className="size-3.5" />
                  Partial data loaded
                </Badge>
              ) : null}
              {isLoading ? <Badge variant="secondary">Refreshing</Badge> : null}
              <Button variant="outline" onClick={refresh}>
                <RefreshCw className="mr-2 size-4" />
                Refresh
              </Button>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <QuickMetric label="Attendance rate" value={`${attendanceRate}%`} />
            <QuickMetric label="Sessions" value={`${activeDashboard?.stats.total_sessions ?? 0}`} />
            <QuickMetric label="Present" value={`${activeDashboard?.stats.present ?? 0}`} />
            <QuickMetric label="Late" value={`${activeDashboard?.stats.late ?? 0}`} />
          </div>
          {warning ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p>{warning}</p>
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-800 dark:text-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}
          {lastUpdated ? (
            <p className="mt-4 text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Last synced {new Date(lastUpdated).toLocaleString()}
            </p>
          ) : null}
        </section>

        {user?.id ? <StudentLearningSection studentId={user.id} /> : null}

        {!activeDashboard && isLoading ? (
          <div className="grid gap-6 xl:grid-cols-2">
            <LoadingCard />
            <LoadingCard />
            <LoadingCard className="xl:col-span-2" />
          </div>
        ) : activeDashboard ? (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <StudentProfileCard
                student={activeDashboard.student}
                attendanceRate={attendanceRate}
                lastUpdated={lastUpdated}
              />
              <BatchInfoCard batch={activeDashboard.batch} />
            </div>

            <AttendanceStatsCard stats={activeDashboard.stats} />

            <AttendanceChart
              monthlyTrend={activeDashboard.stats.monthly_trend}
              weeklyTrend={activeDashboard.stats.weekly_trend}
            />

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <AttendanceHistoryTable
                records={paginatedRecords}
                total={filteredRecords.length}
                page={page}
                pageSize={pageSize}
                search={search}
                statusFilter={statusFilter}
                sortDirection={sortDirection}
                onSearchChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                onStatusChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
                onSortChange={(value) => {
                  setSortDirection(value);
                  setPage(1);
                }}
                onPageChange={setPage}
              />
              <AttendanceCalendar records={attendanceRecords} />
            </div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Page {pageLabel}
            </p>
          </div>
        ) : null}
      </div>
    </ProtectedRoute>
  );
}

function QuickMetric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="relative overflow-hidden border-border/50 bg-background/50 backdrop-blur-sm hover:shadow-md transition-shadow group">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <CardContent className="p-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
          {label}
        </p>
        <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function LoadingCard({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="space-y-4 p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-28 animate-pulse rounded-2xl bg-muted/60" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-20 animate-pulse rounded-2xl bg-muted/50" />
          <div className="h-20 animate-pulse rounded-2xl bg-muted/50" />
        </div>
      </CardContent>
    </Card>
  );
}
