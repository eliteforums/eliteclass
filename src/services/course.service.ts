// ---------------------------------------------------------------------------
// EduOS — Course Service
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type { Course, ApiResponse } from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

/** Return all courses for an institute. */
export async function getCoursesByInstitute(
  instituteId: string,
  activeOnly = true
): Promise<ApiResponse<Course[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  let query = supabase
    .from("lms_courses")
    .select("*")
    .eq("institute_id", instituteId)
    .order("title", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) return { data: null, error: error.message, success: false };

  const rows = (data ?? []) as any[];
  const mapped: Course[] = rows.map((r) => ({
    ...r,
    name: r.title,
  }));

  return { data: mapped, error: null, success: true };
}
