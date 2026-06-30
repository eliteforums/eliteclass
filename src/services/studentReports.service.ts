// ---------------------------------------------------------------------------
// Student Reports service — manual report cards per student
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { getErrorMessage } from "@/utils/helpers";
import type { ApiResponse } from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

export interface ReportEntry {
  subject: string;
  task_type: string; // e.g. "Test", "Assignment", "Project", "Quiz", "Participation"
  task_name: string;
  marks_obtained: number;
  max_marks: number;
  remark?: string | null;
}

export interface StudentReport {
  id: string;
  institute_id: string;
  student_id: string;
  title: string;
  period: string | null;
  entries: ReportEntry[];
  overall_remark: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // joined fields (optional)
  student_name?: string;
  student_admission_no?: string;
  created_by_name?: string;
}

export interface CreateStudentReportPayload {
  institute_id: string;
  student_id: string;
  title: string;
  period?: string | null;
  entries: ReportEntry[];
  overall_remark?: string | null;
  created_by: string;
}

export interface UpdateStudentReportPayload {
  title?: string;
  period?: string | null;
  entries?: ReportEntry[];
  overall_remark?: string | null;
}

// ── List ───────────────────────────────────────────────────────────────────

export async function listReportsByStudent(
  studentId: string,
): Promise<ApiResponse<StudentReport[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  const { data, error } = await supabase
    .from("student_reports")
    .select("*, creator:users!created_by(name)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) return { data: null, error: getErrorMessage(error), success: false };
  const rows = (data as any[]).map((r) => ({
    ...r,
    created_by_name: r.creator?.name,
  })) as StudentReport[];
  return { data: rows, error: null, success: true };
}

export async function listReportsByInstitute(
  instituteId: string,
): Promise<ApiResponse<StudentReport[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  const { data, error } = await supabase
    .from("student_reports")
    .select(
      "*, creator:users!created_by(name), student:students(admission_no, user:users(name))",
    )
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { data: null, error: getErrorMessage(error), success: false };
  const rows = (data as any[]).map((r) => ({
    ...r,
    created_by_name: r.creator?.name,
    student_name: r.student?.user?.name,
    student_admission_no: r.student?.admission_no,
  })) as StudentReport[];
  return { data: rows, error: null, success: true };
}

// ── CRUD ───────────────────────────────────────────────────────────────────

export async function createStudentReport(
  payload: CreateStudentReportPayload,
): Promise<ApiResponse<StudentReport>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  if (!payload.title.trim()) {
    return { data: null, error: "Report title is required.", success: false };
  }
  if (payload.entries.length === 0) {
    return { data: null, error: "Add at least one entry.", success: false };
  }
  // Validate every entry
  for (const e of payload.entries) {
    if (!e.subject.trim() || !e.task_name.trim()) {
      return { data: null, error: "Subject and task name are required for every entry.", success: false };
    }
    if (e.max_marks <= 0) {
      return { data: null, error: "Max marks must be greater than 0.", success: false };
    }
    if (e.marks_obtained < 0 || e.marks_obtained > e.max_marks) {
      return { data: null, error: `Marks must be between 0 and ${e.max_marks}.`, success: false };
    }
  }
  const { data, error } = await supabase
    .from("student_reports")
    .insert({
      institute_id: payload.institute_id,
      student_id: payload.student_id,
      title: payload.title.trim(),
      period: payload.period?.trim() || null,
      entries: payload.entries,
      overall_remark: payload.overall_remark?.trim() || null,
      created_by: payload.created_by,
    })
    .select()
    .single();
  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as StudentReport, error: null, success: true };
}

export async function updateStudentReport(
  reportId: string,
  payload: UpdateStudentReportPayload,
): Promise<ApiResponse<StudentReport>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  const updates: Record<string, unknown> = {};
  if (payload.title !== undefined) updates.title = payload.title.trim();
  if (payload.period !== undefined) updates.period = payload.period?.trim() || null;
  if (payload.entries !== undefined) updates.entries = payload.entries;
  if (payload.overall_remark !== undefined) {
    updates.overall_remark = payload.overall_remark?.trim() || null;
  }
  const { data, error } = await supabase
    .from("student_reports")
    .update(updates)
    .eq("id", reportId)
    .select()
    .single();
  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as StudentReport, error: null, success: true };
}

export async function deleteStudentReport(
  reportId: string,
): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;
  const { error } = await supabase
    .from("student_reports")
    .delete()
    .eq("id", reportId);
  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: null, error: null, success: true };
}

// ── Computed helpers ───────────────────────────────────────────────────────

export function computeReportTotals(entries: ReportEntry[]): {
  total: number;
  max: number;
  percentage: number;
} {
  let total = 0;
  let max = 0;
  for (const e of entries) {
    total += Number(e.marks_obtained) || 0;
    max += Number(e.max_marks) || 0;
  }
  return {
    total,
    max,
    percentage: max > 0 ? (total / max) * 100 : 0,
  };
}
