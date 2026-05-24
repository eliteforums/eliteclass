-- ============================================================
-- EduOS Migration 018 — Schedule / Timetable Management System
-- ============================================================
-- Tables: subjects, sections, rooms, schedules, schedule_exceptions
-- RPCs: check_schedule_conflicts, duplicate_week_schedules
-- RLS: admin write, staff/student/parent scoped read
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE schedule_type AS ENUM ('regular', 'exam', 'break', 'lunch', 'event');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE schedule_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE schedule_exception_type AS ENUM ('holiday', 'cancelled', 'rescheduled', 'event');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Subjects catalog ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subjects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  code         TEXT,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institute_id, name)
);

-- ── Sections (divisions within a batch) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  batch_id     UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, name)
);

-- ── Rooms ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  room_name    TEXT NOT NULL,
  capacity     INTEGER,
  building     TEXT,
  floor        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institute_id, room_name)
);

-- ── Schedules (timetable slots) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  batch_id     UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  section_id   UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  subject_id   UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id   UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  room_id      UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  type         schedule_type NOT NULL DEFAULT 'regular',
  status       schedule_status NOT NULL DEFAULT 'draft',
  title        TEXT,
  notes        TEXT,
  week_label   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schedules_valid_time CHECK (end_time > start_time)
);

-- ── Schedule exceptions (holidays, cancellations, events) ─────────────────────
CREATE TABLE IF NOT EXISTS public.schedule_exceptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  batch_id     UUID REFERENCES public.batches(id) ON DELETE CASCADE,
  schedule_id  UUID REFERENCES public.schedules(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  type         schedule_exception_type NOT NULL DEFAULT 'holiday',
  title        TEXT NOT NULL,
  description  TEXT,
  replacement_start TIME,
  replacement_end   TIME,
  is_all_day   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_subjects_institute ON public.subjects (institute_id);
CREATE INDEX IF NOT EXISTS idx_sections_batch ON public.sections (batch_id);
CREATE INDEX IF NOT EXISTS idx_rooms_institute ON public.rooms (institute_id);
CREATE INDEX IF NOT EXISTS idx_schedules_institute_batch ON public.schedules (institute_id, batch_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_schedules_teacher_day ON public.schedules (teacher_id, day_of_week) WHERE teacher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedules_room_day ON public.schedules (room_id, day_of_week) WHERE room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedules_status ON public.schedules (institute_id, status);
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_date ON public.schedule_exceptions (institute_id, exception_date);

-- ── updated_at triggers ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS subjects_set_updated_at ON public.subjects;
CREATE TRIGGER subjects_set_updated_at
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS sections_set_updated_at ON public.sections;
CREATE TRIGGER sections_set_updated_at
  BEFORE UPDATE ON public.sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS rooms_set_updated_at ON public.rooms;
CREATE TRIGGER rooms_set_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS schedules_set_updated_at ON public.schedules;
CREATE TRIGGER schedules_set_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS schedule_exceptions_set_updated_at ON public.schedule_exceptions;
CREATE TRIGGER schedule_exceptions_set_updated_at
  BEFORE UPDATE ON public.schedule_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Conflict detection helper ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.times_overlap(
  a_start TIME, a_end TIME,
  b_start TIME, b_end TIME
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT a_start < b_end AND b_start < a_end;
$$;

CREATE OR REPLACE FUNCTION public.check_schedule_conflicts(
  p_institute_id UUID,
  p_batch_id UUID,
  p_section_id UUID,
  p_teacher_id UUID,
  p_room_id UUID,
  p_day_of_week SMALLINT,
  p_start_time TIME,
  p_end_time TIME,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflicts JSONB := '[]'::JSONB;
  v_row RECORD;
BEGIN
  IF p_end_time <= p_start_time THEN
    RETURN jsonb_build_array(jsonb_build_object(
      'type', 'invalid_time',
      'message', 'End time must be after start time.'
    ));
  END IF;

  -- Teacher double-booking
  IF p_teacher_id IS NOT NULL THEN
    FOR v_row IN
      SELECT s.id, s.start_time, s.end_time, b.name AS batch_name
      FROM public.schedules s
      JOIN public.batches b ON b.id = s.batch_id
      WHERE s.institute_id = p_institute_id
        AND s.teacher_id = p_teacher_id
        AND s.day_of_week = p_day_of_week
        AND s.status <> 'archived'
        AND (p_exclude_id IS NULL OR s.id <> p_exclude_id)
        AND public.times_overlap(s.start_time, s.end_time, p_start_time, p_end_time)
    LOOP
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'type', 'teacher',
        'schedule_id', v_row.id,
        'message', format('Teacher already assigned %s–%s (%s).', v_row.start_time, v_row.end_time, v_row.batch_name)
      ));
    END LOOP;
  END IF;

  -- Room conflict
  IF p_room_id IS NOT NULL THEN
    FOR v_row IN
      SELECT s.id, s.start_time, s.end_time, b.name AS batch_name
      FROM public.schedules s
      JOIN public.batches b ON b.id = s.batch_id
      WHERE s.institute_id = p_institute_id
        AND s.room_id = p_room_id
        AND s.day_of_week = p_day_of_week
        AND s.status <> 'archived'
        AND (p_exclude_id IS NULL OR s.id <> p_exclude_id)
        AND public.times_overlap(s.start_time, s.end_time, p_start_time, p_end_time)
    LOOP
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'type', 'room',
        'schedule_id', v_row.id,
        'message', format('Room booked %s–%s (%s).', v_row.start_time, v_row.end_time, v_row.batch_name)
      ));
    END LOOP;
  END IF;

  -- Batch / section overlap
  FOR v_row IN
    SELECT s.id, s.start_time, s.end_time, sec.name AS section_name
    FROM public.schedules s
    LEFT JOIN public.sections sec ON sec.id = s.section_id
    WHERE s.institute_id = p_institute_id
      AND s.batch_id = p_batch_id
      AND s.day_of_week = p_day_of_week
      AND s.status <> 'archived'
      AND (p_exclude_id IS NULL OR s.id <> p_exclude_id)
      AND public.times_overlap(s.start_time, s.end_time, p_start_time, p_end_time)
      AND (
        p_section_id IS NULL
        OR s.section_id IS NULL
        OR s.section_id = p_section_id
      )
  LOOP
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'type', 'batch',
      'schedule_id', v_row.id,
      'message', format('Class overlap %s–%s%s.', v_row.start_time, v_row.end_time,
        CASE WHEN v_row.section_name IS NOT NULL THEN ' (section ' || v_row.section_name || ')' ELSE '' END)
    ));
  END LOOP;

  RETURN v_conflicts;
END;
$$;

-- Duplicate previous week schedules for a batch
CREATE OR REPLACE FUNCTION public.duplicate_week_schedules(
  p_institute_id UUID,
  p_source_batch_id UUID,
  p_target_batch_id UUID DEFAULT NULL,
  p_week_label TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_batch UUID := COALESCE(p_target_batch_id, p_source_batch_id);
  v_count INTEGER := 0;
BEGIN
  IF get_my_role() NOT IN ('admin', 'super_admin') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.schedules (
    institute_id, batch_id, section_id, subject_id, teacher_id, room_id,
    day_of_week, start_time, end_time, type, status, title, notes, week_label
  )
  SELECT
    institute_id, v_target_batch, section_id, subject_id, teacher_id, room_id,
    day_of_week, start_time, end_time, type, 'draft', title, notes, p_week_label
  FROM public.schedules
  WHERE institute_id = p_institute_id
    AND batch_id = p_source_batch_id
    AND status <> 'archived';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN json_build_object('duplicated', v_count, 'target_batch_id', v_target_batch);
END;
$$;

-- Publish all draft schedules for a batch
CREATE OR REPLACE FUNCTION public.publish_batch_schedule(
  p_institute_id UUID,
  p_batch_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF get_my_role() NOT IN ('admin', 'super_admin') AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.schedules
  SET status = 'published'
  WHERE institute_id = p_institute_id
    AND batch_id = p_batch_id
    AND status = 'draft';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN json_build_object('published', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_schedule_conflicts TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_week_schedules TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_batch_schedule TO authenticated;

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;

-- subjects
DROP POLICY IF EXISTS "super_admin_all_subjects" ON public.subjects;
CREATE POLICY "super_admin_all_subjects" ON public.subjects FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "admin_manage_subjects" ON public.subjects;
CREATE POLICY "admin_manage_subjects" ON public.subjects FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

DROP POLICY IF EXISTS "institute_read_subjects" ON public.subjects;
CREATE POLICY "institute_read_subjects" ON public.subjects FOR SELECT
  USING (institute_id = get_my_institute_id());

-- sections
DROP POLICY IF EXISTS "super_admin_all_sections" ON public.sections;
CREATE POLICY "super_admin_all_sections" ON public.sections FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "admin_manage_sections" ON public.sections;
CREATE POLICY "admin_manage_sections" ON public.sections FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

DROP POLICY IF EXISTS "institute_read_sections" ON public.sections;
CREATE POLICY "institute_read_sections" ON public.sections FOR SELECT
  USING (institute_id = get_my_institute_id());

-- rooms
DROP POLICY IF EXISTS "super_admin_all_rooms" ON public.rooms;
CREATE POLICY "super_admin_all_rooms" ON public.rooms FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "admin_manage_rooms" ON public.rooms;
CREATE POLICY "admin_manage_rooms" ON public.rooms FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

DROP POLICY IF EXISTS "institute_read_rooms" ON public.rooms;
CREATE POLICY "institute_read_rooms" ON public.rooms FOR SELECT
  USING (institute_id = get_my_institute_id());

-- schedules
DROP POLICY IF EXISTS "super_admin_all_schedules" ON public.schedules;
CREATE POLICY "super_admin_all_schedules" ON public.schedules FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "admin_manage_schedules" ON public.schedules;
CREATE POLICY "admin_manage_schedules" ON public.schedules FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

DROP POLICY IF EXISTS "staff_read_own_schedules" ON public.schedules;
CREATE POLICY "staff_read_own_schedules" ON public.schedules FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND status = 'published'
    AND teacher_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "staff_read_institute_schedules" ON public.schedules;
CREATE POLICY "staff_read_institute_schedules" ON public.schedules FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff' AND status = 'published');

DROP POLICY IF EXISTS "student_read_batch_schedules" ON public.schedules;
CREATE POLICY "student_read_batch_schedules" ON public.schedules FOR SELECT
  USING (
    status = 'published'
    AND batch_id IN (
      SELECT batch_id FROM public.students
      WHERE user_id = auth.uid() AND batch_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "parent_read_child_schedules" ON public.schedules;
CREATE POLICY "parent_read_child_schedules" ON public.schedules FOR SELECT
  USING (
    status = 'published'
    AND batch_id IN (
      SELECT DISTINCT s.batch_id
      FROM public.students s
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid() AND s.batch_id IS NOT NULL
    )
  );

-- schedule_exceptions
DROP POLICY IF EXISTS "super_admin_all_schedule_exceptions" ON public.schedule_exceptions;
CREATE POLICY "super_admin_all_schedule_exceptions" ON public.schedule_exceptions FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS "admin_manage_schedule_exceptions" ON public.schedule_exceptions;
CREATE POLICY "admin_manage_schedule_exceptions" ON public.schedule_exceptions FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

DROP POLICY IF EXISTS "institute_read_schedule_exceptions" ON public.schedule_exceptions;
CREATE POLICY "institute_read_schedule_exceptions" ON public.schedule_exceptions FOR SELECT
  USING (institute_id = get_my_institute_id());

DROP POLICY IF EXISTS "parent_read_schedule_exceptions" ON public.schedule_exceptions;
CREATE POLICY "parent_read_schedule_exceptions" ON public.schedule_exceptions FOR SELECT
  USING (
    institute_id IN (
      SELECT institute_id FROM public.parents WHERE user_id = auth.uid()
    )
    AND (
      batch_id IS NULL
      OR batch_id IN (
        SELECT DISTINCT s.batch_id
        FROM public.students s
        JOIN public.student_parents sp ON sp.student_id = s.id
        JOIN public.parents p ON p.id = sp.parent_id
        WHERE p.user_id = auth.uid() AND s.batch_id IS NOT NULL
      )
    )
  );
