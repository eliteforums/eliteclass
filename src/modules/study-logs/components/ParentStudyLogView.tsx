import { useState, useEffect, useCallback, useMemo } from "react";
import { format, subDays, startOfToday } from "date-fns";
import {
  LayoutGrid,
  Users,
  Calendar as CalendarIcon,
  Loader2,
  AlertCircle,
  BarChart,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

import { ParentStudyLogGrid } from "./ParentStudyLogGrid";
import { getMyStudyLogs } from "@/services/studyLog.service";
import type { DailyStudyLog, StudentBatchAssignment } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ParentStudyLogViewProps {
  studentId: string;
  batchId?: string | null;
  assignments?: StudentBatchAssignment[];
}

export function ParentStudyLogView({
  studentId,
  batchId,
  assignments = [],
}: ParentStudyLogViewProps) {
  // Use assignments if available, fallback to primary batch
  const allBatches = useMemo(() => {
    if (assignments.length > 0) {
      return assignments.map((a) => ({
        id: a.batch_id,
        name: a.batch?.name || "Unknown Batch",
        courseName: a.course?.name || "Unknown Course",
      }));
    }
    if (batchId) {
      return [{ id: batchId, name: "Primary Batch", courseName: "Course" }];
    }
    return [];
  }, [assignments, batchId]);

  const [selectedBatchId, setSelectedBatchId] = useState<string>(allBatches[0]?.id || "");
  const [logs, setLogs] = useState<DailyStudyLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default range: last 7 days
  const [dateTo, setDateTo] = useState(format(startOfToday(), "yyyy-MM-dd"));
  const [dateFrom, setDateFrom] = useState(format(subDays(startOfToday(), 6), "yyyy-MM-dd"));

  const fetchLogs = useCallback(async () => {
    if (!selectedBatchId || !studentId) return;

    setIsLoading(true);
    setError(null);

    const result = await getMyStudyLogs(studentId, selectedBatchId, dateFrom, dateTo);

    if (result.success && result.data) {
      setLogs(result.data);
    } else {
      setError(result.error ?? "Failed to fetch progress logs.");
    }
    setIsLoading(false);
  }, [studentId, selectedBatchId, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // If student is changed (via parent dashboard), reset the selected batch
  useEffect(() => {
    if (allBatches.length > 0 && !allBatches.some((b) => b.id === selectedBatchId)) {
      setSelectedBatchId(allBatches[0].id);
    }
  }, [allBatches, selectedBatchId]);

  const stats = useMemo(() => {
    if (logs.length === 0) return null;

    const totalLate = logs.filter((l) => l.is_late).length;
    const totalSubmitted = logs.length;

    return {
      totalSubmitted,
      totalLate,
      submissionRate: Math.round((totalSubmitted / 7) * 100), // Rate for the visible week
    };
  }, [logs]);

  if (allBatches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center bg-card rounded-xl border border-dashed border-border">
        <div className="rounded-full bg-muted p-3 mb-3">
          <BookOpen className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No Active Courses</p>
        <p className="text-xs text-muted-foreground">
          This child is not currently assigned to any batches.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-card/50 p-4 rounded-xl border border-border">
        <div className="space-y-1">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Child's Progress Tracker
          </h3>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Academic consistency monitoring
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground px-1">
              Select Course / Batch
            </label>
            <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
              <SelectTrigger className="w-[280px] bg-background border-border">
                <SelectValue placeholder="Select Course" />
              </SelectTrigger>
              <SelectContent>
                {allBatches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.courseName} ({b.name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard
          title="Weekly Submissions"
          value={stats?.totalSubmitted ?? 0}
          icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
        />
        <StatsCard
          title="Late Entries"
          value={stats?.totalLate ?? 0}
          icon={<AlertCircle className="h-4 w-4 text-yellow-500" />}
        />
        <StatsCard
          title="Weekly Consistency"
          value={`${stats?.submissionRate ?? 0}%`}
          icon={<BarChart className="h-4 w-4 text-purple-500" />}
        />
      </div>

      {/* Grid View */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <ParentStudyLogGrid
            logs={logs}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateRangeChange={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
            }}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StatsCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-border bg-card/50">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {title}
          </p>
          <p className="text-xl font-bold">{value}</p>
        </div>
        <div className="h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
