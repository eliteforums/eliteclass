-- ============================================================
-- EduOS Migration 054 — test_violations.attempt_id FK repair
-- ============================================================
-- Fixes: insert on test_violations violates foreign key test_violations_attempt_id_fkey
-- Usually the FK pointed at the wrong table; it must reference exam_attempts(id).

-- Drop any existing FK on attempt_id (wrong target or duplicate name).
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'test_violations'
          AND c.contype = 'f'
          AND EXISTS (
              SELECT 1
              FROM unnest(c.conkey) AS col(attnum)
              JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = col.attnum
              WHERE a.attname = 'attempt_id'
          )
    LOOP
        EXECUTE format(
            'ALTER TABLE public.test_violations DROP CONSTRAINT IF EXISTS %I',
            r.conname
        );
    END LOOP;
END $$;

-- Remove rows that cannot belong to an exam attempt.
DELETE FROM public.test_violations tv
WHERE NOT EXISTS (
    SELECT 1 FROM public.exam_attempts ea WHERE ea.id = tv.attempt_id
);

ALTER TABLE public.test_violations
ADD CONSTRAINT test_violations_attempt_id_fkey
    FOREIGN KEY (attempt_id)
    REFERENCES public.exam_attempts(id)
    ON DELETE CASCADE;

-- Harden RPC: only log violations for real exam attempts.
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
    IF p_attempt_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.exam_attempts WHERE id = p_attempt_id
    ) THEN
        RETURN QUERY
        SELECT NULL::UUID, 0, FALSE, 'Exam attempt not found';
        RETURN;
    END IF;

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
        p_violation_type::TEXT,
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

ALTER FUNCTION public.record_and_check_violations(UUID, TEXT, JSONB) SET search_path = public;

GRANT EXECUTE ON FUNCTION public.record_and_check_violations TO authenticated;
