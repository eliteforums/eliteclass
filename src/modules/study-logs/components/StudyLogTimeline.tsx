import { format, parseISO } from "date-fns";
import { CheckCircle2, Clock, Lock, AlertCircle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { DailyStudyLog } from "@/types";

interface StudyLogTimelineProps {
  logs: DailyStudyLog[];
  onSelect?: (date: string) => void;
  selectedDate?: string;
}

export function StudyLogTimeline({ logs, onSelect, selectedDate }: StudyLogTimelineProps) {
  // We want to show the last 7 days or all logs in the range
  // For now, let's just render the provided logs
  
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-3 mb-3">
          <Clock className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No submissions yet</p>
        <p className="text-xs text-muted-foreground">Your study logs will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => {
        const dateObj = parseISO(log.log_date);
        const isSelected = selectedDate === log.log_date;

        return (
          <Card 
            key={log.id} 
            className={`cursor-pointer transition-all border-border hover:border-primary/50 ${isSelected ? 'ring-2 ring-primary/20 border-primary' : 'bg-card'}`}
            onClick={() => onSelect?.(log.log_date)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {format(dateObj, "MMM do, yyyy")}
                    </span>
                    {log.is_locked ? (
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    )}
                  </div>
                  <h4 className="text-sm font-medium line-clamp-1">{log.title}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {log.description}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  {log.is_late ? (
                    <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 bg-yellow-500/5 text-[10px] py-0">
                      Late
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/5 text-[10px] py-0">
                      On-time
                    </Badge>
                  )}
                  {log.attachment_url && (
                    <a 
                      href={log.attachment_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 text-[10px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View Work <ExternalLink className="h-2 w-2" />
                    </a>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
