import { useState, useMemo } from "react";
import { format, eachDayOfInterval, parseISO, isSameDay, startOfDay, subDays } from "date-fns";
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Lock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DailyStudyLog } from "@/types";

interface ParentStudyLogGridProps {
  logs: DailyStudyLog[];
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (from: string, to: string) => void;
  isLoading?: boolean;
}

export function ParentStudyLogGrid({
  logs,
  dateFrom,
  dateTo,
  onDateRangeChange,
  isLoading,
}: ParentStudyLogGridProps) {
  const [selectedLog, setSelectedLog] = useState<DailyStudyLog | null>(null);

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

  const getLogForDate = (date: Date) => {
    return logs.find((log) => isSameDay(parseISO(log.log_date), date));
  };

  const getCellStatus = (log: DailyStudyLog | undefined, date: Date) => {
    if (!log) {
      const now = startOfDay(new Date());
      const logDate = startOfDay(date);
      const cutoffDate = subDays(now, 1);
      if (logDate < cutoffDate) return "missing";
      if (logDate >= now) return "future";
      return "pending";
    }
    if (log.is_late) return "late";
    return "submitted";
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between bg-card p-4 rounded-xl border border-border">
        <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Weekly Activity
        </h4>

        <div className="flex items-center gap-2">
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
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              {days.map((day) => (
                <th
                  key={day.toISOString()}
                  className="p-3 text-center font-medium text-muted-foreground min-w-[100px]"
                >
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] uppercase tracking-wider">
                      {format(day, "EEE")}
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {format(day, "dd MMM")}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-muted/50 transition-colors">
              {days.map((day) => {
                const log = getLogForDate(day);
                const status = getCellStatus(log, day);

                return (
                  <td key={day.toISOString()} className="p-2 text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => log && setSelectedLog(log)}
                            className={`w-full h-12 rounded-lg flex flex-col items-center justify-center transition-all ${
                              status === "submitted"
                                ? "bg-green-500/10 text-green-500 border border-green-500/20"
                                : status === "late"
                                  ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
                                  : status === "missing"
                                    ? "bg-red-500/10 text-red-500 border border-red-500/20"
                                    : "bg-muted/30 text-muted-foreground border border-border/50"
                            } ${log ? "hover:scale-[1.02] active:scale-95 cursor-pointer shadow-sm" : "cursor-default"}`}
                          >
                            {log ? (
                              <div className="flex flex-col items-center gap-1">
                                <CheckCircle2
                                  className={`h-4 w-4 ${status === "late" ? "text-yellow-500" : "text-green-500"}`}
                                />
                                <span className="text-[10px] font-bold truncate max-w-[80px] px-1">
                                  {log.title}
                                </span>
                              </div>
                            ) : (
                              <div
                                className={`h-1.5 w-1.5 rounded-full ${
                                  status === "missing"
                                    ? "bg-red-500 animate-pulse"
                                    : "bg-muted-foreground/30"
                                }`}
                              />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs p-3 space-y-2">
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-bold">{format(day, "MMM dd")}</span>
                            <Badge
                              variant="outline"
                              className={
                                status === "submitted"
                                  ? "text-green-500 border-green-500/30"
                                  : status === "late"
                                    ? "text-yellow-500 border-yellow-500/30"
                                    : status === "missing"
                                      ? "text-red-500 border-red-500/30"
                                      : "text-muted-foreground"
                              }
                            >
                              {status.toUpperCase()}
                            </Badge>
                          </div>
                          {log ? (
                            <>
                              <p className="font-medium text-sm">{log.title}</p>
                              <p className="text-xs text-muted-foreground line-clamp-3">
                                {log.description}
                              </p>
                              <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
                                Submitted: {format(parseISO(log.submitted_at), "MMM dd, hh:mm a")}
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {status === "missing"
                                ? "No progress log submitted for this date."
                                : "Awaiting child's submission..."}
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                );
              })}
            </tr>
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
                    <DialogTitle className="text-xl font-bold">{selectedLog.title}</DialogTitle>
                    <DialogDescription>
                      Progress log for {format(parseISO(selectedLog.log_date), "MMMM do, yyyy")}
                    </DialogDescription>
                  </div>
                  <Badge
                    variant={selectedLog.is_late ? "secondary" : "default"}
                    className={
                      selectedLog.is_late
                        ? "bg-yellow-500/10 text-yellow-500"
                        : "bg-green-500/10 text-green-500"
                    }
                  >
                    {selectedLog.is_late ? "Late Submission" : "On-time Submission"}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                    Student's Description
                  </h4>
                  <div className="rounded-xl bg-muted/30 p-4 border border-border whitespace-pre-wrap text-sm leading-relaxed">
                    {selectedLog.description}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase">
                      Submission Time
                    </h4>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-primary" />
                      {format(parseISO(selectedLog.submitted_at), "MMM dd, yyyy • hh:mm a")}
                    </div>
                  </div>
                  {selectedLog.attachment_url && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-muted-foreground uppercase">
                        Attachment
                      </h4>
                      <a
                        href={selectedLog.attachment_url}
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
