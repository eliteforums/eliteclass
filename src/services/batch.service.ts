// ---------------------------------------------------------------------------
// EduOS — Batch Service
//
// Batch management APIs used by:
//   - Admin Batch Management page
//   - Attendance batch selectors
//   - Student assignment workflows
//
// Every function returns ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type {
  ApiResponse,
  AttendanceBatchOption,
  Batch,
  BatchStatus,
  CreateBatchPayload,
  PaginatedResponse,
  Student,
  StudentBatchInfo,
} from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

interface BatchListFilters {
  search?: string;
  status?: BatchStatus | "all";
  page?: number;
  pageSize?: number;
}

function toBatchCode(name: string): string {
  const normalized = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.slice(0, 30) || "BATCH";
}

function mapBatchRow(row: Batch): Batch {
  const fallbackStatus: BatchStatus = row.is_active ? "active" : "inactive";

  return {
    ...row,
    batch_code: row.batch_code || toBatchCode(row.name),
    course_name: row.course_name || "General",
    start_date: row.start_date || row.created_at?.slice(0, 10),
    end_date: row.end_date || row.created_at?.slice(0, 10),
    capacity: Number(row.capacity ?? 0),
    status: (row.status as BatchStatus | undefined) ?? fallbackStatus,
    archived_at: row.archived_at ?? null,
    student_count: row.student_count,
  };
}

export async function createBatch(payload: CreateBatchPayload): Promise<ApiResponse<Batch>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const batchCode = payload.batch_code?.trim().toUpperCase() || toBatchCode(payload.name);

  const { data, error } = await supabase
    .from("batches")
    .insert({
      institute_id: payload.institute_id,
      course_id: payload.course_id ?? null,
      name: payload.name.trim(),
      batch_code: batchCode,
      course_name: (payload.course_name ?? "").trim(),
      start_date: payload.start_date,
      end_date: payload.end_date,
      capacity: payload.capacity,
      status: payload.status ?? "active",
      academic_year: payload.academic_year.trim(),
      is_active: (payload.status ?? "active") === "active",
      archived_at: payload.status === "archived" ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };

  return { data: mapBatchRow(data as Batch), error: null, success: true };
}

export async function updateBatch(
  batchId: string,
  payload: Partial<Omit<CreateBatchPayload, "institute_id">>,
): Promise<ApiResponse<Batch>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const updates: Record<string, unknown> = {};

  if (payload.course_id !== undefined) updates.course_id = payload.course_id;
  if (payload.name !== undefined) updates.name = payload.name.trim();
  if (payload.batch_code !== undefined)
    updates.batch_code = payload.batch_code.trim().toUpperCase();
  if (payload.course_name !== undefined) updates.course_name = payload.course_name.trim();
  if (payload.start_date !== undefined) updates.start_date = payload.start_date;
  if (payload.end_date !== undefined) updates.end_date = payload.end_date;
  if (payload.capacity !== undefined) updates.capacity = payload.capacity;
  if (payload.academic_year !== undefined) updates.academic_year = payload.academic_year.trim();

  if (payload.status !== undefined) {
    updates.status = payload.status;
    updates.is_active = payload.status === "active";
    updates.archived_at = payload.status === "archived" ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase
    .from("batches")
    .update(updates)
    .eq("id", batchId)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message, success: false };

  return { data: mapBatchRow(data as Batch), error: null, success: true };
}

export async function archiveBatch(batchId: string): Promise<ApiResponse<Batch>> {
  return updateBatch(batchId, { status: "archived" });
}

export async function restoreBatch(batchId: string): Promise<ApiResponse<Batch>> {
  return updateBatch(batchId, { status: "active" });
}

export async function softDeleteBatch(batchId: string): Promise<ApiResponse<Batch>> {
  return updateBatch(batchId, { status: "inactive" });
}

export async function getStudentBatch(
  batchId: string,
  instituteId: string,
): Promise<ApiResponse<StudentBatchInfo>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("batches")
    .select("*")
    .eq("id", batchId)
    .eq("institute_id", instituteId)
    .single();

  if (error) return { data: null, error: error.message, success: false };

  const { data: studentsData } = await supabase
    .from("students")
    .select("id")
    .eq("institute_id", instituteId)
    .eq("batch_id", batchId);

  const batch = mapBatchRow(data as Batch) as StudentBatchInfo;

  return {
    data: {
      ...batch,
      timing: null,
      student_count: studentsData?.length ?? batch.student_count ?? 0,
    },
    error: null,
    success: true,
  };
}

export async function getBatchesByInstitute(
  instituteId: string,
  filters: BatchListFilters = {},
): Promise<ApiResponse<PaginatedResponse<Batch>>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, filters.pageSize ?? 10);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("batches")
    .select("*", { count: "exact" })
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters.search) {
    const search = filters.search.trim();
    query = query.or(
      `name.ilike.%${search}%,batch_code.ilike.%${search}%,course_name.ilike.%${search}%`,
    );
  }

  const { data, error, count } = await query.range(from, to);

  if (error) return { data: null, error: error.message, success: false };

  const batches = ((data ?? []) as Batch[]).map(mapBatchRow);

  if (batches.length > 0) {
    const batchIds = batches.map((b) => b.id);

    const { data: studentsData } = await supabase
      .from("students")
      .select("id,batch_id")
      .eq("institute_id", instituteId)
      .in("batch_id", batchIds);

    const counter = new Map<string, number>();

    for (const row of studentsData ?? []) {
      const batchId = (row as { batch_id: string | null }).batch_id;
      if (!batchId) continue;
      counter.set(batchId, (counter.get(batchId) ?? 0) + 1);
    }

    for (const batch of batches) {
      batch.student_count = counter.get(batch.id) ?? 0;
    }
  }

  const total = count ?? 0;

  return {
    data: {
      items: batches,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    },
    error: null,
    success: true,
  };
}

export async function getActiveAttendanceBatches(
  instituteId: string,
): Promise<ApiResponse<AttendanceBatchOption[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("batches")
    .select("id,name,course_name")
    .eq("institute_id", instituteId)
    .eq("status", "active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message, success: false };

  const options: AttendanceBatchOption[] = (data ?? []).map((row) => {
    const item = row as { id: string; name: string; course_name: string | null };
    const courseName = item.course_name ?? "General";
    return {
      id: item.id,
      name: item.name,
      course_name: courseName,
      label: `${item.name} • ${courseName}`,
    };
  });

  return { data: options, error: null, success: true };
}

export async function assignStudentsToBatch(
  instituteId: string,
  batchId: string,
  studentIds: string[],
): Promise<ApiResponse<{ count: number }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  if (studentIds.length === 0) {
    return { data: { count: 0 }, error: null, success: true };
  }

  const { data, error } = await supabase
    .from("students")
    .update({ batch_id: batchId })
    .eq("institute_id", instituteId)
    .in("id", studentIds)
    .select("id");

  if (error) return { data: null, error: error.message, success: false };

  return { data: { count: (data ?? []).length }, error: null, success: true };
}

export async function removeStudentsFromBatch(
  instituteId: string,
  batchId: string,
  studentIds: string[],
): Promise<ApiResponse<{ count: number }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  if (studentIds.length === 0) {
    return { data: { count: 0 }, error: null, success: true };
  }

  const { data, error } = await supabase
    .from("students")
    .update({ batch_id: null })
    .eq("institute_id", instituteId)
    .eq("batch_id", batchId)
    .in("id", studentIds)
    .select("id");

  if (error) return { data: null, error: error.message, success: false };

  return { data: { count: (data ?? []).length }, error: null, success: true };
}

export async function getBatchStudents(
  instituteId: string,
  batchId: string,
): Promise<ApiResponse<Student[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("students")
    .select("*, user:users(*)")
    .eq("institute_id", instituteId)
    .eq("batch_id", batchId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };

  return { data: (data ?? []) as Student[], error: null, success: true };
}

export async function getAssignableStudents(
  instituteId: string,
  search = "",
): Promise<ApiResponse<Student[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  let query = supabase
    .from("students")
    .select("*, user:users(*)")
    .eq("institute_id", instituteId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (search.trim()) {
    const q = search.trim();
    query = query.ilike("admission_no", `%${q}%`);
  }

  const { data, error } = await query;

  if (error) return { data: null, error: error.message, success: false };

  let rows = (data ?? []) as Student[];
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.filter(
      (student) =>
        student.admission_no.toLowerCase().includes(q) ||
        (student.user?.name ?? "").toLowerCase().includes(q) ||
        (student.user?.email ?? "").toLowerCase().includes(q),
    );
  }

  return { data: rows, error: null, success: true };
}
