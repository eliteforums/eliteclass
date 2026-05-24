-- ============================================================
-- EduOS Migration 030 — Batch-Specific Daily Study Logs
-- ============================================================

-- 1. Fix the uniqueness constraint
-- We need to drop the old unique constraint and add the new one.
-- Assuming the previous constraint was named daily_study_logs_student_id_log_date_key (default name)
ALTER TABLE public.daily_study_logs 
DROP CONSTRAINT IF EXISTS daily_study_logs_student_id_log_date_key;

-- Add the proper composite unique constraint: student + batch + date
-- This allows one log per batch per day for a student.
ALTER TABLE public.daily_study_logs
ADD CONSTRAINT daily_study_logs_student_batch_date_key UNIQUE (student_id, batch_id, log_date);

-- 2. Update the RPC for Staff Dashboard to be strictly batch-scoped
-- The existing RPC already takes p_batch_id, but let's ensure it's robust.
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
    -- Authorization check: Admin or Staff with batch access
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
                    'attachment_url', l.attachment_url,
                    'batch_id', l.batch_id
                )
            ) FILTER (WHERE l.id IS NOT NULL),
            '[]'::jsonb
        ) AS logs
    FROM public.students s
    JOIN public.users u ON u.id = s.user_id
    -- This join is CRITICAL: it only pulls logs FOR THIS SPECIFIC BATCH
    LEFT JOIN public.daily_study_logs l ON l.student_id = s.id 
        AND l.batch_id = p_batch_id
        AND l.log_date BETWEEN p_date_from AND p_date_to
    WHERE s.batch_id = p_batch_id -- In our current schema, students have a primary batch_id
      -- OR s.id IN (SELECT student_id FROM batch_students WHERE batch_id = p_batch_id) -- Use this if you have a many-to-many junction table
      AND s.status = 'active'
    GROUP BY s.id, u.name
    ORDER BY u.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. Policy update: Ensure student can only log for their assigned batches
-- We need to update the INSERT policy to check batch assignment.
DROP POLICY IF EXISTS "student_manage_own_study_logs" ON public.daily_study_logs;

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
        -- Ensure the student is actually in the batch they are logging for
        AND (
            (SELECT batch_id FROM public.students WHERE user_id = auth.uid()) = batch_id
            -- OR student_id IN (SELECT student_id FROM batch_students WHERE batch_id = batch_id) -- If many-to-many
        )
        AND NOT public.is_study_log_locked(log_date)
        AND log_date <= CURRENT_DATE
    );
