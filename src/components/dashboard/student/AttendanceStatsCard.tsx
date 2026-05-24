import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { StudentAttendanceStats } from "@/types";
import { CheckCircle2, Clock3, CircleX, MinusCircle, TrendingUp } from "lucide-react";

interface AttendanceStatsCardProps {
  stats: StudentAttendanceStats;
}

function formatCount(value: number, total: number): string {
  return `${value} / ${total}`;
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className={`size-4 ${tone}`} />
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

export function AttendanceStatsCard({ stats }: AttendanceStatsCardProps) {
  return (
    <Card className="border-border/60 bg-card/90 shadow-sm backdrop-blur">
      <CardHeader className="border-b border-border/60 bg-gradient-to-br from-background via-background to-muted/20 pb-5">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Attendance overview
        </p>
        <CardTitle className="text-xl">Presence summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={CheckCircle2}
            label="Present"
            value={formatCount(stats.present, stats.total_sessions)}
            tone="text-emerald-500"
          />
          <Metric
            icon={CircleX}
            label="Absent"
            value={formatCount(stats.absent, stats.total_sessions)}
            tone="text-rose-500"
          />
          <Metric
            icon={Clock3}
            label="Late"
            value={formatCount(stats.late, stats.total_sessions)}
            tone="text-amber-500"
          />
          <Metric
            icon={MinusCircle}
            label="Leave"
            value={formatCount(stats.leave, stats.total_sessions)}
            tone="text-sky-500"
          />
        </div>

        <div className="rounded-2xl border border-border/60 bg-muted/20 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Overall attendance rate</p>
              <p className="mt-1 text-3xl font-semibold text-foreground">{stats.percentage}%</p>
            </div>
            <TrendingUp className="size-10 text-primary/70" />
          </div>
          <Progress value={stats.percentage} className="mt-4 h-2" />
          <p className="mt-3 text-sm text-muted-foreground">
            Present {stats.present_percentage}% · Absent {stats.absent_percentage}% · Late{" "}
            {stats.late_percentage}% · Leave {stats.leave_percentage}%
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
