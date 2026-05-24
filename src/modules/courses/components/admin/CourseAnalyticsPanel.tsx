// ---------------------------------------------------------------------------
// CourseAnalyticsPanel — admin/staff course performance metrics
// ---------------------------------------------------------------------------

import { Users, UserCheck, Trophy, BarChart3, ClipboardCheck, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCourseAnalytics } from "@/modules/courses/hooks/useCourses";
import type { LmsCourse } from "@/types";

interface CourseAnalyticsPanelProps {
  course: LmsCourse;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}

function MetricCard({ label, value, icon: Icon, hint }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {hint && <p className="mt-0.5 text-[10px] text-muted-foreground/80">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function CourseAnalyticsPanel({ course }: CourseAnalyticsPanelProps) {
  const { data: analytics, isLoading, error } = useCourseAnalytics(course.id);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Unable to load analytics for this course.
        </CardContent>
      </Card>
    );
  }

  const completionRate =
    analytics.total_enrollments > 0
      ? Math.round((analytics.completions / analytics.total_enrollments) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Course overview</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <span className="capitalize">{course.status}</span>
          <span>·</span>
          <span>{course.total_modules} modules</span>
          <span>·</span>
          <span>{course.total_lessons} lessons</span>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Total enrollments" value={analytics.total_enrollments} icon={Users} />
        <MetricCard label="Active learners" value={analytics.active_enrollments} icon={UserCheck} />
        <MetricCard
          label="Completions"
          value={analytics.completions}
          icon={Trophy}
          hint={`${completionRate}% completion rate`}
        />
        <MetricCard
          label="Avg. progress"
          value={`${analytics.avg_completion_pct}%`}
          icon={BarChart3}
        />
        <MetricCard
          label="Avg. quiz score"
          value={analytics.avg_quiz_score ? `${analytics.avg_quiz_score}%` : "—"}
          icon={FileText}
        />
        <MetricCard
          label="Assignment submissions"
          value={analytics.total_submissions}
          icon={ClipboardCheck}
        />
      </div>
    </div>
  );
}
