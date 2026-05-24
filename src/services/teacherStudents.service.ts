// ---------------------------------------------------------------------------
// EduOS — Teacher Students Service (staff-scoped RPCs + caching)
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { cachedQuery, invalidateQueryCache } from "@/lib/query-cache";
import { runService } from "@/lib/service-runner";
import { getErrorMessage } from "@/utils/helpers";
import type {
  ApiResponse,
  TeacherStudentsFilters,
  TeacherStudentsListResponse,
} from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

function attendanceRange(
  band: TeacherStudentsFilters["attendanceBand"],
): { min?: number; max?: number } {
  switch (band) {
    case "high":
      return { min: 85 };
    case "medium":
      return { min: 70, max: 84.99 };
    case "low":
      return { max: 69.99 };
    default:
      return {};
  }
}

function filtersCacheKey(staffId: string, filters: TeacherStudentsFilters, page: number, pageSize: number) {
  return `teacher-students:${staffId}:${page}:${pageSize}:${filters.search ?? ""}:${filters.batchId ?? ""}:${filters.status ?? ""}:${filters.attendanceBand ?? "all"}:${filters.performance ?? "all"}`;
}

export async function getTeacherStudents(
  staffId: string,
  filters: TeacherStudentsFilters = {},
  page = 1,
  pageSize = 20,
): Promise<ApiResponse<TeacherStudentsListResponse>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { min, max } = attendanceRange(filters.attendanceBand);
  const performance =
    filters.performance && filters.performance !== "all" ? filters.performance : null;

  return runService("getTeacherStudents", async () => {
    const data = await cachedQuery(
      filtersCacheKey(staffId, filters, page, pageSize),
      30_000,
      async () => {
        const { data: row, error } = await supabase.rpc("get_teacher_students", {
          p_staff_id: staffId,
          p_search: filters.search?.trim() || null,
          p_batch_id: filters.batchId ?? null,
          p_status: filters.status ?? null,
          p_attendance_min: min ?? null,
          p_attendance_max: max ?? null,
          p_performance: performance,
          p_page: page,
          p_page_size: pageSize,
        });
        if (error) throw new Error(getErrorMessage(error));
        return row as TeacherStudentsListResponse;
      },
    );
    return { data, error: null, success: true };
  });
}

export async function getTeacherStudentCount(staffId: string): Promise<ApiResponse<number>> {
  const result = await getTeacherStudents(staffId, {}, 1, 1);
  if (!result.success || !result.data) {
    return { data: null, error: result.error, success: false };
  }
  return { data: result.data.meta.total, error: null, success: true };
}

export function invalidateTeacherStudentsCache(staffId?: string) {
  invalidateQueryCache(staffId ? `teacher-students:${staffId}` : "teacher-students:");
}
