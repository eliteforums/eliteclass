-- ============================================================
-- EduOS Migration 048 — Exam Proctoring Race Fix
-- ============================================================

-- 1. Add tracking columns to exam attempts.
ALTER TABLE public.exam_attempts
ADD COLUMN IF NOT EXISTS last_violation_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_submit_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_exam_attempts_last_violation_at
  ON public.exam_attempts(last_violation_at);

-- 2. Normalize any legacy attempt states before we tighten logic further.
DO $$
BEGIN
  UPDATE public.exam_attempts
  SET status = 'in_progress'
  WHERE status::text = 'active';
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- 3. Replace the violation RPC with an atomic row-locking implementation.
CREATE OR REPLACE FUNCTION public.record_and_check_violations(
    p_attempt_id UUID,
    p_violation_type TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (
    violation_id UUID,
    total_violations INTEGER,
    should_auto_submit BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    v_violation_id UUID;
    v_total_violations INTEGER;
BEGIN
    UPDATE public.exam_attempts
    SET
        violation_count = COALESCE(violation_count, 0) + 1,
        last_violation_at = NOW()
    WHERE id = p_attempt_id
      AND status = 'in_progress'
      AND NOT is_locked
    RETURNING violation_count INTO v_total_violations;

    IF NOT FOUND THEN
        SELECT COALESCE(violation_count, 0)
        INTO v_total_violations
        FROM public.exam_attempts
        WHERE id = p_attempt_id;

        RETURN QUERY
        SELECT NULL::UUID, COALESCE(v_total_violations, 0), FALSE, 'Attempt is no longer active';
        RETURN;
    END IF;

    INSERT INTO public.test_violations (
        attempt_id,
        violation_type,
        violation_count,
        metadata
    )
    VALUES (
        p_attempt_id,
        p_violation_type,
        v_total_violations,
        COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_violation_id;

    IF v_total_violations >= 3 THEN
        UPDATE public.exam_attempts
        SET
            status = 'submitted',
            submitted_at = COALESCE(submitted_at, NOW()),
            is_locked = TRUE,
            auto_submit_reason = 'Exceeded maximum proctoring violations',
            last_violation_at = NOW()
        WHERE id = p_attempt_id;

        RETURN QUERY
        SELECT v_violation_id, v_total_violations, TRUE, 'Auto-submitted due to excessive violations';
        RETURN;
    END IF;

    UPDATE public.exam_attempts
    SET auto_submit_reason = NULL
    WHERE id = p_attempt_id;

    RETURN QUERY
    SELECT v_violation_id, v_total_violations, FALSE, 'Violation recorded';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Auto-submit expired attempts using the submitted status.
CREATE OR REPLACE FUNCTION public.auto_submit_expired_attempts()
RETURNS TABLE (
    attempt_id UUID,
    exam_id UUID,
    student_id UUID,
    submitted_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    UPDATE public.exam_attempts ea
    SET
        status = 'submitted',
        submitted_at = NOW(),
        is_locked = TRUE,
        auto_submit_reason = 'Time limit expired'
    WHERE
        ea.status = 'in_progress'
        AND NOT ea.is_locked
        AND NOW() > (ea.started_at + (
            SELECT COALESCE(e.duration_mins, 60) * INTERVAL '1 minute'
            FROM public.exams e
            WHERE e.id = ea.exam_id
        ))
    RETURNING ea.id, ea.exam_id, ea.student_id, ea.submitted_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Admin/staff summary data source for proctoring.
CREATE OR REPLACE FUNCTION public.get_exam_attempt_violations(p_exam_id UUID)
RETURNS TABLE (
    attempt_id UUID,
    student_name TEXT,
    admission_no TEXT,
    violations INTEGER,
    status TEXT,
    last_violation_at TIMESTAMPTZ,
    auto_submit_reason TEXT,
    submitted_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ea.id AS attempt_id,
        u.name AS student_name,
        s.admission_no,
        COALESCE(ea.violation_count, 0) AS violations,
        ea.status::TEXT AS status,
        ea.last_violation_at,
        ea.auto_submit_reason,
        ea.submitted_at
    FROM public.exam_attempts ea
    JOIN public.students s ON s.id = ea.student_id
    JOIN public.users u ON u.id = s.user_id
    WHERE ea.exam_id = p_exam_id
    ORDER BY COALESCE(ea.last_violation_at, ea.submitted_at, ea.started_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.record_and_check_violations TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_submit_expired_attempts TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_attempt_violations TO authenticated;