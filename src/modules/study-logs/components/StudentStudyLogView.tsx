import { useState, useEffect, useCallback, useMemo } from "react";
import { format, subDays, startOfToday, parseISO } from "date-fns";
import { 
  ClipboardCheck, 
  History, 
  Calendar as CalendarIcon, 
  AlertCircle,
  Loader2,
  RefreshCw,
  BookOpen
} from "lucide-react";

import { StudyLogForm } from "./StudyLogForm";
import { StudyLogTimeline } from "./StudyLogTimeline";
import { getMyStudyLogs } from "@/services/studyLog.service";
import type { DailyStudyLog, Batch } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select";

interface StudentStudyLogViewProps {
  studentId: string;
  batchId: string; // This is the student's PRIMARY batch
  instituteId: string;
  assignments?: StudentBatchAssignment[];
}

export function StudentStudyLogView({ 
  studentId, 
  batchId: primaryBatchId, 
  instituteId,
  assignments = [] 
}: StudentStudyLogViewProps) {
  const [logs, setLogs] = useState<DailyStudyLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(format(startOfToday(), "yyyy-MM-dd"));
  
  // Use assignments if available, fallback to primary batch
  const allBatches = useMemo(() => {
    if (assignments.length > 0) {
      return assignments.map(a => ({
        id: a.batch_id,
        name: a.batch?.name || "Unknown Batch",
        courseName: a.course?.name || "Unknown Course"
      }));
    }
    return [{ id: primaryBatchId, name: "Primary Batch", courseName: "Course" }];
  }, [assignments, primaryBatchId]);

  const [selectedBatchId, setSelectedBatchId] = useState<string>(allBatches[0]?.id || primaryBatchId);

  const fetchLogs = useCallback(async () => {
    if (!selectedBatchId) return;
    
    setIsLoading(true);
    setError(null);
    
    // Fetch last 30 days of logs for the SELECTED batch
    const dateTo = format(startOfToday(), "yyyy-MM-dd");
    const dateFrom = format(subDays(startOfToday(), 30), "yyyy-MM-dd");
    
    const result = await getMyStudyLogs(studentId, selectedBatchId, dateFrom, dateTo);
    
    if (result.success && result.data) {
      setLogs(result.data);
    } else {
      setError(result.error ?? "Failed to fetch study logs.");
    }
    setIsLoading(false);
  }, [studentId, selectedBatchId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const selectedLog = logs.find(log => log.log_date === selectedDate);

  return (
    <div className="space-y-6">
      {/* Batch Selection */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-card/50 p-4 rounded-xl border border-border">
        <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
                <h4 className="text-sm font-bold">Select Course / Batch</h4>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Logging progress for specific assignments</p>
            </div>
        </div>
        
        <div className="min-w-[240px]">
            <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Choose a batch" />
                </SelectTrigger>
                <SelectContent>
                    {allBatches.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                            {b.courseName} ({b.name})
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                Submit Progress
            </h3>
            <div className="flex items-center gap-2">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedDate(format(startOfToday(), "yyyy-MM-dd"))}
                    className={selectedDate === format(startOfToday(), "yyyy-MM-dd") ? "bg-primary/10 text-primary" : ""}
                >
                    Today
                </Button>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedDate(format(subDays(startOfToday(), 1), "yyyy-MM-dd"))}
                    className={selectedDate === format(subDays(startOfToday(), 1), "yyyy-MM-dd") ? "bg-primary/10 text-primary" : ""}
                >
                    Yesterday
                </Button>
            </div>
          </div>

          <StudyLogForm
            studentId={studentId}
            batchId={selectedBatchId}
            instituteId={instituteId}
            existingLog={selectedLog}
            selectedDate={selectedDate}
            onSuccess={(newLog) => {
              setLogs(prev => {
                const filtered = prev.filter(l => l.log_date !== newLog.log_date);
                return [newLog, ...filtered].sort((a, b) => b.log_date.localeCompare(a.log_date));
              });
            }}
          />
        </div>

        {/* Right: History Timeline */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Recent Logs
            </h3>
            <Button variant="ghost" size="icon" onClick={fetchLogs} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <Card className="border-border bg-card/50 overflow-hidden">
            <CardContent className="p-0">
                <div className="max-h-[600px] overflow-y-auto p-4 custom-scrollbar">
                    {isLoading && logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                            <p className="text-sm text-muted-foreground">Loading your history...</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                            <p className="text-sm text-foreground">{error}</p>
                            <Button variant="link" size="sm" onClick={fetchLogs}>Try again</Button>
                        </div>
                    ) : (
                        <StudyLogTimeline 
                            logs={logs} 
                            onSelect={setSelectedDate}
                            selectedDate={selectedDate}
                        />
                    )}
                </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
