// ---------------------------------------------------------------------------
// EduOS — Attendance Service
// Every function returns ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { isAbortError, getErrorMessage } from "@/utils/helpers";
import type {
  AttendanceSession,
  AttendanceRecord,
  Batch,
  AttendanceSummary,
  BulkAttendanceEntry,
  AttendanceStatus,
  ApiResponse,
  AttendanceTrendPoint,
  StudentAttendanceRecord,
  StudentAttendanceStats,
} from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

const SESSION_SELECT =
  "id, institute_id, batch_id, session_date, session_type, topic, is_locked, notes, batch:batches(id, name), conductor:users!conducted_by(id, name)";

const ATTENDANCE_DEBUG = import.meta.env.DEV;

function debugAttendance(label: string, payload: unknown) {
  if (ATTENDANCE_DEBUG) console.debug(`[attendance.service] ${label}`, payload);
}

// ── Session CRUD ──────────────────────────────────────────────────────────────

export async function createAttendanceSession(payload: {
  institute_id: string;
  batch_id: string | null;
  course_id: string | null;
  conducted_by: string;
  session_date: string;
  session_type: "daily" | "lecture";
  topic?: string;
  notes?: string;
}): Promise<ApiResponse<AttendanceSession>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  if (!payload.batch_id) {
    return {
      data: null,
      error: "A batch must be selected before creating an attendance session.",
      success: false,
    };
  }

  const insertRow = {
      institute_id: payload.institute_id,
      batch_id: payload.batch_id,
      course_id: payload.course_id,
      conducted_by: payload.conducted_by,
      session_date: payload.session_date,
      session_type: payload.session_type,
      topic: payload.topic ?? null,
      notes: payload.notes ?? null,
      is_locked: false,
    };

  debugAttendance("createAttendanceSession:payload", insertRow);

  const { data, error } = await supabase
    .from("attendance_sessions")
    .insert(insertRow)
    .select(SESSION_SELECT)
    .single();

  debugAttendance("createAttendanceSession:response", { data, error });

  if (error) return { data: null, error: getErrorMessage(error), success: false };

  const session = data as AttendanceSession;
  if (!session.batch_id && session.batch?.id) {
    session.batch_id = session.batch.id;
  }

  return { data: session, error: null, success: true };
}

export async function getAttendanceSessions(
  instituteId: string,
  filters?: { batchId?: string; dateFrom?: string; dateTo?: string },
  abortSignal?: AbortSignal,
): Promise<ApiResponse<AttendanceSession[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  let query = supabase
    .from("attendance_sessions")
    .select(SESSION_SELECT)
    .eq("institute_id", instituteId)
    .order("session_date", { ascending: false });

  if (filters?.batchId) query = query.eq("batch_id", filters.batchId);
  if (filters?.dateFrom) query = query.gte("session_date", filters.dateFrom);
  if (filters?.dateTo) query = query.lte("session_date", filters.dateTo);

  try {
    const { data, error } = await query.abortSignal(abortSignal);
    if (error) return { data: null, error: getErrorMessage(error), success: false };

    const sessions = ((data ?? []) as AttendanceSession[]).map((session) => {
      if (!session.batch_id && session.batch?.id) {
        return { ...session, batch_id: session.batch.id };
      }
      return session;
    });

    return { data: sessions, error: null, success: true };
  } catch (err) {
    if (isAbortError(err)) return { data: null, error: "Aborted", success: false };

    const message = getErrorMessage(err, "An unexpected error occurred in getAttendanceSessions");
    console.error("[getAttendanceSessions] exception:", err);
    return { data: null, error: message, success: false };
  }
}

/**
 * Fetch a single session with all its attendance records.
 */
export async function getSessionWithRecords(
  sessionId: string,
): Promise<ApiResponse<AttendanceSession & { records: AttendanceRecord[] }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data, error } = await supabase
      .from("attendance_sessions")
      .select("*, records:attendance_records(*)")
      .eq("id", sessionId)
      .single();

    if (error) return { data: null, error: getErrorMessage(error), success: false };
    return { data: data as any, error: null, success: true };
  } catch (err) {
    const message = getErrorMessage(err, "Failed to load session details.");
    console.error("[getSessionWithRecords] exception:", err);
    return { data: null, error: message, success: false };
  }
}

/**
 * Save attendance records for a session.
 */
export async function saveAttendanceRecords(
  sessionId: string,
  instituteId: string,
  records: { student_id: string; status: "present" | "absent" | "late" | "excused"; notes?: string }[],
): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    // ── Step 1: Delete existing records for this session ─────────────────────
    const { error: deleteError } = await supabase
      .from("attendance_records")
      .delete()
      .eq("session_id", sessionId);

    if (deleteError) return { data: null, error: getErrorMessage(deleteError), success: false };

    // ── Step 2: Insert new records ───────────────────────────────────────────
    const rows = records.map((r) => ({
      ...r,
      session_id: sessionId,
      institute_id: instituteId,
    }));

    const { error: insertError } = await supabase.from("attendance_records").insert(rows);

    if (insertError) return { data: null, error: getErrorMessage(insertError), success: false };

    return { data: null, error: null, success: true };
  } catch (err) {
    const message = getErrorMessage(err, "Failed to save attendance.");
    console.error("[saveAttendanceRecords] exception:", err);
    return { data: null, error: message, success: false };
  }
}

/**
 * Fetch attendance stats for a batch.
 */
export async function getBatchAttendanceStats(
  batchId: string,
): Promise<ApiResponse<{ total_sessions: number; average_attendance: number }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    const { data: sessions, error: sessionsError } = await supabase
      .from("attendance_sessions")
      .select("id")
      .eq("batch_id", batchId);

    if (sessionsError) return { data: null, error: getErrorMessage(sessionsError), success: false };

    if (!sessions || sessions.length === 0) {
      return { data: { total_sessions: 0, average_attendance: 0 }, error: null, success: true };
    }

    const sessionIds = sessions.map((s) => s.id);

    const { data: records, error: recordsError } = await supabase
      .from("attendance_records")
      .select("status")
      .in("session_id", sessionIds);

    if (recordsError) return { data: null, error: getErrorMessage(recordsError), success: false };

    const totalRecords = records?.length ?? 0;
    const presentRecords = records?.filter((r) => r.status === "present" || r.status === "late").length ?? 0;

    return {
      data: {
        total_sessions: sessions.length,
        average_attendance: totalRecords > 0 ? (presentRecords / totalRecords) * 100 : 0,
      },
      error: null,
      success: true,
    };
  } catch (err) {
    const message = getErrorMessage(err, "Failed to load attendance stats.");
    console.error("[getBatchAttendanceStats] exception:", err);
    return { data: null, error: message, success: false };
  }
}

// ── Attendance marking ────────────────────────────────────────────────────────

export async function markAttendance(payload: {
  session_id: string;
  student_id: string;
  institute_id: string;
  batch_id?: string | null;
  status: AttendanceStatus;
  notes?: string;
  marked_by: string;
}): Promise<ApiResponse<AttendanceRecord>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("attendance_records")
    .upsert(
      {
        session_id: payload.session_id,
        student_id: payload.student_id,
        institute_id: payload.institute_id,
        batch_id: payload.batch_id ?? null,
        status: payload.status,
        notes: payload.notes ?? null,
        marked_by: payload.marked_by,
      },
      { onConflict: "session_id,student_id" },
    )
    .select()
    .single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return { data: data as AttendanceRecord, error: null, success: true };
}

export async function bulkMarkAttendance(
  sessionId: string,
  instituteId: string,
  markedBy: string,
  records: BulkAttendanceEntry[],
  batchId?: string | null,
): Promise<ApiResponse<{ count: number; records: AttendanceRecord[] }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const rows = records.map((r) => ({
    session_id: sessionId,
    student_id: r.student_id,
    institute_id: instituteId,
    batch_id: batchId ?? null,
    status: r.status,
    notes: r.notes ?? null,
    marked_by: markedBy,
  }));

  const { error, data } = await supabase
    .from("attendance_records")
    .upsert(rows, { onConflict: "session_id,student_id" })
    .select();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  return {
    data: {
      count: (data ?? []).length,
      records: (data ?? []) as AttendanceRecord[],
    },
    error: null,
    success: true,
  };
}

export async function updateAttendanceRecord(
  recordId: string,
  updates: { status: AttendanceStatus; notes?: string },
): Promise<ApiResponse<AttendanceRecord>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("attendance_records")
    .update({ status: updates.status, notes: updates.notes ?? null })
    .eq("id", recordId)
    .select()
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as AttendanceRecord, error: null, success: true };
}

export async function lockAttendanceSession(
  sessionId: string,
): Promise<ApiResponse<AttendanceSession>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("attendance_sessions")
    .update({ is_locked: true })
    .eq("id", sessionId)
    .select(SESSION_SELECT)
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as AttendanceSession, error: null, success: true };
}

// ── Reporting ─────────────────────────────────────────────────────────────────

export async function getAttendanceSummary(
  instituteId: string,
  batchId: string,
  dateFrom: string,
  dateTo: string,
): Promise<ApiResponse<AttendanceSummary[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data: sessions, error: sessionsError } = await supabase
    .from("attendance_sessions")
    .select("id")
    .eq("institute_id", instituteId)
    .eq("batch_id", batchId)
    .gte("session_date", dateFrom)
    .lte("session_date", dateTo);

  if (sessionsError) return { data: null, error: sessionsError.message, success: false };
  if (!sessions || sessions.length === 0) return { data: [], error: null, success: true };

  const sessionIds = sessions.map((s) => s.id);

  const { data: records, error: recordsError } = await supabase
    .from("attendance_records")
    .select("student_id, status, student:students(admission_no, user:users(name))")
    .in("session_id", sessionIds);

  if (recordsError) return { data: null, error: recordsError.message, success: false };

  type Acc = Omit<AttendanceSummary, "percentage">;
  const map = new Map<string, Acc>();

  for (const row of records ?? []) {
    type R = {
      student_id: string;
      status: string;
      student: { admission_no: string; user: { name: string } | null } | null;
    };
    const r = row as unknown as R;
    const name = r.student?.user?.name ?? "Unknown";
    const no = r.student?.admission_no ?? "";
    const acc = map.get(r.student_id);
    
    if (!acc) {
      map.set(r.student_id, {
        student_id: r.student_id,
        student_name: name,
        admission_no: no,
        total_sessions: 1,
        present: r.status === "present" ? 1 : 0,
        absent: r.status === "absent" ? 1 : 0,
        late: r.status === "late" ? 1 : 0,
        leave: r.status === "leave" ? 1 : 0,
      });
    } else {
      acc.total_sessions += 1;
      if (r.status === "present") acc.present += 1;
      else if (r.status === "absent") acc.absent += 1;
      else if (r.status === "late") acc.late += 1;
      else if (r.status === "leave") acc.leave += 1;
    }
  }

  // Pre-calculate to avoid redundant math in map
  const summaries: AttendanceSummary[] = Array.from(map.values()).map((s) => {
    const sessions = s.total_sessions || 1;
    return {
      ...s,
      percentage: Math.round(((s.present + s.late) / sessions) * 100),
    };
  });

  summaries.sort((a, b) => a.percentage - b.percentage);
  return { data: summaries, error: null, success: true };
}

export async function getStudentAttendance(
  studentId: string,
  filters?: { dateFrom?: string; dateTo?: string },
): Promise<ApiResponse<AttendanceRecord[]>> {
  const history = await getStudentAttendanceHistory(studentId, filters);
  if (!history.success) return history as ApiResponse<AttendanceRecord[]>;
  return { data: history.data as AttendanceRecord[], error: null, success: true };
}

function getAttendanceDateKey(record: StudentAttendanceRecord): string {
  return record.session?.session_date ?? record.marked_at.slice(0, 10);
}

function getTrendLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildMonthlyTrend(records: StudentAttendanceRecord[]): AttendanceTrendPoint[] {
  const buckets = new Map<string, AttendanceTrendPoint>();
  const now = new Date();

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, {
      label: date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      period: key,
      present: 0,
      absent: 0,
      late: 0,
      leave: 0,
      total: 0,
      percentage: 0,
    });
  }

  for (const record of records) {
    const dateKey = getAttendanceDateKey(record);
    const [year, month] = dateKey.split("-");
    const bucketKey = `${year}-${month}`;
    const bucket = buckets.get(bucketKey);
    if (!bucket) continue;
    bucket.total += 1;
    bucket[record.status] += 1;
  }

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    percentage:
      bucket.total > 0 ? Math.round(((bucket.present + bucket.late) / bucket.total) * 100) : 0,
  }));
}

function buildWeeklyTrend(records: StudentAttendanceRecord[]): AttendanceTrendPoint[] {
  const buckets = new Map<string, AttendanceTrendPoint>();
  const now = new Date();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, {
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
      period: key,
      present: 0,
      absent: 0,
      late: 0,
      leave: 0,
      total: 0,
      percentage: 0,
    });
  }

  for (const record of records) {
    const dateKey = getAttendanceDateKey(record);
    const bucket = buckets.get(dateKey);
    if (!bucket) continue;
    bucket.total += 1;
    bucket[record.status] += 1;
  }

  return Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    percentage:
      bucket.total > 0 ? Math.round(((bucket.present + bucket.late) / bucket.total) * 100) : 0,
  }));
}

export async function getStudentAttendanceHistory(
  studentId: string,
  filters?: { dateFrom?: string; dateTo?: string },
): Promise<ApiResponse<StudentAttendanceRecord[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const selectStr = "id, session_id, student_id, status, notes, marked_at, session:attendance_sessions(id, session_date, session_type, topic, batch:batches(id, name), conductor:users!conducted_by(id, name))";

  if (filters?.dateFrom || filters?.dateTo) {
    let sq = supabase.from("attendance_sessions").select("id");
    if (filters.dateFrom) sq = sq.gte("session_date", filters.dateFrom);
    if (filters.dateTo) sq = sq.lte("session_date", filters.dateTo);

    const { data: sessions, error: se } = await sq;
    if (se) return { data: null, error: se.message, success: false };
    if (!sessions || sessions.length === 0) return { data: [], error: null, success: true };

    const { data, error } = await supabase
      .from("attendance_records")
      .select(selectStr)
      .eq("student_id", studentId)
      .in(
        "session_id",
        sessions.map((s) => s.id),
      )
      .order("marked_at", { ascending: false });

    if (error) return { data: null, error: error.message, success: false };
    return { data: data as StudentAttendanceRecord[], error: null, success: true };
  }

  const { data, error } = await supabase
    .from("attendance_records")
    .select(selectStr)
    .eq("student_id", studentId)
    .order("marked_at", { ascending: false });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as StudentAttendanceRecord[], error: null, success: true };
}

export async function getStudentAttendanceStats(
  studentId: string,
  filters?: { dateFrom?: string; dateTo?: string },
): Promise<ApiResponse<StudentAttendanceStats>> {
  const historyResponse = await getStudentAttendanceHistory(studentId, filters);
  if (!historyResponse.success)
    return historyResponse as unknown as ApiResponse<StudentAttendanceStats>;

  const history = historyResponse.data ?? [];
  const totalSessions = history.length;
  const present = history.filter((record) => record.status === "present").length;
  const absent = history.filter((record) => record.status === "absent").length;
  const late = history.filter((record) => record.status === "late").length;
  const leave = history.filter((record) => record.status === "leave").length;
  const attended = present + late;

  const stats: StudentAttendanceStats = {
    student_id: studentId,
    total_sessions: totalSessions,
    present,
    absent,
    late,
    leave,
    percentage: totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : 0,
    present_percentage: totalSessions > 0 ? Math.round((present / totalSessions) * 100) : 0,
    absent_percentage: totalSessions > 0 ? Math.round((absent / totalSessions) * 100) : 0,
    late_percentage: totalSessions > 0 ? Math.round((late / totalSessions) * 100) : 0,
    leave_percentage: totalSessions > 0 ? Math.round((leave / totalSessions) * 100) : 0,
    monthly_trend: buildMonthlyTrend(history),
    weekly_trend: buildWeeklyTrend(history),
  };

  return { data: stats, error: null, success: true };
}
