-- ============================================================
-- EduOS Migration 032 — Fix RLS for Study Logs and Assignments
-- ============================================================

-- 1. Fix Daily Study Logs RLS (Fully qualified to avoid ambiguity)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "student_manage_own_study_logs" ON public.daily_study_logs;

CREATE POLICY "student_manage_own_study_logs"
    ON public.daily_study_logs FOR ALL
    USING (
        public.get_my_role() = 'student'
        AND daily_study_logs.student_id IN (SELECT students.id FROM public.students WHERE students.user_id = auth.uid())
        AND NOT public.is_study_log_locked(daily_study_logs.log_date)
    )
    WITH CHECK (
        public.get_my_role() = 'student'
        AND daily_study_logs.student_id IN (SELECT students.id FROM public.students WHERE students.user_id = auth.uid())
        -- Ensure the student is assigned to this batch
        AND (
            (SELECT students.batch_id FROM public.students WHERE students.user_id = auth.uid()) = daily_study_logs.batch_id
            OR 
            EXISTS (
                SELECT 1 FROM public.student_batch_assignments sba
                JOIN public.students s ON s.id = sba.student_id
                WHERE s.user_id = auth.uid() 
                  AND sba.batch_id = daily_study_logs.batch_id
                  AND sba.is_active = TRUE
            )
        )
        AND NOT public.is_study_log_locked(daily_study_logs.log_date)
        AND daily_study_logs.log_date <= CURRENT_DATE
    );

DROP POLICY IF EXISTS "student_read_own_study_logs" ON public.daily_study_logs;

CREATE POLICY "student_read_own_study_logs"
    ON public.daily_study_logs FOR SELECT
    USING (
        public.get_my_role() = 'student'
        AND daily_study_logs.student_id IN (SELECT students.id FROM public.students WHERE students.user_id = auth.uid())
    );


-- 2. Fix Batches RLS
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "student_read_own_batch" ON public.batches;

CREATE POLICY "student_read_own_batch"
  ON public.batches FOR SELECT
  USING (
    public.get_my_role() = 'student'
    AND (
      batches.id IN (
        SELECT students.batch_id
        FROM public.students
        WHERE students.user_id = auth.uid()
          AND students.batch_id IS NOT NULL
      )
      OR
      batches.id IN (
        SELECT sba.batch_id
        FROM public.student_batch_assignments sba
        JOIN public.students s ON s.id = sba.student_id
        WHERE s.user_id = auth.uid()
          AND sba.is_active = TRUE
      )
    )
  );


-- 3. Fix Courses RLS
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "student_read_courses" ON public.courses;

CREATE POLICY "student_read_courses"
  ON public.courses FOR SELECT
  USING (
    public.get_my_role() = 'student'
    AND (
      courses.id IN (
        SELECT sc.course_id
        FROM public.student_courses sc
        JOIN public.students s ON s.id = sc.student_id
        WHERE s.user_id = auth.uid()
      )
      OR
      courses.id IN (
        SELECT sba.course_id
        FROM public.student_batch_assignments sba
        JOIN public.students s ON s.id = sba.student_id
        WHERE s.user_id = auth.uid()
          AND sba.is_active = TRUE
      )
    )
  );


-- 4. Update RPC for Staff Dashboard (Explicit column qualification to fix ambiguity)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_batch_study_logs_report(UUID, DATE, DATE);

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
        (public.get_my_role() = 'admin' AND (SELECT batches.institute_id FROM public.batches WHERE batches.id = p_batch_id) = public.get_my_institute_id()) OR
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
    -- Pull logs FOR THIS SPECIFIC BATCH
    LEFT JOIN public.daily_study_logs l ON l.student_id = s.id 
        AND l.batch_id = p_batch_id
        AND l.log_date BETWEEN p_date_from AND p_date_to
    WHERE (
        s.batch_id = p_batch_id 
        OR EXISTS (
            SELECT 1 FROM public.student_batch_assignments sba 
            WHERE sba.student_id = s.id 
              AND sba.batch_id = p_batch_id 
              AND sba.is_active = TRUE
        )
    )
      AND s.status = 'active'
    GROUP BY s.id, u.name
    ORDER BY u.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
