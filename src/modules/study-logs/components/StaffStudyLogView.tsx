import { useState, useEffect, useCallback, useMemo } from "react";
import { format, subDays, startOfToday } from "date-fns";
import { 
  LayoutGrid, 
  Users, 
  Calendar as CalendarIcon, 
  Loader2,
  AlertCircle,
  BarChart,
  PieChart as PieChartIcon,
  CheckCircle2
} from "lucide-react";
import { toast } from "sonner";

import { StaffStudyLogGrid } from "./StaffStudyLogGrid";
import { getBatchStudyLogsReport } from "@/services/studyLog.service";
import type { StudentStudyLogReport } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select";

interface StaffStudyLogViewProps {
  instituteId: string;
  batches: { id: string; label: string }[];
}

export function StaffStudyLogView({ instituteId, batches }: StaffStudyLogViewProps) {
  const [selectedBatch, setSelectedBatch] = useState<string>(batches[0]?.id || "");
  const [reportData, setReportData] = useState<StudentStudyLogReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Default range: last 7 days
  const [dateTo, setDateTo] = useState(format(startOfToday(), "yyyy-MM-dd"));
  const [dateFrom, setDateFrom] = useState(format(subDays(startOfToday(), 6), "yyyy-MM-dd"));

  const fetchReport = useCallback(async () => {
    if (!selectedBatch) return;
    
    setIsLoading(true);
    setError(null);
    
    const result = await getBatchStudyLogsReport(selectedBatch, dateFrom, dateTo);
    
    if (result.success && result.data) {
      setReportData(result.data);
    } else {
      setError(result.error ?? "Failed to fetch study log report.");
      toast.error(result.error ?? "Failed to fetch study log report.");
    }
    setIsLoading(false);
  }, [selectedBatch, dateFrom, dateTo]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const stats = useMemo(() => {
    if (reportData.length === 0) return null;
    
    const totalPossibleLogs = reportData.length * 7; // Approx for 7 days
    const totalSubmitted = reportData.reduce((acc, s) => acc + s.logs.length, 0);
    const totalLate = reportData.reduce((acc, s) => acc + s.logs.filter(l => l.is_late).length, 0);
    const submissionRate = Math.round((totalSubmitted / totalPossibleLogs) * 100);

    return {
        totalSubmitted,
        totalLate,
        submissionRate,
        studentCount: reportData.length
    };
  }, [reportData]);

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h3 className="text-2xl font-bold flex items-center gap-2">
            <LayoutGrid className="h-6 w-6 text-primary" />
            Progress Tracker
          </h3>
          <p className="text-sm text-muted-foreground">Monitor daily student study logs and progress</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground px-1">Batch</label>
            <Select value={selectedBatch} onValueChange={setSelectedBatch}>
                <SelectTrigger className="w-[240px] bg-card border-border">
                    <SelectValue placeholder="Select Batch" />
                </SelectTrigger>
                <SelectContent>
                    {batches.map(batch => (
                        <SelectItem key={batch.id} value={batch.id}>
                            {batch.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard 
            title="Active Students" 
            value={stats?.studentCount ?? 0} 
            icon={<Users className="h-4 w-4 text-blue-500" />} 
        />
        <StatsCard 
            title="Total Submissions" 
            value={stats?.totalSubmitted ?? 0} 
            icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} 
        />
        <StatsCard 
            title="Late Submissions" 
            value={stats?.totalLate ?? 0} 
            icon={<AlertCircle className="h-4 w-4 text-yellow-500" />} 
        />
        <StatsCard 
            title="Completion Rate" 
            value={`${stats?.submissionRate ?? 0}%`} 
            icon={<BarChart className="h-4 w-4 text-purple-500" />} 
        />
      </div>

      {/* Grid View */}
      <Card className="border-border bg-card shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <StaffStudyLogGrid 
            reportData={reportData}
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

function StatsCard({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
    return (
        <Card className="border-border bg-card/50">
            <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
                    <p className="text-2xl font-bold">{value}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center">
                    {icon}
                </div>
            </CardContent>
        </Card>
    );
}
