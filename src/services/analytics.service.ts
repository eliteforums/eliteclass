// ---------------------------------------------------------------------------
// EduOS — Analytics Service (aggregated RPCs + caching)
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { cachedQuery, invalidateQueryCache } from "@/lib/query-cache";
import { runService } from "@/lib/service-runner";
import { getErrorMessage } from "@/utils/helpers";
import type {
  AnalyticsFilters,
  ApiResponse,
  InstituteAnalyticsBundle,
  InstituteAnalyticsOverview,
  InstituteAttendanceAnalytics,
  InstituteFeeAnalytics,
  InstituteScheduleAnalytics,
  StudentAnalyticsBundle,
} from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

const DEFAULT_RANGE_DAYS = 30;

function defaultDateRange(): { dateFrom: string; dateTo: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - DEFAULT_RANGE_DAYS);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

function cacheKey(prefix: string, filters: AnalyticsFilters): string {
  return `${prefix}:${filters.instituteId}:${filters.batchId ?? "all"}:${filters.dateFrom ?? ""}:${filters.dateTo ?? ""}`;
}

export async function getInstituteAnalyticsOverview(
  filters: AnalyticsFilters,
): Promise<ApiResponse<InstituteAnalyticsOverview>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  const range = defaultDateRange();
  const dateFrom = filters.dateFrom ?? range.dateFrom;
  const dateTo = filters.dateTo ?? range.dateTo;

  return runService("getInstituteAnalyticsOverview", async () => {
    const data = await cachedQuery(
      cacheKey("analytics:overview", { ...filters, dateFrom, dateTo }),
      45_000,
      async () => {
        const { data: row, error } = await supabase.rpc("get_institute_analytics_overview", {
          p_institute_id: filters.instituteId,
          p_batch_id: filters.batchId ?? null,
          p_date_from: dateFrom,
          p_date_to: dateTo,
        });
        if (error) throw new Error(getErrorMessage(error));
        return row as InstituteAnalyticsOverview;
      },
    );
    return { data, error: null, success: true };
  });
}

export async function getInstituteAttendanceAnalytics(
  filters: AnalyticsFilters,
): Promise<ApiResponse<InstituteAttendanceAnalytics>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  const range = defaultDateRange();
  const dateFrom = filters.dateFrom ?? range.dateFrom;
  const dateTo = filters.dateTo ?? range.dateTo;

  return runService("getInstituteAttendanceAnalytics", async () => {
    const data = await cachedQuery(
      cacheKey("analytics:attendance", { ...filters, dateFrom, dateTo }),
      45_000,
      async () => {
        const { data: row, error } = await supabase.rpc("get_institute_attendance_analytics", {
          p_institute_id: filters.instituteId,
          p_batch_id: filters.batchId ?? null,
          p_date_from: dateFrom,
          p_date_to: dateTo,
        });
        if (error) throw new Error(getErrorMessage(error));
        return row as InstituteAttendanceAnalytics;
      },
    );
    return { data, error: null, success: true };
  });
}

export async function getInstituteFeeAnalytics(
  filters: AnalyticsFilters,
): Promise<ApiResponse<InstituteFeeAnalytics>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  const range = defaultDateRange();
  const dateFrom = filters.dateFrom ?? range.dateFrom;
  const dateTo = filters.dateTo ?? range.dateTo;

  return runService("getInstituteFeeAnalytics", async () => {
    const data = await cachedQuery(
      cacheKey("analytics:fees", { ...filters, dateFrom, dateTo }),
      60_000,
      async () => {
        const { data: row, error } = await supabase.rpc("get_institute_fee_analytics", {
          p_institute_id: filters.instituteId,
          p_batch_id: filters.batchId ?? null,
          p_date_from: dateFrom,
          p_date_to: dateTo,
        });
        if (error) throw new Error(getErrorMessage(error));
        return row as InstituteFeeAnalytics;
      },
    );
    return { data, error: null, success: true };
  });
}

export async function getInstituteScheduleAnalytics(
  filters: AnalyticsFilters,
): Promise<ApiResponse<InstituteScheduleAnalytics>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  return runService("getInstituteScheduleAnalytics", async () => {
    const data = await cachedQuery(cacheKey("analytics:schedule", filters), 90_000, async () => {
      const { data: row, error } = await supabase.rpc("get_institute_schedule_analytics", {
        p_institute_id: filters.instituteId,
        p_batch_id: filters.batchId ?? null,
      });
      if (error) throw new Error(getErrorMessage(error));
      return row as InstituteScheduleAnalytics;
    });
    return { data, error: null, success: true };
  });
}

/** Parallel bundle for the admin analytics dashboard (single round-trip per section, cached). */
export async function getInstituteAnalyticsBundle(
  filters: AnalyticsFilters,
): Promise<ApiResponse<InstituteAnalyticsBundle>> {
  return runService("getInstituteAnalyticsBundle", async () => {
    const [overview, attendance, fees, schedule] = await Promise.all([
      getInstituteAnalyticsOverview(filters),
      getInstituteAttendanceAnalytics(filters),
      getInstituteFeeAnalytics(filters),
      getInstituteScheduleAnalytics(filters),
    ]);

    const firstError = overview.error ?? attendance.error ?? fees.error ?? schedule.error ?? null;

    if (firstError) {
      return { data: null, error: firstError, success: false };
    }

    if (!overview.data || !attendance.data || !fees.data || !schedule.data) {
      return { data: null, error: "Incomplete analytics response.", success: false };
    }

    return {
      data: {
        overview: overview.data,
        attendance: attendance.data,
        fees: fees.data,
        schedule: schedule.data,
      },
      error: null,
      success: true,
    };
  });
}

export async function getStudentAnalytics(
  studentId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<ApiResponse<StudentAnalyticsBundle>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  const range = defaultDateRange();

  return runService("getStudentAnalytics", async () => {
    const data = await cachedQuery(
      `analytics:student:${studentId}:${dateFrom ?? range.dateFrom}:${dateTo ?? range.dateTo}`,
      60_000,
      async () => {
        const { data: row, error } = await supabase.rpc("get_student_analytics", {
          p_student_id: studentId,
          p_date_from: dateFrom ?? range.dateFrom,
          p_date_to: dateTo ?? range.dateTo,
        });
        if (error) throw new Error(getErrorMessage(error));
        return row as StudentAnalyticsBundle;
      },
    );
    return { data, error: null, success: true };
  });
}

export function invalidateAnalyticsCache(instituteId?: string) {
  invalidateQueryCache(instituteId ? `analytics:` : "analytics:");
}
