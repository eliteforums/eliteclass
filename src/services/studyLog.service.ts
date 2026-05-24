// ---------------------------------------------------------------------------
// EduOS — Daily Study Log Service
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { getErrorMessage } from "@/utils/helpers";
import type {
  DailyStudyLog,
  StudentStudyLogReport,
  CreateStudyLogPayload,
  UpdateStudyLogPayload,
  ApiResponse,
} from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

/**
 * Fetch a student's own logs for a given batch and date range.
 */
export async function getMyStudyLogs(
    studentId: string,
    batchId: string,
    dateFrom: string,
    dateTo: string
): Promise<ApiResponse<DailyStudyLog[]>> {
    if (!supabase) return SUPABASE_NOT_CONFIGURED;

    const { data, error } = await supabase
        .from("daily_study_logs")
        .select("*")
        .eq("student_id", studentId)
        .eq("batch_id", batchId)
        .gte("log_date", dateFrom)
        .lte("log_date", dateTo)
        .order("log_date", { ascending: false });

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    return { data: data as DailyStudyLog[], error: null, success: true };
}

/**
 * Submit or update today's/yesterday's study log.
 * The RLS policy handles the "locked" business logic.
 */
export async function upsertStudyLog(
    payload: CreateStudyLogPayload
): Promise<ApiResponse<DailyStudyLog>> {
    if (!supabase) return SUPABASE_NOT_CONFIGURED;

    const { data, error } = await supabase
        .from("daily_study_logs")
        .upsert({
            student_id: payload.student_id,
            batch_id: payload.batch_id,
            institute_id: payload.institute_id,
            title: payload.title,
            description: payload.description,
            log_date: payload.log_date,
            attachment_url: payload.attachment_url ?? null,
            submitted_at: new Date().toISOString(),
        }, { onConflict: "student_id,batch_id,log_date" })
        .select()
        .single();

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    return { data: data as DailyStudyLog, error: null, success: true };
}

/**
 * Staff/Admin: Fetch batch report for the grid view.
 * Uses the optimized RPC.
 */
export async function getBatchStudyLogsReport(
    batchId: string,
    dateFrom: string,
    dateTo: string
): Promise<ApiResponse<StudentStudyLogReport[]>> {
    if (!supabase) return SUPABASE_NOT_CONFIGURED;

    const { data, error } = await supabase.rpc("get_batch_study_logs_report", {
        p_batch_id: batchId,
        p_date_from: dateFrom,
        p_date_to: dateTo,
    });

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    return { data: data as StudentStudyLogReport[], error: null, success: true };
}

/**
 * Fetch single log details.
 */
export async function getStudyLogDetails(logId: string): Promise<ApiResponse<DailyStudyLog>> {
    if (!supabase) return SUPABASE_NOT_CONFIGURED;

    const { data, error } = await supabase
        .from("daily_study_logs")
        .select("*")
        .eq("id", logId)
        .single();

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    return { data: data as DailyStudyLog, error: null, success: true };
}
