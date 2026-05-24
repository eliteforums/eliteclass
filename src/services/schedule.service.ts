// ---------------------------------------------------------------------------
// EduOS — Schedule / Timetable Service
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { cachedQuery, invalidateQueryCache } from "@/lib/query-cache";
import { runService } from "@/lib/service-runner";
import { getErrorMessage } from "@/utils/helpers";
import type {
  ApiResponse,
  CreateRoomPayload,
  CreateScheduleExceptionPayload,
  CreateSchedulePayload,
  CreateSectionPayload,
  CreateSubjectPayload,
  Room,
  Schedule,
  ScheduleConflict,
  ScheduleException,
  ScheduleFilters,
  Section,
  Subject,
  UpdateSchedulePayload,
} from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

const SCHEDULE_SELECT = `
  *,
  batch:batches(id, name, batch_code, course_name),
  section:sections(id, name),
  subject:subjects(id, name, code),
  teacher:staff(id, designation, user:users(id, name, email)),
  room:rooms(id, room_name, building)
`;

// ── Conflict detection ────────────────────────────────────────────────────────

export async function checkScheduleConflicts(
  payload: CreateSchedulePayload & { exclude_id?: string },
): Promise<ApiResponse<ScheduleConflict[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.rpc("check_schedule_conflicts", {
    p_institute_id: payload.institute_id,
    p_batch_id: payload.batch_id,
    p_section_id: payload.section_id ?? null,
    p_teacher_id: payload.teacher_id ?? null,
    p_room_id: payload.room_id ?? null,
    p_day_of_week: payload.day_of_week,
    p_start_time: payload.start_time,
    p_end_time: payload.end_time,
    p_exclude_id: payload.exclude_id ?? null,
  });

  if (error) return { data: null, error: error.message, success: false };
  return { data: (data ?? []) as ScheduleConflict[], error: null, success: true };
}

// ── Schedules CRUD ─────────────────────────────────────────────────────────────

export async function getSchedules(
  instituteId: string,
  filters: ScheduleFilters = {},
): Promise<ApiResponse<Schedule[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const cacheKey = `schedules:${instituteId}:${JSON.stringify(filters)}`;

  return runService("getSchedules", async () => {
    const items = await cachedQuery(cacheKey, 20_000, async () => {
      let query = supabase
        .from("schedules")
        .select(SCHEDULE_SELECT)
        .eq("institute_id", instituteId)
        .order("day_of_week")
        .order("start_time");

      if (filters.batchId) query = query.eq("batch_id", filters.batchId);
      if (filters.sectionId) query = query.eq("section_id", filters.sectionId);
      if (filters.teacherId) query = query.eq("teacher_id", filters.teacherId);
      if (filters.subjectId) query = query.eq("subject_id", filters.subjectId);
      if (filters.roomId) query = query.eq("room_id", filters.roomId);
      if (filters.dayOfWeek !== undefined) query = query.eq("day_of_week", filters.dayOfWeek);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.type) query = query.eq("type", filters.type);

      const { data, error } = await query;
      if (error) throw new Error(getErrorMessage(error));
      return (data ?? []) as Schedule[];
    });

    let filtered = items;
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      filtered = items.filter((s) => {
        const haystack = [
          s.title,
          s.subject?.name,
          s.teacher?.user?.name,
          s.room?.room_name,
          s.batch?.name,
          s.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    return { data: filtered, error: null, success: true };
  });
}

export async function getSchedulesByBatch(
  batchId: string,
  publishedOnly = false,
): Promise<ApiResponse<Schedule[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const cacheKey = `schedules:batch:${batchId}:${publishedOnly ? "pub" : "all"}`;

  return runService("getSchedulesByBatch", async () => {
    const data = await cachedQuery(cacheKey, 45_000, async () => {
      let query = supabase
        .from("schedules")
        .select(SCHEDULE_SELECT)
        .eq("batch_id", batchId)
        .order("day_of_week")
        .order("start_time");

      if (publishedOnly) query = query.eq("status", "published");

      const { data: rows, error } = await query;
      if (error) throw new Error(getErrorMessage(error));
      return rows as Schedule[];
    });
    return { data, error: null, success: true };
  });
}

export async function getSchedulesByTeacher(
  teacherId: string,
  publishedOnly = true,
): Promise<ApiResponse<Schedule[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  let query = supabase
    .from("schedules")
    .select(SCHEDULE_SELECT)
    .eq("teacher_id", teacherId)
    .order("day_of_week")
    .order("start_time");

  if (publishedOnly) query = query.eq("status", "published");

  const { data, error } = await query;
  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Schedule[], error: null, success: true };
}

export async function createSchedule(
  payload: CreateSchedulePayload,
): Promise<ApiResponse<Schedule>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const conflictResult = await checkScheduleConflicts(payload);
  if (!conflictResult.success) return { data: null, error: conflictResult.error, success: false };
  if (conflictResult.data && conflictResult.data.length > 0) {
    return {
      data: null,
      error: conflictResult.data.map((c) => c.message).join(" "),
      success: false,
    };
  }

  const { data, error } = await supabase
    .from("schedules")
    .insert({
      institute_id: payload.institute_id,
      batch_id: payload.batch_id,
      section_id: payload.section_id ?? null,
      subject_id: payload.subject_id ?? null,
      teacher_id: payload.teacher_id ?? null,
      room_id: payload.room_id ?? null,
      day_of_week: payload.day_of_week,
      start_time: payload.start_time,
      end_time: payload.end_time,
      type: payload.type ?? "regular",
      status: payload.status ?? "draft",
      title: payload.title ?? null,
      notes: payload.notes ?? null,
      week_label: payload.week_label ?? null,
    })
    .select(SCHEDULE_SELECT)
    .single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  invalidateQueryCache("schedules:");
  return { data: data as Schedule, error: null, success: true };
}

export async function updateSchedule(
  id: string,
  instituteId: string,
  payload: UpdateSchedulePayload,
): Promise<ApiResponse<Schedule>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data: existing, error: fetchError } = await supabase
    .from("schedules")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return { data: null, error: fetchError?.message ?? "Schedule not found.", success: false };
  }

  const merged = { ...existing, ...payload };
  const conflictResult = await checkScheduleConflicts({
    institute_id: instituteId,
    batch_id: merged.batch_id,
    section_id: merged.section_id,
    subject_id: merged.subject_id,
    teacher_id: merged.teacher_id,
    room_id: merged.room_id,
    day_of_week: merged.day_of_week,
    start_time: merged.start_time,
    end_time: merged.end_time,
    exclude_id: id,
  });

  if (!conflictResult.success) return { data: null, error: conflictResult.error, success: false };
  if (conflictResult.data && conflictResult.data.length > 0) {
    return {
      data: null,
      error: conflictResult.data.map((c) => c.message).join(" "),
      success: false,
    };
  }

  const { data, error } = await supabase
    .from("schedules")
    .update(payload)
    .eq("id", id)
    .select(SCHEDULE_SELECT)
    .single();

  if (error) return { data: null, error: getErrorMessage(error), success: false };
  invalidateQueryCache("schedules:");
  return { data: data as Schedule, error: null, success: true };
}

export async function deleteSchedule(id: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.from("schedules").delete().eq("id", id);
  if (error) return { data: null, error: getErrorMessage(error), success: false };
  invalidateQueryCache("schedules:");
  return { data: null, error: null, success: true };
}

export async function publishBatchSchedule(
  instituteId: string,
  batchId: string,
): Promise<ApiResponse<{ published: number }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.rpc("publish_batch_schedule", {
    p_institute_id: instituteId,
    p_batch_id: batchId,
  });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as { published: number }, error: null, success: true };
}

export async function duplicateWeekSchedules(
  instituteId: string,
  sourceBatchId: string,
  targetBatchId?: string,
  weekLabel?: string,
): Promise<ApiResponse<{ duplicated: number }>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.rpc("duplicate_week_schedules", {
    p_institute_id: instituteId,
    p_source_batch_id: sourceBatchId,
    p_target_batch_id: targetBatchId ?? null,
    p_week_label: weekLabel ?? null,
  });

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as { duplicated: number }, error: null, success: true };
}

// ── Subjects ───────────────────────────────────────────────────────────────────

export async function getSubjects(instituteId: string): Promise<ApiResponse<Subject[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  return runService("getSubjects", async () => {
    const data = await cachedQuery(`subjects:${instituteId}`, 120_000, async () => {
      const { data: rows, error } = await supabase
        .from("subjects")
        .select("id, institute_id, name, code, is_active")
        .eq("institute_id", instituteId)
        .eq("is_active", true)
        .order("name");
      if (error) throw new Error(getErrorMessage(error));
      return rows as Subject[];
    });
    return { data, error: null, success: true };
  });
}

export async function createSubject(payload: CreateSubjectPayload): Promise<ApiResponse<Subject>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.from("subjects").insert(payload).select().single();
  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Subject, error: null, success: true };
}

// ── Rooms ──────────────────────────────────────────────────────────────────────

export async function getRooms(instituteId: string): Promise<ApiResponse<Room[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  return runService("getRooms", async () => {
    const data = await cachedQuery(`rooms:${instituteId}`, 120_000, async () => {
      const { data: rows, error } = await supabase
        .from("rooms")
        .select("id, institute_id, room_name, capacity, building, floor, is_active")
        .eq("institute_id", instituteId)
        .eq("is_active", true)
        .order("room_name");
      if (error) throw new Error(getErrorMessage(error));
      return rows as Room[];
    });
    return { data, error: null, success: true };
  });
}

export async function createRoom(payload: CreateRoomPayload): Promise<ApiResponse<Room>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.from("rooms").insert(payload).select().single();
  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Room, error: null, success: true };
}

// ── Sections ─────────────────────────────────────────────────────────────────

export async function getSectionsByBatch(batchId: string): Promise<ApiResponse<Section[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("sections")
    .select("*")
    .eq("batch_id", batchId)
    .eq("is_active", true)
    .order("name");

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Section[], error: null, success: true };
}

export async function createSection(payload: CreateSectionPayload): Promise<ApiResponse<Section>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase.from("sections").insert(payload).select().single();
  if (error) return { data: null, error: error.message, success: false };
  return { data: data as Section, error: null, success: true };
}

// ── Exceptions ─────────────────────────────────────────────────────────────────

export async function getScheduleExceptions(
  instituteId: string,
  batchId?: string,
): Promise<ApiResponse<ScheduleException[]>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  let query = supabase
    .from("schedule_exceptions")
    .select("*")
    .eq("institute_id", instituteId)
    .order("exception_date", { ascending: false });

  if (batchId) query = query.or(`batch_id.eq.${batchId},batch_id.is.null`);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message, success: false };
  return { data: data as ScheduleException[], error: null, success: true };
}

export async function createScheduleException(
  payload: CreateScheduleExceptionPayload,
): Promise<ApiResponse<ScheduleException>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { data, error } = await supabase
    .from("schedule_exceptions")
    .insert({
      institute_id: payload.institute_id,
      batch_id: payload.batch_id ?? null,
      schedule_id: payload.schedule_id ?? null,
      exception_date: payload.exception_date,
      type: payload.type,
      title: payload.title,
      description: payload.description ?? null,
      replacement_start: payload.replacement_start ?? null,
      replacement_end: payload.replacement_end ?? null,
      is_all_day: payload.is_all_day ?? true,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message, success: false };
  return { data: data as ScheduleException, error: null, success: true };
}

export async function deleteScheduleException(id: string): Promise<ApiResponse<null>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  const { error } = await supabase.from("schedule_exceptions").delete().eq("id", id);
  if (error) return { data: null, error: error.message, success: false };
  return { data: null, error: null, success: true };
}
