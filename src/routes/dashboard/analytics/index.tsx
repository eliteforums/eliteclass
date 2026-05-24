// ---------------------------------------------------------------------------
// EduOS — Analytics & Reporting (/dashboard/analytics)
// ---------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/store/authStore";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMountedRef } from "@/hooks/useMountedRef";
import { getBatchesByInstitute } from "@/services/batch.service";
import {
  getInstituteAnalyticsBundle,
  invalidateAnalyticsCache,
} from "@/services/analytics.service";
import { AnalyticsFiltersBar } from "@/modules/analytics/components/AnalyticsFiltersBar";
import { AnalyticsSkeleton } from "@/modules/analytics/components/AnalyticsSkeleton";
import { InstituteOverviewSection } from "@/modules/analytics/components/InstituteOverviewSection";
import { exportAnalyticsCsv } from "@/modules/analytics/utils/exportAnalytics";
import type { Batch, InstituteAnalyticsBundle } from "@/types";

const AttendanceAnalyticsCharts = lazy(() =>
  import("@/modules/analytics/components/AttendanceAnalyticsCharts").then((m) => ({
    default: m.AttendanceAnalyticsCharts,
  })),
);
const FeeAnalyticsCharts = lazy(() =>
  import("@/modules/analytics/components/FeeAnalyticsCharts").then((m) => ({
    default: m.FeeAnalyticsCharts,
  })),
);
const ScheduleStaffAnalytics = lazy(() =>
  import("@/modules/analytics/components/ScheduleStaffAnalytics").then((m) => ({
    default: m.ScheduleStaffAnalytics,
  })),
);

export const Route = createFileRoute("/dashboard/analytics/")({
  head: () => ({ meta: [{ title: "Analytics — EduOS" }] }),
  component: AnalyticsPage,
});

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function ChartFallback() {
  return <div className="h-[320px] animate-pulse rounded-xl bg-muted/40" />;
}

function AnalyticsPage() {
  const { user, institute } = useAuthStore();
  const instituteId = user?.institute_id ?? "";
  const mounted = useMountedRef();
  const initialRange = useMemo(() => defaultRange(), []);

  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [bundle, setBundle] = useState<InstituteAnalyticsBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedBatchId = useDebouncedValue(batchId, 300);
  const debouncedFrom = useDebouncedValue(dateFrom, 400);
  const debouncedTo = useDebouncedValue(dateTo, 400);

  const filters = useMemo(
    () => ({
      instituteId,
      batchId: debouncedBatchId || undefined,
      dateFrom: debouncedFrom,
      dateTo: debouncedTo,
    }),
    [instituteId, debouncedBatchId, debouncedFrom, debouncedTo],
  );

  const loadBatches = useCallback(async () => {
    if (!instituteId) return;
    const res = await getBatchesByInstitute(instituteId);
    if (res.success && res.data) setBatches(res.data.items ?? []);
  }, [instituteId]);

  const loadAnalytics = useCallback(async () => {
    if (!instituteId) return;
    setIsLoading(true);
    setError(null);
    const result = await getInstituteAnalyticsBundle(filters);
    if (!mounted.current) return;
    if (result.success && result.data) {
      setBundle(result.data);
    } else {
      setBundle(null);
      setError(result.error ?? "Failed to load analytics.");
    }
    setIsLoading(false);
  }, [filters, instituteId, mounted]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    if (!instituteId) return;
    void loadAnalytics();
  }, [loadAnalytics, instituteId]);

  function handleRefresh() {
    invalidateAnalyticsCache();
    void loadAnalytics();
    toast.success("Analytics refreshed");
  }

  function handleExport() {
    if (!bundle) return;
    exportAnalyticsCsv(bundle, institute?.name ?? "institute");
    toast.success("Report exported as CSV");
  }

  const insights = useMemo(() => {
    if (!bundle) return [];
    const items: string[] = [];
    if (bundle.overview.attendance.rate < 75) {
      items.push(
        "Institute attendance is below 75% for the selected period — review batch breakdown.",
      );
    }
    if (bundle.overview.fees.overdue > 0) {
      items.push("Outstanding overdue fees detected — follow up with finance team.");
    }
    if (bundle.overview.schedules.draft > bundle.overview.schedules.published) {
      items.push(
        "More draft timetables than published — publish schedules for parent/student visibility.",
      );
    }
    if (items.length === 0) {
      items.push("Key metrics are within normal ranges for the selected period.");
    }
    return items;
  }, [bundle]);

  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      <PageHeader
        title="Analytics & Reporting"
        subtitle="Institute-wide insights across attendance, fees, academics, and schedules."
        actions={
          <>
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={!bundle}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </>
        }
      />

      <AnalyticsFiltersBar
        batches={batches}
        batchId={batchId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onBatchChange={setBatchId}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="mt-6">
          <AnalyticsSkeleton />
        </div>
      ) : bundle ? (
        <div className="mt-6 space-y-6">
          <InstituteOverviewSection overview={bundle.overview} />

          {insights.length > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Insights</p>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                {insights.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <Tabs defaultValue="attendance">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="fees">Fees & billing</TabsTrigger>
              <TabsTrigger value="schedule">Schedule & staff</TabsTrigger>
            </TabsList>
            <TabsContent value="attendance" className="mt-4">
              <Suspense fallback={<ChartFallback />}>
                <AttendanceAnalyticsCharts data={bundle.attendance} />
              </Suspense>
            </TabsContent>
            <TabsContent value="fees" className="mt-4">
              <Suspense fallback={<ChartFallback />}>
                <FeeAnalyticsCharts data={bundle.fees} />
              </Suspense>
            </TabsContent>
            <TabsContent value="schedule" className="mt-4">
              <Suspense fallback={<ChartFallback />}>
                <ScheduleStaffAnalytics data={bundle.schedule} />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </ProtectedRoute>
  );
}
