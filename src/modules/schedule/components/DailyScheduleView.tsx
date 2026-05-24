import { Clock, MapPin, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Schedule } from "@/types";
import { formatScheduleTime, getScheduleLabel } from "../utils/scheduleHelpers";

interface DailyScheduleViewProps {
  schedules: Schedule[];
  title?: string;
  emptyMessage?: string;
}

export function DailyScheduleView({
  schedules,
  title = "Today's schedule",
  emptyMessage = "No classes scheduled for today.",
}: DailyScheduleViewProps) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-5 py-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h3>
      </div>
      <div className="p-4 space-y-3">
        {schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</p>
        ) : (
          schedules.map((s) => (
            <ScheduleCard key={s.id} schedule={s} />
          ))
        )}
      </div>
    </div>
  );
}

function ScheduleCard({ schedule }: { schedule: Schedule }) {
  const label = getScheduleLabel(schedule);
  const isBreak = schedule.type === "break" || schedule.type === "lunch";

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        isBreak
          ? "border-dashed border-border bg-muted/20"
          : "border-border bg-muted/10 hover:bg-muted/20"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{label}</p>
          {schedule.batch?.name && (
            <p className="text-xs text-muted-foreground mt-0.5">{schedule.batch.name}</p>
          )}
        </div>
        <Badge variant="outline" className="shrink-0 capitalize text-[10px]">
          {schedule.type}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {formatScheduleTime(schedule.start_time)} – {formatScheduleTime(schedule.end_time)}
        </span>
        {schedule.teacher?.user?.name && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            {schedule.teacher.user.name}
          </span>
        )}
        {schedule.room?.room_name && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {schedule.room.room_name}
          </span>
        )}
      </div>
    </div>
  );
}
