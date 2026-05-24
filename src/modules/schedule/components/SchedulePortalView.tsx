import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Schedule, ScheduleException } from "@/types";
import { useMountedRef } from "@/hooks/useMountedRef";
import {
  filterSchedulesForToday,
  getTodayDayIndex,
  isDateBlocked,
} from "../utils/scheduleHelpers";
import { DailyScheduleView } from "./DailyScheduleView";
import { WeeklyTimetableGrid } from "./WeeklyTimetableGrid";
import { ScheduleSkeleton } from "./ScheduleSkeleton";

interface SchedulePortalViewProps {
  title: string;
  subtitle?: string;
  loadSchedules: () => Promise<{ success: boolean; data: Schedule[] | null; error: string | null }>;
  loadExceptions?: () => Promise<{
    success: boolean;
    data: ScheduleException[] | null;
    error: string | null;
  }>;
  batchId?: string | null;
  refreshKey?: string | number;
}

export function SchedulePortalView({
  title,
  subtitle,
  loadSchedules,
  loadExceptions,
  batchId,
  refreshKey,
}: SchedulePortalViewProps) {
  const mounted = useMountedRef();
  const loadSchedulesRef = useRef(loadSchedules);
  const loadExceptionsRef = useRef(loadExceptions);

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  loadSchedulesRef.current = loadSchedules;
  loadExceptionsRef.current = loadExceptions;

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayBlock = isDateBlocked(todayIso, exceptions, batchId);

  const todaySchedules = useMemo(() => filterSchedulesForToday(schedules), [schedules]);

  const upcoming = useMemo(() => {
    const today = getTodayDayIndex();
    return schedules
      .filter((s) => s.day_of_week >= today)
      .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
      .slice(0, 8);
  }, [schedules]);

  const refresh = useCallback(async () => {
    if (!mounted.current) return;
    setIsLoading(true);
    setError(null);

    try {
      const result = await loadSchedulesRef.current();
      if (!mounted.current) return;

      if (result.success && result.data) {
        setSchedules(result.data);
      } else if (result.error) {
        setError(result.error);
        setSchedules([]);
      } else {
        setSchedules([]);
      }

      if (loadExceptionsRef.current) {
        const ex = await loadExceptionsRef.current();
        if (mounted.current && ex.success && ex.data) {
          setExceptions(ex.data);
        }
      }
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Failed to load schedule.");
      setSchedules([]);
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, [mounted]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey, batchId]);

  if (isLoading) {
    return <ScheduleSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="h-4 w-4 text-primary" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Timetable
            </p>
          </div>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {todayBlock && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <span className="font-medium">{todayBlock.title}</span>
          {todayBlock.description && (
            <span className="text-muted-foreground"> — {todayBlock.description}</span>
          )}
        </div>
      )}

      {schedules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-12 text-center">
          <p className="text-sm text-muted-foreground">No published timetable available yet.</p>
        </div>
      ) : (
        <Tabs defaultValue="today">
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">Weekly</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          </TabsList>
          <TabsContent value="today" className="mt-4">
            <DailyScheduleView schedules={todaySchedules} />
          </TabsContent>
          <TabsContent value="week" className="mt-4">
            <WeeklyTimetableGrid schedules={schedules} />
          </TabsContent>
          <TabsContent value="upcoming" className="mt-4">
            <DailyScheduleView
              schedules={upcoming}
              title="Upcoming sessions"
              emptyMessage="No upcoming sessions."
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
