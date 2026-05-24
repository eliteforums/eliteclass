-- ============================================================
-- EduOS Migration 029 — Daily Study Logs System
-- ============================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.daily_study_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    attachment_url TEXT,
    log_date DATE NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'submitted', -- 'submitted'
    is_late BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE, -- Snapshot at last update, but RLS will use function
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(student_id, log_date)
);

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_study_logs_student_id ON public.daily_study_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_batch_id ON public.daily_study_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_institute_id ON public.daily_study_logs(institute_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_log_date ON public.daily_study_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_study_logs_composite_batch_date ON public.daily_study_logs(batch_id, log_date);
CREATE INDEX IF NOT EXISTS idx_study_logs_composite_student_date ON public.daily_study_logs(student_id, log_date);

-- 3. Helper Functions

-- Check if a log date is locked (past next day 11:59 PM)
CREATE OR REPLACE FUNCTION public.is_study_log_locked(p_log_date DATE)
RETURNS BOOLEAN AS $$
BEGIN
    -- Locked if current time is past the next day's 23:59:59
    RETURN NOW() > (p_log_date + INTERVAL '1 day' + INTERVAL '23 hours 59 minutes 59 seconds');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Trigger to handle late flag and locked snapshot
CREATE OR REPLACE FUNCTION public.trg_handle_study_log_metadata()
RETURNS TRIGGER AS $$
BEGIN
    -- Set is_late if submitted_at date is after log_date
    IF NEW.submitted_at::DATE > NEW.log_date THEN
        NEW.is_late := TRUE;
    ELSE
        NEW.is_late := FALSE;
    END IF;

    -- Update is_locked snapshot (useful for quick filtering, though RLS uses function)
    NEW.is_locked := public.is_study_log_locked(NEW.log_date);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_study_log_metadata
    BEFORE INSERT OR UPDATE ON public.daily_study_logs
    FOR EACH ROW EXECUTE FUNCTION public.trg_handle_study_log_metadata();

-- 4. RLS Policies

ALTER TABLE public.daily_study_logs ENABLE ROW LEVEL SECURITY;

-- Super Admin
CREATE POLICY "super_admin_all_study_logs"
    ON public.daily_study_logs FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Admin
CREATE POLICY "admin_institute_study_logs"
    ON public.daily_study_logs FOR ALL
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin')
    WITH CHECK (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

-- Staff (Read only for assigned batches)
CREATE POLICY "staff_read_assigned_study_logs"
    ON public.daily_study_logs FOR SELECT
    USING (
        institute_id = public.get_my_institute_id()
        AND public.get_my_role() = 'staff'
        AND public.staff_has_batch_access_v2(batch_id)
    );

-- Student (Read own)
CREATE POLICY "student_read_own_study_logs"
    ON public.daily_study_logs FOR SELECT
    USING (
        public.get_my_role() = 'student'
        AND student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    );

-- Student (Insert/Update own, only if not locked)
CREATE POLICY "student_manage_own_study_logs"
    ON public.daily_study_logs FOR ALL
    USING (
        public.get_my_role() = 'student'
        AND student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
        AND NOT public.is_study_log_locked(log_date)
    )
    WITH CHECK (
        public.get_my_role() = 'student'
        AND student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
        AND NOT public.is_study_log_locked(log_date)
        AND log_date <= CURRENT_DATE -- Cannot log for future
    );

-- 5. RPC for Staff Dashboard (Performance optimized)
-- Returns student info + their logs for a date range in a single call
CREATE OR REPLACE FUNCTION public.get_batch_study_logs_report(
    p_batch_id UUID,
    p_date_from DATE,
    p_date_to DATE
)
RETURNS TABLE (
    student_id UUID,
    student_name TEXT,
    logs JSONB
) AS $$
BEGIN
    -- Authorization check
    IF NOT (
        public.is_super_admin() OR 
        (public.get_my_role() = 'admin' AND (SELECT institute_id FROM public.batches WHERE id = p_batch_id) = public.get_my_institute_id()) OR
        (public.get_my_role() = 'staff' AND public.staff_has_batch_access_v2(p_batch_id))
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT 
        s.id AS student_id,
        u.name AS student_name,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', l.id,
                    'title', l.title,
                    'description', l.description,
                    'log_date', l.log_date,
                    'submitted_at', l.submitted_at,
                    'is_late', l.is_late,
                    'is_locked', l.is_locked,
                    'attachment_url', l.attachment_url
                )
            ) FILTER (WHERE l.id IS NOT NULL),
            '[]'::jsonb
        ) AS logs
    FROM public.students s
    JOIN public.users u ON u.id = s.user_id
    LEFT JOIN public.daily_study_logs l ON l.student_id = s.id 
        AND l.log_date BETWEEN p_date_from AND p_date_to
    WHERE s.batch_id = p_batch_id
      AND s.status = 'active'
    GROUP BY s.id, u.name
    ORDER BY u.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
