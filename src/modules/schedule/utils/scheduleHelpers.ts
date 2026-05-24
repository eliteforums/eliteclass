import type { Schedule, ScheduleException } from "@/types";

export const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_INDICES = [1, 2, 3, 4, 5, 6] as const;

export function formatScheduleTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(h, m ?? 0, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function getTodayDayIndex(): number {
  return new Date().getDay();
}

export function getScheduleLabel(schedule: Schedule): string {
  if (schedule.type === "break" || schedule.type === "lunch") {
    return schedule.title ?? schedule.type;
  }
  if (schedule.type === "exam" || schedule.type === "event") {
    return schedule.title ?? schedule.subject?.name ?? "Session";
  }
  return schedule.subject?.name ?? schedule.title ?? "Class";
}

export function groupSchedulesByDay(schedules: Schedule[]): Map<number, Schedule[]> {
  const map = new Map<number, Schedule[]>();
  for (const s of schedules) {
    const list = map.get(s.day_of_week) ?? [];
    list.push(s);
    map.set(s.day_of_week, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return map;
}

export function filterSchedulesForToday(schedules: Schedule[]): Schedule[] {
  const today = getTodayDayIndex();
  return schedules
    .filter((s) => s.day_of_week === today)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export function isDateBlocked(
  date: string,
  exceptions: ScheduleException[],
  batchId?: string | null,
): ScheduleException | null {
  const match = exceptions.find((ex) => {
    if (ex.exception_date !== date) return false;
    if (!ex.batch_id) return true;
    if (!batchId) return false;
    return ex.batch_id === batchId;
  });
  return match ?? null;
}

export function exportSchedulesToCsv(schedules: Schedule[]): string {
  const header = [
    "Day",
    "Start",
    "End",
    "Subject",
    "Teacher",
    "Room",
    "Batch",
    "Section",
    "Type",
    "Status",
  ].join(",");

  const rows = schedules.map((s) =>
    [
      DAY_LABELS[s.day_of_week],
      s.start_time,
      s.end_time,
      s.subject?.name ?? s.title ?? "",
      s.teacher?.user?.name ?? "",
      s.room?.room_name ?? "",
      s.batch?.name ?? "",
      s.section?.name ?? "",
      s.type,
      s.status,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );

  return [header, ...rows].join("\n");
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
