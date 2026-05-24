-- ============================================================
-- EduOS Migration 031 — Data Integrity: One Active Batch Per Course
-- ============================================================

-- ── 1. Create student_batch_assignments junction ───────────────────────────
-- This replaces the single students.batch_id column and allows
-- many-to-many Student <-> Batch relationships properly.
-- Each assignment is linked to a course to enforce the business rule.

CREATE TABLE IF NOT EXISTS public.student_batch_assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id    UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    batch_id      UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
    course_id     UUID REFERENCES public.courses(id) ON DELETE CASCADE, -- Made nullable to allow migration
    institute_id  UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by   UUID REFERENCES public.users(id),
    
    -- BUSINESS RULE: ONE ACTIVE BATCH PER COURSE PER STUDENT
    -- (PostgreSQL allows multiple NULLs in UNIQUE constraints)
    UNIQUE (student_id, course_id)
);

-- Add course_id to batches if not exists
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sba_student_id ON public.student_batch_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_sba_batch_id   ON public.student_batch_assignments(batch_id);
CREATE INDEX IF NOT EXISTS idx_sba_course_id  ON public.student_batch_assignments(course_id);

-- ── 2. Migrate existing data ────────────────────────────────────────────────
-- Move current students.batch_id into the junction table.
-- We need to find the course_id for each batch.

DO $$
BEGIN
    -- Only migrate if student_batch_assignments is empty
    IF NOT EXISTS (SELECT 1 FROM public.student_batch_assignments) THEN
        INSERT INTO public.student_batch_assignments (student_id, batch_id, course_id, institute_id)
        SELECT 
            s.id as student_id,
            s.batch_id,
            b.course_id, -- Assuming batch has course_id from previous context/assumptions
            s.institute_id
        FROM public.students s
        JOIN public.batches b ON b.id = s.batch_id
        WHERE s.batch_id IS NOT NULL;
    END IF;
END $$;

-- ── 3. Helper for safe student transfer ─────────────────────────────────────
-- Moves a student from one batch to another within the SAME course.
-- Preserves history by updating the junction table instead of deleting.

CREATE OR REPLACE FUNCTION public.transfer_student_batch(
    p_student_id UUID,
    p_new_batch_id UUID,
    p_assigned_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_course_id UUID;
    v_institute_id UUID;
    v_old_batch_id UUID;
BEGIN
    -- 1. Get metadata for new batch
    SELECT course_id, institute_id INTO v_new_course_id, v_institute_id
    FROM public.batches WHERE id = p_new_batch_id;

    IF v_new_course_id IS NULL THEN
        RAISE EXCEPTION 'Invalid target batch';
    END IF;

    -- 2. Authorization check (Admin/Staff with batch access)
    IF NOT (
        public.is_super_admin() OR 
        (public.get_my_role() = 'admin' AND v_institute_id = public.get_my_institute_id()) OR
        (public.get_my_role() = 'staff' AND public.staff_has_batch_access_v2(p_new_batch_id))
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- 3. Perform the shift (atomic)
    -- This handles the UNIQUE(student_id, course_id) constraint automatically
    INSERT INTO public.student_batch_assignments (
        student_id, batch_id, course_id, institute_id, assigned_by
    )
    VALUES (
        p_student_id, p_new_batch_id, v_new_course_id, v_institute_id, p_assigned_by
    )
    ON CONFLICT (student_id, course_id) 
    DO UPDATE SET 
        batch_id = EXCLUDED.batch_id,
        assigned_at = NOW(),
        assigned_by = EXCLUDED.assigned_by
    RETURNING (SELECT batch_id FROM public.student_batch_assignments WHERE student_id = p_student_id AND course_id = v_new_course_id) INTO v_old_batch_id;

    -- 4. Log the action
    INSERT INTO public.student_history (
        student_id, institute_id, changed_by, action, old_value, new_value, remark
    )
    VALUES (
        p_student_id, v_institute_id, p_assigned_by, 'batch_transfer',
        jsonb_build_object('batch_id', v_old_batch_id),
        jsonb_build_object('batch_id', p_new_batch_id),
        'Student transferred to new batch for course.'
    );

    RETURN jsonb_build_object('success', true, 'new_batch_id', p_new_batch_id);
END;
$$;

-- ── 4. Fix RLS for the new junction table ───────────────────────────────────
ALTER TABLE public.student_batch_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_sba" ON public.student_batch_assignments FOR ALL
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "staff_read_assigned_sba" ON public.student_batch_assignments FOR SELECT
    USING (public.get_my_role() = 'staff' AND public.staff_has_batch_access_v2(batch_id));

CREATE POLICY "student_read_own_sba" ON public.student_batch_assignments FOR SELECT
    USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

-- ── 5. Update attendance_sessions query helper ──────────────────────────────
-- Ensure it looks at current assignments for the active list,
-- but old records remain valid.

CREATE OR REPLACE FUNCTION public.get_active_batch_students(p_batch_id UUID)
RETURNS SETOF public.students
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT s.*
    FROM public.students s
    JOIN public.student_batch_assignments sba ON sba.student_id = s.id
    WHERE sba.batch_id = p_batch_id AND sba.is_active = TRUE;
$$;
