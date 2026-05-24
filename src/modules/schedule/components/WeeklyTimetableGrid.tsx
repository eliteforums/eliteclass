import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Schedule } from "@/types";
import {
  DAY_SHORT,
  WEEKDAY_INDICES,
  formatScheduleTime,
  getScheduleLabel,
  groupSchedulesByDay,
} from "../utils/scheduleHelpers";

interface WeeklyTimetableGridProps {
  schedules: Schedule[];
  editable?: boolean;
  onEdit?: (schedule: Schedule) => void;
  onDelete?: (schedule: Schedule) => void;
}

const TYPE_COLORS: Record<string, string> = {
  regular: "border-primary/30 bg-primary/10",
  exam: "border-orange-500/30 bg-orange-500/10",
  break: "border-dashed border-border bg-muted/30",
  lunch: "border-dashed border-border bg-muted/30",
  event: "border-purple-500/30 bg-purple-500/10",
};

export function WeeklyTimetableGrid({
  schedules,
  editable = false,
  onEdit,
  onDelete,
}: WeeklyTimetableGridProps) {
  const byDay = groupSchedulesByDay(schedules);

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <div className="grid min-w-[720px] grid-cols-6 divide-x divide-border">
        {WEEKDAY_INDICES.map((day) => (
          <div key={day} className="min-h-[200px]">
            <div className="sticky top-0 border-b border-border bg-muted/40 px-3 py-2.5 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-foreground">
                {DAY_SHORT[day]}
              </p>
            </div>
            <div className="space-y-2 p-2">
              {(byDay.get(day) ?? []).length === 0 ? (
                <p className="px-1 py-6 text-center text-[10px] text-muted-foreground">—</p>
              ) : (
                (byDay.get(day) ?? []).map((slot) => (
                  <SlotCell
                    key={slot.id}
                    slot={slot}
                    editable={editable}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlotCell({
  slot,
  editable,
  onEdit,
  onDelete,
}: {
  slot: Schedule;
  editable: boolean;
  onEdit?: (s: Schedule) => void;
  onDelete?: (s: Schedule) => void;
}) {
  const color = TYPE_COLORS[slot.type] ?? TYPE_COLORS.regular;

  return (
    <div className={`group relative rounded-lg border p-2 text-left ${color}`}>
      <p className="text-[11px] font-semibold text-foreground leading-tight">
        {getScheduleLabel(slot)}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {formatScheduleTime(slot.start_time)} – {formatScheduleTime(slot.end_time)}
      </p>
      {slot.room?.room_name && (
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{slot.room.room_name}</p>
      )}
      <div className="mt-1 flex flex-wrap gap-1">
        {slot.status === "draft" && (
          <Badge variant="secondary" className="h-4 px-1 text-[9px]">
            draft
          </Badge>
        )}
      </div>
      {editable && (
        <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(slot)}
              className="rounded p-0.5 hover:bg-background/80"
              aria-label="Edit slot"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(slot)}
              className="rounded p-0.5 text-destructive hover:bg-destructive/10"
              aria-label="Delete slot"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
