-- ============================================================
-- EduOS Migration 051 — test_violations.violation_count column
-- ============================================================
-- Fixes: column "violation_count" of relation "test_violations" does not exist
-- Required by record_and_check_violations() (migration 048).

ALTER TABLE public.test_violations
ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 1;

-- Backfill per-attempt sequence for existing rows.
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY attempt_id
            ORDER BY COALESCE(timestamp, created_at)
        )::INTEGER AS seq
    FROM public.test_violations
    WHERE violation_count IS NULL
)
UPDATE public.test_violations tv
SET violation_count = ranked.seq
FROM ranked
WHERE tv.id = ranked.id;

UPDATE public.test_violations
SET violation_count = 1
WHERE violation_count IS NULL;

-- Ensure the proctoring RPC matches the current schema.
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

GRANT EXECUTE ON FUNCTION public.record_and_check_violations TO authenticated;
