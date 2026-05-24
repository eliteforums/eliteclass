import { supabase } from "@/lib/supabase";
import { getParentByUserId } from "@/services/parent.service";
import { getStudentAttendanceHistory, getStudentAttendanceStats } from "@/services/attendance.service";
import { getStudentBatch } from "@/services/batch.service";
import {
  getStudentDocuments,
  getStudentHistory,
  getStudentById,
  getStudentsByParentId,
} from "@/services/student.service";
import { getStudentFees } from "@/services/fee.service";
import type {
  ApiResponse,
  ParentPortalBootstrap,
  ParentPortalChildSnapshot,
  Student,
  StudentAttendanceRecord,
  StudentAttendanceStats,
  StudentBatchInfo,
  StudentCourse,
  StudentDocument,
  StudentFee,
  StudentHistory,
} from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

export async function getParentPortalBootstrap(
  userId: string,
  instituteId?: string,
): Promise<ApiResponse<ParentPortalBootstrap>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const parentResult = await getParentByUserId(userId, instituteId);
  if (!parentResult.success || !parentResult.data) {
    return { data: null, error: parentResult.error ?? "Parent profile not found.", success: false };
  }

  const childrenResult = await getStudentsByParentId(parentResult.data.id);
  if (!childrenResult.success || !childrenResult.data) {
    return { data: null, error: childrenResult.error ?? "Linked children not found.", success: false };
  }

  return {
    data: {
      parent: parentResult.data,
      children: childrenResult.data as Student[],
    },
    error: null,
    success: true,
  };
}

async function getStudentCourses(studentId: string): Promise<ApiResponse<StudentCourse[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("student_courses")
    .select("id, student_id, course_id, institute_id, enrolled_at, status, course:lms_courses(id, institute_id, title, code, is_active, created_at, updated_at)")
    .eq("student_id", studentId)
    .order("enrolled_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };

  const normalized = (data ?? []).map((row) =>
    row.course
      ? {
          ...row,
          course: {
            ...row.course,
            name: row.course.title,
          },
        }
      : row,
  );

  return { data: normalized as StudentCourse[], error: null, success: true };
}

export async function getParentChildSnapshot(studentId: string): Promise<ApiResponse<ParentPortalChildSnapshot>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const studentResult = await getStudentById(studentId);
  if (!studentResult.success || !studentResult.data) {
    return { data: null, error: studentResult.error ?? "Student profile not found.", success: false };
  }

  const student = studentResult.data;

  const [batchResult, statsResult, historyResult, feesResult, remarksResult, documentsResult, coursesResult] =
    await Promise.all([
      student.batch_id ? getStudentBatch(student.batch_id, student.institute_id) : Promise.resolve({ data: null, error: null, success: true } as ApiResponse<StudentBatchInfo | null>),
      getStudentAttendanceStats(student.id),
      getStudentAttendanceHistory(student.id),
      getStudentFees(student.id),
      getStudentHistory(student.id),
      getStudentDocuments(student.id),
      getStudentCourses(student.id),
    ]);

  if (!statsResult.success || !historyResult.success || !feesResult.success || !remarksResult.success || !documentsResult.success || !coursesResult.success) {
    const errorMessage =
      statsResult.error ??
      historyResult.error ??
      feesResult.error ??
      remarksResult.error ??
      documentsResult.error ??
      coursesResult.error ??
      "Failed to load parent portal snapshot.";
    return { data: null, error: errorMessage, success: false };
  }

  return {
    data: {
      student,
      batch: batchResult.data ?? null,
      stats: statsResult.data as StudentAttendanceStats,
      history: (historyResult.data ?? []) as StudentAttendanceRecord[],
      fees: (feesResult.data ?? []) as StudentFee[],
      student_history: (remarksResult.data ?? []) as StudentHistory[],
      documents: (documentsResult.data ?? []) as StudentDocument[],
      courses: (coursesResult.data ?? []) as StudentCourse[],
      generated_at: new Date().toISOString(),
    },
    error: null,
    success: true,
  };
}
