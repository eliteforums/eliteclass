-- ============================================================
-- EduOS Migration 052 — Exam security schema repair (run once)
-- ============================================================
-- Use this when exam migrations were partially applied and you see errors like:
--   column "status" of relation "exam_sessions" does not exist
--   column "violation_count" of relation "test_violations" does not exist
-- Safe to re-run: every change is idempotent (IF NOT EXISTS / OR REPLACE).

-- ── exam_attempts ───────────────────────────────────────────────────────────
ALTER TABLE public.exam_attempts
ADD COLUMN IF NOT EXISTS current_session_id UUID,
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS fullscreen_violations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tab_switch_violations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS browser_fingerprint TEXT,
ADD COLUMN IF NOT EXISTS device_id TEXT,
ADD COLUMN IF NOT EXISTS ip_address TEXT,
ADD COLUMN IF NOT EXISTS last_violation_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS auto_submit_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_exam_attempts_last_violation_at
  ON public.exam_attempts(last_violation_at);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_locked
  ON public.exam_attempts(is_locked);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_session
  ON public.exam_attempts(current_session_id);

-- ── exam_sessions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    session_token VARCHAR(256) NOT NULL UNIQUE,
    browser_fingerprint TEXT,
    device_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'active',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    violation_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS violation_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.exam_sessions
SET status = CASE WHEN COALESCE(is_active, TRUE) THEN 'active' ELSE 'ended' END
WHERE status IS DISTINCT FROM CASE WHEN COALESCE(is_active, TRUE) THEN 'active' ELSE 'ended' END;

-- ── test_violations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.test_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    violation_type TEXT NOT NULL,
    violation_count INTEGER DEFAULT 1,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.test_violations
ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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

-- Align violation_type with app (TEXT), not a custom enum named violation_type.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'test_violations' AND column_name = 'violation_type'
    ) THEN
        ALTER TABLE public.test_violations
        ALTER COLUMN violation_type TYPE TEXT USING violation_type::TEXT;
    END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'exam_violations' AND column_name = 'violation_type'
    ) THEN
        ALTER TABLE public.exam_violations
        ALTER COLUMN violation_type TYPE TEXT USING violation_type::TEXT;
    END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'violation_type' AND typnamespace = 'public'::regnamespace) THEN
        DROP TYPE public.violation_type;
    END IF;
EXCEPTION WHEN dependent_objects_still_exist THEN NULL;
END $$;

-- Ensure attempt_id references exam_attempts (not another attempts table).
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

DELETE FROM public.test_violations tv
WHERE NOT EXISTS (
    SELECT 1 FROM public.exam_attempts ea WHERE ea.id = tv.attempt_id
);

ALTER TABLE public.test_violations
DROP CONSTRAINT IF EXISTS test_violations_attempt_id_fkey;

ALTER TABLE public.test_violations
ADD CONSTRAINT test_violations_attempt_id_fkey
    FOREIGN KEY (attempt_id)
    REFERENCES public.exam_attempts(id)
    ON DELETE CASCADE;

-- ── session status trigger ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_exam_session_status()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status IS NULL OR NEW.status = '' THEN
            NEW.status := CASE WHEN COALESCE(NEW.is_active, TRUE) THEN 'active' ELSE 'ended' END;
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
        NEW.status := CASE WHEN NEW.is_active THEN 'active' ELSE 'ended' END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_exam_session_status ON public.exam_sessions;
CREATE TRIGGER trg_sync_exam_session_status
    BEFORE INSERT OR UPDATE ON public.exam_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_exam_session_status();

-- ── RPCs used by the exam player ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lock_exam_attempt(attempt_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.exam_attempts
    SET is_locked = TRUE
    WHERE id = lock_exam_attempt.attempt_id;

    UPDATE public.exam_sessions
    SET is_active = FALSE, status = 'ended', ended_at = NOW()
    WHERE attempt_id = lock_exam_attempt.attempt_id AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

GRANT EXECUTE ON FUNCTION public.lock_exam_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_and_check_violations TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_submit_expired_attempts TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exam_attempt_violations TO authenticated;
