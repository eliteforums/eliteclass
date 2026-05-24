-- ============================================================
-- EduOS Migration 021 — Teacher Students (scoped access + RPCs)
-- ============================================================

-- ── Helpers ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_staff_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.staff s
  WHERE s.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.teacher_assigned_batch_ids(p_staff_id UUID DEFAULT NULL)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT batch_id
  FROM (
    SELECT sa.batch_id
    FROM public.staff_assignments sa
    WHERE sa.staff_id = COALESCE(p_staff_id, public.get_my_staff_id())
      AND sa.batch_id IS NOT NULL
    UNION
    SELECT sch.batch_id
    FROM public.schedules sch
    WHERE sch.teacher_id = COALESCE(p_staff_id, public.get_my_staff_id())
      AND sch.status = 'published'
  ) batches
  WHERE batch_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_access_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR (
      public.get_my_role() = 'admin'
      AND EXISTS (
        SELECT 1
        FROM public.students st
        WHERE st.id = p_student_id
          AND st.institute_id = public.get_my_institute_id()
      )
    )
    OR (
      public.get_my_role() = 'staff'
      AND EXISTS (
        SELECT 1
        FROM public.students st
        WHERE st.id = p_student_id
          AND st.institute_id = public.get_my_institute_id()
          AND st.batch_id IN (SELECT public.teacher_assigned_batch_ids(public.get_my_staff_id()))
      )
    )
    OR (
      public.get_my_role() = 'student'
      AND EXISTS (
        SELECT 1 FROM public.students st
        WHERE st.id = p_student_id AND st.user_id = auth.uid()
      )
    )
    OR (
      public.get_my_role() = 'parent'
      AND EXISTS (
        SELECT 1
        FROM public.student_parents sp
        JOIN public.parents p ON p.id = sp.parent_id
        WHERE sp.student_id = p_student_id
          AND p.user_id = auth.uid()
      )
    );
$$;

-- Tighten student read access for staff (assigned batches only)
DROP POLICY IF EXISTS "staff_read_institute_students" ON public.students;

CREATE POLICY "staff_read_assigned_students"
  ON public.students FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() = 'staff'
    AND batch_id IN (SELECT public.teacher_assigned_batch_ids(public.get_my_staff_id()))
  );

-- Scoped analytics for teachers
CREATE OR REPLACE FUNCTION public.analytics_can_access_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.teacher_can_access_student(p_student_id);
$$;

-- ── Teacher student list (paginated, filterable) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_teacher_students(
  p_staff_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_batch_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_attendance_min NUMERIC DEFAULT NULL,
  p_attendance_max NUMERIC DEFAULT NULL,
  p_performance TEXT DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_institute_id UUID;
  v_result JSONB;
BEGIN
  v_staff_id := COALESCE(p_staff_id, public.get_my_staff_id());

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff profile not found';
  END IF;

  IF public.get_my_role() = 'staff' AND v_staff_id <> public.get_my_staff_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.get_my_role() NOT IN ('staff', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT institute_id INTO v_institute_id
  FROM public.staff
  WHERE id = v_staff_id;

  IF v_institute_id IS NULL OR (
    public.get_my_role() = 'admin'
    AND v_institute_id <> public.get_my_institute_id()
    AND NOT public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  WITH base AS (
    SELECT
      st.id,
      st.admission_no,
      st.status,
      st.batch_id,
      st.emergency_contact,
      st.created_at,
      u.name,
      u.email,
      u.phone,
      u.avatar_url,
      b.name AS batch_name,
      COALESCE(att.rate, 0) AS attendance_rate,
      CASE
        WHEN COALESCE(att.rate, 0) >= 85 THEN 'excellent'
        WHEN COALESCE(att.rate, 0) >= 70 THEN 'good'
        WHEN att.total > 0 THEN 'needs_attention'
        ELSE 'unknown'
      END AS performance_status
    FROM public.students st
    JOIN public.users u ON u.id = st.user_id
    LEFT JOIN public.batches b ON b.id = st.batch_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::INTEGER AS total,
        CASE
          WHEN COUNT(*) > 0 THEN ROUND(
            (COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))::NUMERIC / COUNT(*)) * 100
          )
          ELSE 0
        END AS rate
      FROM public.attendance_records ar
      JOIN public.attendance_sessions s ON s.id = ar.session_id
      WHERE ar.student_id = st.id
        AND s.session_date >= (CURRENT_DATE - INTERVAL '90 days')::DATE
    ) att ON TRUE
    WHERE st.institute_id = v_institute_id
      AND st.batch_id IN (SELECT public.teacher_assigned_batch_ids(v_staff_id))
      AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
      AND (p_status IS NULL OR st.status::TEXT = p_status)
      AND (
        p_search IS NULL
        OR p_search = ''
        OR st.admission_no ILIKE '%' || p_search || '%'
        OR u.name ILIKE '%' || p_search || '%'
        OR u.email ILIKE '%' || p_search || '%'
      )
      AND (
        p_attendance_min IS NULL
        OR COALESCE(att.rate, 0) >= p_attendance_min
      )
      AND (
        p_attendance_max IS NULL
        OR COALESCE(att.rate, 0) <= p_attendance_max
      )
      AND (
        p_performance IS NULL
        OR p_performance = ''
        OR (
          p_performance = 'excellent' AND COALESCE(att.rate, 0) >= 85
        )
        OR (
          p_performance = 'good'
          AND COALESCE(att.rate, 0) >= 70
          AND COALESCE(att.rate, 0) < 85
        )
        OR (
          p_performance = 'needs_attention'
          AND att.total > 0
          AND COALESCE(att.rate, 0) < 70
        )
        OR (
          p_performance = 'unknown' AND COALESCE(att.total, 0) = 0
        )
      )
  ),
  counted AS (
    SELECT COUNT(*)::INTEGER AS cnt FROM base
  ),
  paged AS (
    SELECT *
    FROM base
    ORDER BY name
    LIMIT COALESCE(p_page_size, 20)
    OFFSET GREATEST((COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 20), 0)
  )
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(row_to_json(p)::JSONB) FROM paged p), '[]'::JSONB),
    'meta', jsonb_build_object(
      'page', COALESCE(p_page, 1),
      'page_size', COALESCE(p_page_size, 20),
      'total', (SELECT cnt FROM counted),
      'total_pages', GREATEST(
        1,
        CEIL((SELECT cnt FROM counted)::NUMERIC / NULLIF(COALESCE(p_page_size, 20), 0))
      )
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ── Teacher remark RPC (staff on assigned students) ───────────────────────────

CREATE OR REPLACE FUNCTION public.add_student_remark(
  p_student_id UUID,
  p_remark TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institute_id UUID;
  v_trimmed TEXT;
BEGIN
  v_trimmed := TRIM(p_remark);

  IF v_trimmed IS NULL OR length(v_trimmed) < 3 THEN
    RAISE EXCEPTION 'Remark must be at least 3 characters';
  END IF;

  IF length(v_trimmed) > 500 THEN
    RAISE EXCEPTION 'Remark must be at most 500 characters';
  END IF;

  IF NOT public.teacher_can_access_student(p_student_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.get_my_role() NOT IN ('admin', 'staff', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT institute_id INTO v_institute_id
  FROM public.students
  WHERE id = p_student_id;

  INSERT INTO public.student_history (
    student_id,
    institute_id,
    action,
    remark,
    changed_by
  ) VALUES (
    p_student_id,
    v_institute_id,
    'remark_added',
    v_trimmed,
    auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_staff_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_assigned_batch_ids TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_access_student TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_students TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_student_remark TO authenticated;
