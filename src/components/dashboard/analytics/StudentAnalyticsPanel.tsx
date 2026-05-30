// ---------------------------------------------------------------------------
// EliteClass — Per-Student Analytics Panel
// Displays individual student performance metrics: attendance, fees,
// course-level performance, and weekly attendance trend.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CalendarCheck,
  CreditCard,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useMountedRef } from "@/hooks/useMountedRef";
import { getStudentAnalytics } from "@/services/analytics.service";
import type { StudentAnalyticsBundle } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DateRange {
  from: string;
  to: string;
}

interface StudentAnalyticsPanelProps {
  studentId: string;
  dateRange?: DateRange;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultDateRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function getAttendanceColor(rate: number): string {
  if (rate >= 75) return "text-green-600";
  if (rate >= 50) return "text-yellow-600";
  return "text-red-600";
}

function getProgressColor(rate: number): string {
  if (rate >= 75) return "[&>div]:bg-green-500";
  if (rate >= 50) return "[&>div]:bg-yellow-500";
  return "[&>div]:bg-red-500";
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function StudentAnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-2 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error State
// ---------------------------------------------------------------------------

function StudentAnalyticsError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
      <AlertCircle className="h-10 w-10 text-destructive mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">
        Failed to load student analytics
      </h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{message}</p>
      <Button variant="outline" onClick={onRetry} className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly Attendance Trend
// ---------------------------------------------------------------------------

function WeeklyAttendanceTrend({
  trend,
}: {
  trend: StudentAnalyticsBundle["attendance"]["weekly_trend"];
}) {
  if (trend.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No attendance trend data available for this period.
      </p>
    );
  }

  const maxTotal = Math.max(...trend.map((t) => t.total ?? 1), 1);

  return (
    <div className="space-y-2">
      {trend.map((point, idx) => {
        const present = point.present ?? 0;
        const total = point.total ?? 0;
        const rate = total > 0 ? Math.round((present / total) * 100) : 0;
        const barWidth = total > 0 ? (present / maxTotal) * 100 : 0;

        return (
          <div key={point.label ?? idx} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-20 shrink-0 truncate">
              {point.label}
            </span>
            <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <span className="text-xs font-medium w-10 text-right">{rate}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Course Performance Table
// ---------------------------------------------------------------------------

function CoursePerformanceList({
  courses,
}: {
  courses: StudentAnalyticsBundle["courses"];
}) {
  if (courses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No course enrollment data available.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {courses.map((course) => (
        <div
          key={`${course.course_name}-${course.enrolled_at}`}
          className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{course.course_name}</span>
          </div>
          <span className="text-xs text-muted-foreground capitalize">
            {course.status}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function StudentAnalyticsPanel({
  studentId,
  dateRange,
}: StudentAnalyticsPanelProps) {
  const mounted = useMountedRef();
  const range = useMemo(() => dateRange ?? defaultDateRange(), [dateRange]);

  const [data, setData] = useState<StudentAnalyticsBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await getStudentAnalytics(studentId, range.from, range.to);

    if (!mounted.current) return;

    if (result.success && result.data) {
      setData(result.data);
    } else {
      setError(result.error ?? "Failed to load student analytics. Please try again.");
    }
    setIsLoading(false);
  }, [studentId, range.from, range.to, mounted]);

  useEffect(() => {
    if (!studentId) return;
    void loadAnalytics();
  }, [loadAnalytics, studentId]);

  function handleRetry() {
    void loadAnalytics();
  }

  // Loading state
  if (isLoading) {
    return <StudentAnalyticsSkeleton />;
  }

  // Error state
  if (error) {
    return <StudentAnalyticsError message={error} onRetry={handleRetry} />;
  }

  // Data state — use zero values when data is null (shouldn't happen after loading)
  const analytics = data ?? {
    student_id: studentId,
    attendance: { total: 0, present_or_late: 0, rate: 0, weekly_trend: [] },
    courses: [],
    fees: { total_due: 0, total_paid: 0, pending_count: 0 },
    insights: [],
  };

  const attendanceRate = analytics.attendance.rate;
  const feesPending = analytics.fees.total_due - analytics.fees.total_paid;

  return (
    <div className="space-y-4">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Attendance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Attendance
            </CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getAttendanceColor(attendanceRate)}`}>
              {attendanceRate}%
            </div>
            <Progress
              value={attendanceRate}
              className={`mt-2 ${getProgressColor(attendanceRate)}`}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {analytics.attendance.present_or_late} of {analytics.attendance.total} sessions
            </p>
          </CardContent>
        </Card>

        {/* Fee Payment Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Fee Status
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₹{analytics.fees.total_paid.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Paid of ₹{analytics.fees.total_due.toLocaleString()} total
            </p>
            {feesPending > 0 && (
              <p className="text-xs text-yellow-600 mt-1">
                ₹{feesPending.toLocaleString()} pending ({analytics.fees.pending_count} invoices)
              </p>
            )}
            {feesPending === 0 && analytics.fees.total_due > 0 && (
              <p className="text-xs text-green-600 mt-1">All fees paid</p>
            )}
            {analytics.fees.total_due === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No fees recorded</p>
            )}
          </CardContent>
        </Card>

        {/* Courses Enrolled */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Courses
            </CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.courses.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {analytics.courses.length === 0
                ? "No courses enrolled"
                : `${analytics.courses.filter((c) => c.status === "active").length} active`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Attendance Trend */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Weekly Attendance Trend</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <WeeklyAttendanceTrend trend={analytics.attendance.weekly_trend} />
        </CardContent>
      </Card>

      {/* Course-Level Performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Course Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <CoursePerformanceList courses={analytics.courses} />
        </CardContent>
      </Card>

      {/* AI Insights */}
      {analytics.insights.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              {analytics.insights.map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
