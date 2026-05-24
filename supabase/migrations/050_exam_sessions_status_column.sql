-- ============================================================
-- EduOS Migration 050 — exam_sessions.status column
-- ============================================================
-- Fixes: column "status" of relation "exam_sessions" does not exist
-- Legacy triggers/policies may reference status alongside is_active.

ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS violation_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.exam_sessions
SET status = CASE WHEN COALESCE(is_active, TRUE) THEN 'active' ELSE 'ended' END
WHERE status IS DISTINCT FROM CASE WHEN COALESCE(is_active, TRUE) THEN 'active' ELSE 'ended' END;

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
