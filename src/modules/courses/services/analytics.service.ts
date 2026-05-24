// ---------------------------------------------------------------------------
// EduOS — LMS Analytics Service
// Wraps get_lms_course_analytics RPC (migration 011).
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type { ApiResponse, LmsCourseAnalytics } from "@/types";

const NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

export async function getCourseAnalytics(
  courseId: string,
): Promise<ApiResponse<LmsCourseAnalytics>> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase.rpc("get_lms_course_analytics", {
    p_course_id: courseId,
  });

  if (error) return { data: null, error: error.message, success: false };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      data: {
        total_enrollments: 0,
        active_enrollments: 0,
        completions: 0,
        avg_completion_pct: 0,
        avg_quiz_score: 0,
        total_submissions: 0,
      },
      error: null,
      success: true,
    };
  }

  return {
    data: {
      total_enrollments: Number(row.total_enrollments ?? 0),
      active_enrollments: Number(row.active_enrollments ?? 0),
      completions: Number(row.completions ?? 0),
      avg_completion_pct: Number(row.avg_completion_pct ?? 0),
      avg_quiz_score: Number(row.avg_quiz_score ?? 0),
      total_submissions: Number(row.total_submissions ?? 0),
    },
    error: null,
    success: true,
  };
}
