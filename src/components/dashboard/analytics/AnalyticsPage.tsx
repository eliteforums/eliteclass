// ---------------------------------------------------------------------------
// EliteClass — Analytics Page Component
// Calls getInstituteAnalyticsBundle() with real Supabase RPC data.
// Handles loading, error, and zero-state UI with date range + batch filters.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { AnalyticsFilters } from "./AnalyticsFilters";
import { AnalyticsErrorState } from "./AnalyticsErrorState";
import { AnalyticsZeroState } from "./AnalyticsZeroState";
import { AnalyticsSkeleton } from "@/modules/analytics/components/AnalyticsSkeleton";
import { InstituteOverviewSection } from "@/modules/analytics/components/InstituteOverviewSection";
import { exportAnalyticsCsv } from "@/modules/analytics/utils/exportAnalytics";
import {
  AttendanceAnalyticsChartsLazy,
  FeeAnalyticsChartsLazy,
  ScheduleStaffAnalyticsLazy,
} from "@/lib/lazy-routes";
import type { Batch, InstituteAnalyticsBundle } from "@/types";

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/**
 * Determines if the analytics bundle represents a "zero state" — i.e. no
 * meaningful data exists for the selected filters.
 */
function isBundleEmpty(bundle: InstituteAnalyticsBundle): boolean {
  const { overview } = bundle;
  return (
    overview.students.total === 0 &&
    overview.attendance.total_records === 0 &&
    overview.fees.collected_in_range === 0 &&
    overview.fees.pending === 0
  );
}

export function AnalyticsPage() {
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

  // Resolve the selected batch name for the zero-state message
  const selectedBatchName = useMemo(() => {
    if (!batchId) return undefined;
    return batches.find((b) => b.id === batchId)?.name;
  }, [batchId, batches]);

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
      setError(result.error ?? "Failed to load analytics. Please try again.");
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

  function handleRetry() {
    invalidateAnalyticsCache();
    void loadAnalytics();
  }

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

      <AnalyticsFilters
        batches={batches}
        batchId={batchId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onBatchChange={setBatchId}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />

      {/* Error state with retry */}
      {error && !isLoading && (
        <div className="mt-6">
          <AnalyticsErrorState message={error} onRetry={handleRetry} />
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="mt-6">
          <AnalyticsSkeleton />
        </div>
      )}

      {/* Zero state — bundle loaded but no meaningful data */}
      {!isLoading && !error && bundle && isBundleEmpty(bundle) && (
        <div className="mt-6">
          <AnalyticsZeroState
            dateFrom={debouncedFrom}
            dateTo={debouncedTo}
            batchName={selectedBatchName}
          />
        </div>
      )}

      {/* Data state — bundle loaded with meaningful data */}
      {!isLoading && !error && bundle && !isBundleEmpty(bundle) && (
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
              <AttendanceAnalyticsChartsLazy data={bundle.attendance} />
            </TabsContent>
            <TabsContent value="fees" className="mt-4">
              <FeeAnalyticsChartsLazy data={bundle.fees} />
            </TabsContent>
            <TabsContent value="schedule" className="mt-4">
              <ScheduleStaffAnalyticsLazy data={bundle.schedule} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </ProtectedRoute>
  );
}
