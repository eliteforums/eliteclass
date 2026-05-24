import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttendanceStatus, StudentAttendanceRecord } from "@/types";
import { cn } from "@/lib/utils";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns";

interface AttendanceCalendarProps {
  records: StudentAttendanceRecord[];
}

const STATUS_TONES: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500",
  absent: "bg-rose-500",
  late: "bg-amber-500",
  leave: "bg-sky-500",
};

function getRecordByDate(
  records: StudentAttendanceRecord[],
  date: Date,
): StudentAttendanceRecord | undefined {
  const key = format(date, "yyyy-MM-dd");
  return records.find(
    (record) => (record.session?.session_date ?? record.marked_at.slice(0, 10)) === key,
  );
}

export function AttendanceCalendar({ records }: AttendanceCalendarProps) {
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const days = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(monthEnd) });

  return (
    <Card className="border-border/60 bg-card/90 shadow-sm backdrop-blur">
      <CardHeader className="border-b border-border/60 bg-gradient-to-br from-background via-background to-muted/20 pb-5">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Attendance calendar
        </p>
        <CardTitle className="text-xl">Current month</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="py-2">
              {day}
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-2">
          {days.map((day) => {
            const record = getRecordByDate(records, day);
            const currentMonth = isSameMonth(day, today);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-24 rounded-2xl border border-border/60 p-2 transition-colors",
                  currentMonth ? "bg-muted/10" : "bg-muted/5 opacity-50",
                  isToday(day) && "ring-2 ring-primary/30",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      currentMonth ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {record ? (
                    <span className={cn("size-2.5 rounded-full", STATUS_TONES[record.status])} />
                  ) : null}
                </div>
                {record ? (
                  <div className="mt-3 space-y-2">
                    <Badge variant="secondary" className="w-fit capitalize">
                      {record.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {record.session?.session_type ?? "session"}
                    </p>
                  </div>
                ) : (
                  currentMonth && <p className="mt-3 text-xs text-muted-foreground">No record</p>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {Object.entries(STATUS_TONES).map(([status, tone]) => (
            <Badge key={status} variant="outline" className="gap-1.5 capitalize">
              <span className={cn("size-2 rounded-full", tone)} />
              {status}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
