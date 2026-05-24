-- ============================================================
-- EduOS Migration 020 — Analytics & Reporting (aggregated RPCs)
-- ============================================================

CREATE OR REPLACE FUNCTION public.analytics_can_access_institute(p_institute_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_super_admin()
    OR (get_my_institute_id() = p_institute_id AND get_my_role() IN ('admin', 'staff'));
$$;

CREATE OR REPLACE FUNCTION public.analytics_can_access_student(p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id
      AND (
        is_super_admin()
        OR (get_my_role() = 'admin' AND s.institute_id = get_my_institute_id())
        OR (get_my_role() = 'staff' AND s.institute_id = get_my_institute_id())
        OR (get_my_role() = 'student' AND s.user_id = auth.uid())
        OR (
          get_my_role() = 'parent'
          AND s.id IN (
            SELECT sp.student_id FROM public.student_parents sp
            JOIN public.parents p ON p.id = sp.parent_id
            WHERE p.user_id = auth.uid()
          )
        )
      )
  );
$$;

-- Institute-wide KPI bundle
CREATE OR REPLACE FUNCTION public.get_institute_analytics_overview(
  p_institute_id UUID,
  p_batch_id UUID DEFAULT NULL,
  p_date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_att_total INTEGER := 0;
  v_att_present INTEGER := 0;
  v_collected NUMERIC := 0;
  v_pending NUMERIC := 0;
  v_overdue NUMERIC := 0;
BEGIN
  IF NOT public.analytics_can_access_institute(p_institute_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))::INTEGER
  INTO v_att_total, v_att_present
  FROM public.attendance_records ar
  JOIN public.attendance_sessions s ON s.id = ar.session_id
  WHERE s.institute_id = p_institute_id
    AND (p_batch_id IS NULL OR s.batch_id = p_batch_id)
    AND s.session_date BETWEEN p_date_from AND p_date_to;

  SELECT COALESCE(SUM(fp.amount), 0) INTO v_collected
  FROM public.fee_payments fp
  JOIN public.student_fees sf ON sf.id = fp.student_fee_id
  JOIN public.students st ON st.id = sf.student_id
  WHERE fp.institute_id = p_institute_id
    AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
    AND fp.payment_date BETWEEN p_date_from AND p_date_to;

  SELECT
    COALESCE(SUM(GREATEST(sf.final_amount - COALESCE(paid.total, 0), 0)) FILTER (WHERE sf.status IN ('pending', 'partial')), 0),
    COALESCE(SUM(GREATEST(sf.final_amount - COALESCE(paid.total, 0), 0)) FILTER (WHERE sf.status = 'overdue'), 0)
  INTO v_pending, v_overdue
  FROM public.student_fees sf
  JOIN public.students st ON st.id = sf.student_id
  LEFT JOIN (
    SELECT student_fee_id, SUM(amount) AS total
    FROM public.fee_payments
    WHERE institute_id = p_institute_id
    GROUP BY student_fee_id
  ) paid ON paid.student_fee_id = sf.id
  WHERE sf.institute_id = p_institute_id;

  RETURN jsonb_build_object(
    'students', jsonb_build_object(
      'total', (
        SELECT COUNT(*)
        FROM public.students
        WHERE institute_id = p_institute_id
          AND (p_batch_id IS NULL OR batch_id = p_batch_id)
      ),
      'active', (
        SELECT COUNT(*)
        FROM public.students
        WHERE institute_id = p_institute_id
          AND status = 'active'
          AND (p_batch_id IS NULL OR batch_id = p_batch_id)
      )
    ),
    'staff', jsonb_build_object(
      'total', (
        SELECT COUNT(DISTINCT sa.staff_id)
        FROM public.staff_assignments sa
        JOIN public.staff s ON s.id = sa.staff_id
        WHERE sa.institute_id = p_institute_id
          AND s.is_active IS TRUE
          AND (p_batch_id IS NULL OR sa.batch_id = p_batch_id)
      ),
      'assignments', (
        SELECT COUNT(*)
        FROM public.staff_assignments sa
        JOIN public.staff s ON s.id = sa.staff_id
        WHERE sa.institute_id = p_institute_id
          AND s.is_active IS TRUE
          AND (p_batch_id IS NULL OR sa.batch_id = p_batch_id)
      )
    ),
    'parents', jsonb_build_object(
      'total', (
        SELECT COUNT(DISTINCT sp.parent_id)
        FROM public.student_parents sp
        JOIN public.students st ON st.id = sp.student_id
        WHERE st.institute_id = p_institute_id
          AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
      )
    ),
    'batches', jsonb_build_object(
      'total', (
        SELECT COUNT(*)
        FROM public.batches
        WHERE institute_id = p_institute_id
          AND (p_batch_id IS NULL OR id = p_batch_id)
      ),
      'active', (
        SELECT COUNT(*)
        FROM public.batches
        WHERE institute_id = p_institute_id
          AND is_active = TRUE
          AND (p_batch_id IS NULL OR id = p_batch_id)
      )
    ),
    'attendance', jsonb_build_object(
      'total_records', v_att_total,
      'present_or_late', v_att_present,
      'rate', CASE WHEN v_att_total > 0 THEN ROUND((v_att_present::NUMERIC / v_att_total) * 100) ELSE 0 END
    ),
    'fees', jsonb_build_object(
      'collected_in_range', v_collected,
      'pending', v_pending,
      'overdue', v_overdue
    ),
    'schedules', jsonb_build_object(
      'published', (
        SELECT COUNT(*)
        FROM public.schedules
        WHERE institute_id = p_institute_id
          AND status = 'published'
          AND (p_batch_id IS NULL OR batch_id = p_batch_id)
      ),
      'draft', (
        SELECT COUNT(*)
        FROM public.schedules
        WHERE institute_id = p_institute_id
          AND status = 'draft'
          AND (p_batch_id IS NULL OR batch_id = p_batch_id)
      ),
      'exam_slots', (
        SELECT COUNT(*)
        FROM public.schedules
        WHERE institute_id = p_institute_id
          AND type = 'exam'
          AND (p_batch_id IS NULL OR batch_id = p_batch_id)
      )
    ),
    'courses', jsonb_build_object(
      'enrollments_active', (
        SELECT COUNT(*)
        FROM public.student_courses sc
        JOIN public.students st ON st.id = sc.student_id
        WHERE sc.institute_id = p_institute_id
          AND sc.status = 'active'
          AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
      )
    )
  );
END;
$$;

-- Attendance trends + batch breakdown
CREATE OR REPLACE FUNCTION public.get_institute_attendance_analytics(
  p_institute_id UUID,
  p_batch_id UUID DEFAULT NULL,
  p_date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.analytics_can_access_institute(p_institute_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN jsonb_build_object(
    'daily_trend', COALESCE((
      SELECT jsonb_agg(row ORDER BY row->>'date')
      FROM (
        SELECT jsonb_build_object(
          'date', s.session_date,
          'label', to_char(s.session_date, 'Mon DD'),
          'present', COUNT(*) FILTER (WHERE ar.status = 'present'),
          'absent', COUNT(*) FILTER (WHERE ar.status = 'absent'),
          'late', COUNT(*) FILTER (WHERE ar.status = 'late'),
          'leave', COUNT(*) FILTER (WHERE ar.status = 'leave'),
          'total', COUNT(*),
          'percentage', CASE WHEN COUNT(*) > 0
            THEN ROUND((COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))::NUMERIC / COUNT(*)) * 100)
            ELSE 0 END
        ) AS row
        FROM public.attendance_sessions s
        JOIN public.attendance_records ar ON ar.session_id = s.id
        WHERE s.institute_id = p_institute_id
          AND s.session_date BETWEEN p_date_from AND p_date_to
          AND (p_batch_id IS NULL OR s.batch_id = p_batch_id)
        GROUP BY s.session_date
        ORDER BY s.session_date
        LIMIT 60
      ) t
    ), '[]'::JSONB),
    'batch_breakdown', COALESCE((
      SELECT jsonb_agg(row ORDER BY (row->>'rate')::INTEGER DESC)
      FROM (
        SELECT jsonb_build_object(
          'batch_id', b.id,
          'batch_name', b.name,
          'total', COUNT(ar.id),
          'present', COUNT(*) FILTER (WHERE ar.status IN ('present', 'late')),
          'rate', CASE WHEN COUNT(ar.id) > 0
            THEN ROUND((COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))::NUMERIC / COUNT(ar.id)) * 100)
            ELSE 0 END
        ) AS row
        FROM public.batches b
        LEFT JOIN public.attendance_sessions s ON s.batch_id = b.id
          AND s.institute_id = p_institute_id
          AND s.session_date BETWEEN p_date_from AND p_date_to
        LEFT JOIN public.attendance_records ar ON ar.session_id = s.id
        WHERE b.institute_id = p_institute_id
          AND (p_batch_id IS NULL OR b.id = p_batch_id)
        GROUP BY b.id, b.name
        HAVING COUNT(ar.id) > 0 OR p_batch_id IS NOT NULL
      ) t
    ), '[]'::JSONB),
    'status_distribution', COALESCE((
      SELECT jsonb_build_object(
        'present', COUNT(*) FILTER (WHERE ar.status = 'present'),
        'absent', COUNT(*) FILTER (WHERE ar.status = 'absent'),
        'late', COUNT(*) FILTER (WHERE ar.status = 'late'),
        'leave', COUNT(*) FILTER (WHERE ar.status = 'leave')
      )
      FROM public.attendance_records ar
      JOIN public.attendance_sessions s ON s.id = ar.session_id
      WHERE s.institute_id = p_institute_id
        AND s.session_date BETWEEN p_date_from AND p_date_to
        AND (p_batch_id IS NULL OR s.batch_id = p_batch_id)
    ), '{}'::JSONB)
  );
END;
$$;

-- Fee analytics
CREATE OR REPLACE FUNCTION public.get_institute_fee_analytics(
  p_institute_id UUID,
  p_batch_id UUID DEFAULT NULL,
  p_date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '180 days')::DATE,
  p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.analytics_can_access_institute(p_institute_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN jsonb_build_object(
    'status_distribution', COALESCE((
      SELECT jsonb_object_agg(status, cnt)
      FROM (
        SELECT sf.status, COUNT(*)::INTEGER AS cnt
        FROM public.student_fees sf
        JOIN public.students st ON st.id = sf.student_id
        WHERE sf.institute_id = p_institute_id
          AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
        GROUP BY sf.status
      ) s
    ), '{}'::JSONB),
    'monthly_revenue', COALESCE((
      SELECT jsonb_agg(row ORDER BY row->>'month')
      FROM (
        SELECT jsonb_build_object(
          'month', to_char(fp.payment_date, 'YYYY-MM'),
          'label', to_char(fp.payment_date, 'Mon YYYY'),
          'amount', SUM(fp.amount)
        ) AS row
        FROM public.fee_payments fp
        JOIN public.student_fees sf ON sf.id = fp.student_fee_id
        JOIN public.students st ON st.id = sf.student_id
        WHERE fp.institute_id = p_institute_id
          AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
          AND fp.payment_date BETWEEN p_date_from AND p_date_to
        GROUP BY to_char(fp.payment_date, 'YYYY-MM'), to_char(fp.payment_date, 'Mon YYYY')
        ORDER BY to_char(fp.payment_date, 'YYYY-MM')
        LIMIT 12
      ) t
    ), '[]'::JSONB),
    'totals', jsonb_build_object(
      'collected', (
        SELECT COALESCE(SUM(fp.amount), 0)
        FROM public.fee_payments fp
        JOIN public.student_fees sf ON sf.id = fp.student_fee_id
        JOIN public.students st ON st.id = sf.student_id
        WHERE fp.institute_id = p_institute_id
          AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
          AND fp.payment_date BETWEEN p_date_from AND p_date_to
      ),
      'pending', (
        SELECT COALESCE(SUM(GREATEST(sf.final_amount - COALESCE(paid.total, 0), 0)), 0)
        FROM public.student_fees sf
        JOIN public.students st ON st.id = sf.student_id
        LEFT JOIN (
          SELECT student_fee_id, SUM(amount) AS total FROM public.fee_payments
          WHERE institute_id = p_institute_id GROUP BY student_fee_id
        ) paid ON paid.student_fee_id = sf.id
        WHERE sf.institute_id = p_institute_id
          AND sf.status IN ('pending', 'partial')
          AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
      ),
      'overdue', (
        SELECT COALESCE(SUM(GREATEST(sf.final_amount - COALESCE(paid.total, 0), 0)), 0)
        FROM public.student_fees sf
        JOIN public.students st ON st.id = sf.student_id
        LEFT JOIN (
          SELECT student_fee_id, SUM(amount) AS total FROM public.fee_payments
          WHERE institute_id = p_institute_id GROUP BY student_fee_id
        ) paid ON paid.student_fee_id = sf.id
        WHERE sf.institute_id = p_institute_id
          AND sf.status = 'overdue'
          AND (p_batch_id IS NULL OR st.batch_id = p_batch_id)
      )
    )
  );
END;
$$;

-- Schedule / staff workload
CREATE OR REPLACE FUNCTION public.get_institute_schedule_analytics(
  p_institute_id UUID,
  p_batch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.analytics_can_access_institute(p_institute_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN jsonb_build_object(
    'by_type', COALESCE((
      SELECT jsonb_object_agg(type, cnt)
      FROM (
        SELECT type::TEXT, COUNT(*)::INTEGER AS cnt
        FROM public.schedules
        WHERE institute_id = p_institute_id
          AND status = 'published'
          AND (p_batch_id IS NULL OR batch_id = p_batch_id)
        GROUP BY type
      ) t
    ), '{}'::JSONB),
    'teacher_workload', COALESCE((
      SELECT jsonb_agg(row ORDER BY (row->>'slots')::INTEGER DESC)
      FROM (
        SELECT jsonb_build_object(
          'staff_id', st.id,
          'name', u.name,
          'slots', COUNT(sch.id)
        ) AS row
        FROM public.schedules sch
        JOIN public.staff st ON st.id = sch.teacher_id
        JOIN public.users u ON u.id = st.user_id
        WHERE sch.institute_id = p_institute_id
          AND sch.status = 'published'
          AND (p_batch_id IS NULL OR sch.batch_id = p_batch_id)
        GROUP BY st.id, u.name
        ORDER BY COUNT(sch.id) DESC
        LIMIT 10
      ) t
    ), '[]'::JSONB)
  );
END;
$$;

-- Per-student analytics (parent / student / admin)
CREATE OR REPLACE FUNCTION public.get_student_analytics(
  p_student_id UUID,
  p_date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '90 days')::DATE,
  p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institute_id UUID;
  v_att_total INTEGER := 0;
  v_att_present INTEGER := 0;
BEGIN
  IF NOT public.analytics_can_access_student(p_student_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT institute_id INTO v_institute_id FROM public.students WHERE id = p_student_id;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))
  INTO v_att_total, v_att_present
  FROM public.attendance_records ar
  JOIN public.attendance_sessions s ON s.id = ar.session_id
  WHERE ar.student_id = p_student_id
    AND s.session_date BETWEEN p_date_from AND p_date_to;

  RETURN jsonb_build_object(
    'student_id', p_student_id,
    'attendance', jsonb_build_object(
      'total', v_att_total,
      'present_or_late', v_att_present,
      'rate', CASE WHEN v_att_total > 0 THEN ROUND((v_att_present::NUMERIC / v_att_total) * 100) ELSE 0 END,
      'weekly_trend', COALESCE((
        SELECT jsonb_agg(row ORDER BY row->>'period')
        FROM (
          SELECT jsonb_build_object(
            'period', s.session_date,
            'label', to_char(s.session_date, 'Dy'),
            'present', COUNT(*) FILTER (WHERE ar.status = 'present'),
            'absent', COUNT(*) FILTER (WHERE ar.status = 'absent'),
            'late', COUNT(*) FILTER (WHERE ar.status = 'late'),
            'leave', COUNT(*) FILTER (WHERE ar.status = 'leave'),
            'total', COUNT(*),
            'percentage', CASE WHEN COUNT(*) > 0
              THEN ROUND((COUNT(*) FILTER (WHERE ar.status IN ('present', 'late'))::NUMERIC / COUNT(*)) * 100)
              ELSE 0 END
          ) AS row
          FROM public.attendance_records ar
          JOIN public.attendance_sessions s ON s.id = ar.session_id
          WHERE ar.student_id = p_student_id
            AND s.session_date BETWEEN p_date_from AND p_date_to
          GROUP BY s.session_date
          ORDER BY s.session_date DESC
          LIMIT 14
        ) t
      ), '[]'::JSONB)
    ),
    'courses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'course_name', c.name,
        'status', sc.status,
        'enrolled_at', sc.enrolled_at
      ))
      FROM public.student_courses sc
      JOIN public.courses c ON c.id = sc.course_id
      WHERE sc.student_id = p_student_id
    ), '[]'::JSONB),
    'fees', COALESCE((
      SELECT jsonb_build_object(
        'total_due', COALESCE(SUM(sf.final_amount), 0),
        'total_paid', COALESCE(SUM(sf.paid_so_far), 0),
        'pending_count', COUNT(*) FILTER (WHERE sf.status IN ('pending', 'partial', 'overdue'))
      )
      FROM public.student_fees sf
      WHERE sf.student_id = p_student_id
    ), '{}'::JSONB),
    'insights', jsonb_build_array(
      CASE WHEN v_att_total > 0 AND (v_att_present::NUMERIC / v_att_total) < 0.75
        THEN 'Attendance is below 75% — consider follow-up with guardians.'
        ELSE 'Attendance is within acceptable range.'
      END
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_institute_analytics_overview(UUID, UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_institute_attendance_analytics(UUID, UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_institute_fee_analytics(UUID, UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_institute_schedule_analytics(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_analytics(UUID, DATE, DATE) TO authenticated;
