import { useState, useMemo } from "react";
import { 
  format, 
  eachDayOfInterval, 
  parseISO, 
  isSameDay, 
  startOfDay,
  subDays
} from "date-fns";
import { 
  Search, 
  Filter, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  ExternalLink,
  Eye,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  Clock,
  Info
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { StudentStudyLogReport, DailyStudyLog } from "@/types";

interface StaffStudyLogGridProps {
  reportData: StudentStudyLogReport[];
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (from: string, to: string) => void;
  isLoading?: boolean;
}

export function StaffStudyLogGrid({ 
  reportData, 
  dateFrom, 
  dateTo, 
  onDateRangeChange,
  isLoading 
}: StaffStudyLogGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<{ studentName: string; log: DailyStudyLog } | null>(null);

  const days = useMemo(() => {
    try {
      return eachDayOfInterval({
        start: parseISO(dateFrom),
        end: parseISO(dateTo),
      });
    } catch (e) {
      return [];
    }
  }, [dateFrom, dateTo]);

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return reportData;
    const query = searchQuery.toLowerCase();
    return reportData.filter(student => 
      student.student_name.toLowerCase().includes(query)
    );
  }, [reportData, searchQuery]);

  const getLogForDate = (studentLogs: DailyStudyLog[], date: Date) => {
    return studentLogs.find(log => isSameDay(parseISO(log.log_date), date));
  };

  const getCellStatus = (log: DailyStudyLog | undefined, date: Date) => {
    if (!log) {
      const now = startOfDay(new Date());
      const logDate = startOfDay(date);
      
      // If it's more than 1 day old, it's missing (Red)
      // Cutoff is next day 11:59 PM, so if today is 19th, 17th is definitely missing.
      const cutoffDate = subDays(now, 1); 
      if (logDate < cutoffDate) return "missing";
      
      // If it's yesterday or today and no log yet, it's pending (could be Gray or Yellow soon)
      if (logDate >= now) return "future";
      return "pending";
    }

    if (log.is_late) return "late";
    return "submitted";
  };

  const handleExport = () => {
    // Basic CSV export logic
    const header = ["Student Name", ...days.map(d => format(d, "MMM dd"))].join(",");
    const rows = filteredData.map(student => {
      const studentCells = days.map(day => {
        const log = getLogForDate(student.logs, day);
        return log ? `"${log.title}"` : '"Missing"';
      });
      return [`"${student.student_name}"`, ...studentCells].join(",");
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [header, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `study_logs_report_${dateFrom}_to_${dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-xl border border-border">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search student..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export CSV</span>
            </Button>
            <div className="flex items-center border border-input bg-background rounded-lg p-1">
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8"
                    onClick={() => {
                        const newFrom = format(subDays(parseISO(dateFrom), 7), "yyyy-MM-dd");
                        const newTo = format(subDays(parseISO(dateTo), 7), "yyyy-MM-dd");
                        onDateRangeChange(newFrom, newTo);
                    }}
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-medium px-2">
                    {format(parseISO(dateFrom), "MMM dd")} - {format(parseISO(dateTo), "MMM dd")}
                </span>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8"
                    onClick={() => {
                        const newFrom = format(subDays(parseISO(dateFrom), -7), "yyyy-MM-dd");
                        const newTo = format(subDays(parseISO(dateTo), -7), "yyyy-MM-dd");
                        onDateRangeChange(newFrom, newTo);
                    }}
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
      </div>

      {/* Grid */}
      <div className="relative overflow-auto rounded-xl border border-border bg-card max-h-[600px]">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-card border-b border-border">
            <tr>
              <th className="sticky left-0 z-30 bg-card p-4 text-left font-bold text-foreground border-r border-border min-w-[200px]">
                Student Name
              </th>
              {days.map((day) => (
                <th key={day.toISOString()} className="p-4 text-center font-medium text-muted-foreground min-w-[120px]">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] uppercase tracking-wider">{format(day, "EEE")}</span>
                    <span className="text-sm font-bold text-foreground">{format(day, "dd MMM")}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                        <td className="sticky left-0 bg-card p-4 border-r border-border">
                            <div className="h-4 w-32 bg-muted rounded" />
                        </td>
                        {days.map((_, j) => (
                            <td key={j} className="p-4">
                                <div className="h-8 w-full bg-muted rounded" />
                            </td>
                        ))}
                    </tr>
                ))
            ) : filteredData.length === 0 ? (
                <tr>
                    <td colSpan={days.length + 1} className="p-12 text-center text-muted-foreground">
                        No students found
                    </td>
                </tr>
            ) : (
                filteredData.map((student) => (
                    <tr key={student.student_id} className="hover:bg-muted/50 transition-colors">
                        <td className="sticky left-0 z-10 bg-card p-4 font-medium text-foreground border-r border-border">
                            {student.student_name}
                        </td>
                        {days.map((day) => {
                            const log = getLogForDate(student.logs, day);
                            const status = getCellStatus(log, day);
                            
                            return (
                                <td key={day.toISOString()} className="p-2 text-center">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    onClick={() => log && setSelectedLog({ studentName: student.student_name, log })}
                                                    className={`w-full h-10 rounded-lg flex items-center justify-center transition-all ${
                                                        status === "submitted" ? "bg-green-500/10 text-green-500 border border-green-500/20" :
                                                        status === "late" ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" :
                                                        status === "missing" ? "bg-red-500/10 text-red-500 border border-red-500/20" :
                                                        "bg-muted/30 text-muted-foreground border border-border/50"
                                                    } ${log ? "hover:scale-[1.02] active:scale-95 cursor-pointer" : "cursor-default"}`}
                                                >
                                                    {log ? (
                                                        <span className="text-[10px] font-bold truncate px-1">
                                                            {log.title}
                                                        </span>
                                                    ) : (
                                                        <div className={`h-1.5 w-1.5 rounded-full ${
                                                            status === "missing" ? "bg-red-500" : "bg-muted-foreground/30"
                                                        }`} />
                                                    )}
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-xs p-3 space-y-2">
                                                <div className="flex items-center justify-between gap-4">
                                                    <span className="font-bold">{format(day, "MMM dd")}</span>
                                                    <Badge variant="outline" className={
                                                        status === "submitted" ? "text-green-500 border-green-500/30" :
                                                        status === "late" ? "text-yellow-500 border-yellow-500/30" :
                                                        status === "missing" ? "text-red-500 border-red-500/30" :
                                                        "text-muted-foreground"
                                                    }>
                                                        {status.toUpperCase()}
                                                    </Badge>
                                                </div>
                                                {log ? (
                                                    <>
                                                        <p className="font-medium text-sm">{log.title}</p>
                                                        <p className="text-xs text-muted-foreground line-clamp-3">{log.description}</p>
                                                        <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                                                            Submitted: {format(parseISO(log.submitted_at), "MMM dd, hh:mm a")}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground">
                                                        {status === "missing" ? "No log submitted for this date." : "Awaiting submission..."}
                                                    </p>
                                                )}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </td>
                            );
                        })}
                    </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      {/* Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          {selectedLog && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-8">
                    <div className="space-y-1">
                        <DialogTitle className="text-xl font-bold">{selectedLog.log.title}</DialogTitle>
                        <DialogDescription>
                            Submitted by {selectedLog.studentName} for {format(parseISO(selectedLog.log.log_date), "MMMM do, yyyy")}
                        </DialogDescription>
                    </div>
                    <Badge variant={selectedLog.log.is_late ? "secondary" : "default"} className={selectedLog.log.is_late ? "bg-yellow-500/10 text-yellow-500" : "bg-green-500/10 text-green-500"}>
                        {selectedLog.log.is_late ? "Late Submission" : "On-time Submission"}
                    </Badge>
                </div>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                <div className="space-y-2">
                    <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Progress Details</h4>
                    <div className="rounded-xl bg-muted/30 p-4 border border-border whitespace-pre-wrap text-sm leading-relaxed">
                        {selectedLog.log.description}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <h4 className="text-xs font-bold text-muted-foreground uppercase">Submission Time</h4>
                        <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-primary" />
                            {format(parseISO(selectedLog.log.submitted_at), "MMM dd, yyyy • hh:mm a")}
                        </div>
                    </div>
                    {selectedLog.log.attachment_url && (
                        <div className="space-y-1">
                            <h4 className="text-xs font-bold text-muted-foreground uppercase">Attachment</h4>
                            <a 
                                href={selectedLog.log.attachment_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm text-primary hover:underline"
                            >
                                <ExternalLink className="h-4 w-4" />
                                View Resource
                            </a>
                        </div>
                    )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
