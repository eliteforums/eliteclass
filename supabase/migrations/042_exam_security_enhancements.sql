-- ============================================================
-- EduOS Migration 042 — MCQ Exam Security Enhancements
-- ============================================================
-- Adds strict security controls for online examinations:
-- - Single attempt enforcement
-- - Session tracking
-- - Timing controls
-- - Violation monitoring
-- - Multiple device prevention

-- ── 1. Extend Exam Attempt Status ────────────────────────────────────────────
DO $$ BEGIN
    ALTER TYPE exam_attempt_status ADD VALUE 'auto_submitted';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE exam_attempt_status ADD VALUE 'expired';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Enhanced Exam Attempts Table ──────────────────────────────────────────
-- Add columns for session tracking and security
ALTER TABLE public.exam_attempts
ADD COLUMN IF NOT EXISTS current_session_id UUID,
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS fullscreen_violations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tab_switch_violations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS browser_fingerprint TEXT,
ADD COLUMN IF NOT EXISTS device_id TEXT,
ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- ── 3. Session Management Table ──────────────────────────────────────────────
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
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibility shims when exam_sessions already existed from an earlier deploy.
ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS violation_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.exam_sessions
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- ── 4. Enhanced Violation Tracking Table ────────────────────────────────────
ALTER TABLE public.exam_violations
ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'low'; -- 'low', 'medium', 'high'

-- ── 5. Test Violations Table (for detailed tracking) ───────────────────────
CREATE TABLE IF NOT EXISTS public.test_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    violation_type TEXT NOT NULL, -- 'tab_switch', 'blur', 'fullscreen_exit', 'minimize', 'browser_close', 'multiple_device'
    violation_count INTEGER DEFAULT 1,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.test_violations
ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 1;

-- ── 6. Indexes for Performance ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exam_sessions_attempt ON public.exam_sessions(attempt_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_student ON public.exam_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_active ON public.exam_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_token ON public.exam_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_test_violations_attempt ON public.test_violations(attempt_id);
CREATE INDEX IF NOT EXISTS idx_test_violations_type ON public.test_violations(violation_type);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_locked ON public.exam_attempts(is_locked);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_session ON public.exam_attempts(current_session_id);

-- ── 7. Enable RLS on New Tables ──────────────────────────────────────────────
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_violations ENABLE ROW LEVEL SECURITY;

-- ── 8. RLS Policies for Exam Sessions ────────────────────────────────────────
CREATE POLICY "admin_read_exam_sessions" ON public.exam_sessions FOR SELECT
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff'));

CREATE POLICY "student_read_own_sessions" ON public.exam_sessions FOR SELECT
    USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

CREATE POLICY "student_create_session" ON public.exam_sessions FOR INSERT
    WITH CHECK (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

CREATE POLICY "student_update_own_session" ON public.exam_sessions FOR UPDATE
    USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()))
    WITH CHECK (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

-- ── 9. RLS Policies for Test Violations ──────────────────────────────────────
CREATE POLICY "admin_read_test_violations" ON public.test_violations FOR SELECT
    USING (attempt_id IN (SELECT id FROM public.exam_attempts WHERE institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff')));

CREATE POLICY "student_create_own_violations" ON public.test_violations FOR INSERT
    WITH CHECK (attempt_id IN (SELECT id FROM public.exam_attempts WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())));

-- ── 10. RLS Enhancements for Exam Attempts ────────────────────────────────────
-- Prevent updating submitted/locked attempts
CREATE POLICY "student_cannot_update_locked_attempts" ON public.exam_attempts FOR UPDATE
    USING (
        student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
        AND is_locked = FALSE
    )
    WITH CHECK (
        student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
        AND is_locked = FALSE
    );

-- Prevent deleting attempts
CREATE POLICY "prevent_attempt_deletion" ON public.exam_attempts FOR DELETE
    USING (FALSE);

-- ── 11. Function to Lock Attempt ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lock_exam_attempt(attempt_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.exam_attempts
    SET is_locked = TRUE
    WHERE id = attempt_id;
    
    -- End all active sessions for this attempt
    UPDATE public.exam_sessions
    SET is_active = FALSE, status = 'ended', ended_at = NOW()
    WHERE attempt_id = lock_exam_attempt.attempt_id AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 12. Function to Validate Exam Timing ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_exam_timing(exam_id UUID)
RETURNS TABLE (
    is_available BOOLEAN,
    current_server_time TIMESTAMPTZ,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    reason TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN e.start_time IS NOT NULL AND NOW() < e.start_time THEN FALSE
            WHEN e.end_time IS NOT NULL AND NOW() > e.end_time THEN FALSE
            ELSE TRUE
        END AS is_available,
        NOW() AS current_server_time,
        e.start_time,
        e.end_time,
        CASE 
            WHEN e.start_time IS NOT NULL AND NOW() < e.start_time THEN 'Test has not started yet'
            WHEN e.end_time IS NOT NULL AND NOW() > e.end_time THEN 'Test has ended'
            ELSE 'Available'
        END AS reason
    FROM public.exams e
    WHERE e.id = exam_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 13. Function to Check Active Attempts ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_active_student_attempt(
    p_exam_id UUID,
    p_student_id UUID
)
RETURNS TABLE (
    attempt_id UUID,
    status TEXT,
    is_locked BOOLEAN,
    started_at TIMESTAMPTZ,
    can_resume BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ea.id,
        ea.status::TEXT,
        ea.is_locked,
        ea.started_at,
        CASE 
            WHEN ea.status = 'in_progress' AND NOT ea.is_locked THEN TRUE
            ELSE FALSE
        END AS can_resume
    FROM public.exam_attempts ea
    WHERE ea.exam_id = p_exam_id 
        AND ea.student_id = p_student_id
    ORDER BY ea.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 14. Function to Count Multiple Devices/Sessions ──────────────────────────
CREATE OR REPLACE FUNCTION public.count_active_sessions_for_attempt(attempt_id UUID)
RETURNS INTEGER AS $$
DECLARE
    session_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO session_count
    FROM public.exam_sessions
    WHERE exam_sessions.attempt_id = count_active_sessions_for_attempt.attempt_id
        AND is_active = TRUE;
    
    RETURN session_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 15. Function to Validate Session Token ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_session_token(
    token VARCHAR(256)
)
RETURNS TABLE (
    is_valid BOOLEAN,
    attempt_id UUID,
    exam_id UUID,
    student_id UUID,
    is_active BOOLEAN,
    reason TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN es.id IS NULL THEN FALSE
            WHEN NOT es.is_active THEN FALSE
            WHEN es.ended_at IS NOT NULL THEN FALSE
            ELSE TRUE
        END AS is_valid,
        COALESCE(es.attempt_id, NULL::UUID) AS attempt_id,
        COALESCE(es.exam_id, NULL::UUID) AS exam_id,
        COALESCE(es.student_id, NULL::UUID) AS student_id,
        COALESCE(es.is_active, FALSE) AS is_active,
        CASE 
            WHEN es.id IS NULL THEN 'Session not found'
            WHEN NOT es.is_active THEN 'Session is inactive'
            WHEN es.ended_at IS NOT NULL THEN 'Session has ended'
            ELSE 'Valid'
        END AS reason
    FROM public.exam_sessions es
    WHERE es.session_token = validate_session_token.token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 16. Function to Auto-Submit on Timer Expiry ──────────────────────────────
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
        status = 'auto_submitted',
        submitted_at = NOW(),
        is_locked = TRUE
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

-- ── 17. Function to Track Violations and Auto-Submit ───────────────────────
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
    v_total_violations INTEGER;
    v_violation_id UUID;
BEGIN
    -- Insert new violation
    INSERT INTO public.test_violations (attempt_id, violation_type, metadata)
    VALUES (p_attempt_id, p_violation_type, COALESCE(p_metadata, '{}'::jsonb))
    RETURNING id INTO v_violation_id;
    
    -- Get total violation count
    SELECT COUNT(*)
    INTO v_total_violations
    FROM public.test_violations
    WHERE attempt_id = p_attempt_id;
    
    -- Update attempt violation count
    UPDATE public.exam_attempts
    SET violation_count = v_total_violations
    WHERE id = p_attempt_id;
    
    -- Auto-submit if violations exceed 3
    IF v_total_violations >= 3 THEN
        UPDATE public.exam_attempts
        SET 
            status = 'auto_submitted',
            submitted_at = NOW(),
            is_locked = TRUE
        WHERE id = p_attempt_id;
        
        RETURN QUERY SELECT v_violation_id, v_total_violations, TRUE, 'Auto-submitted due to excessive violations';
    ELSE
        RETURN QUERY SELECT v_violation_id, v_total_violations, FALSE, 'Violation recorded';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 18. Grant Permissions ───────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.lock_exam_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_exam_timing TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_student_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_sessions_for_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_session_token TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_submit_expired_attempts TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_and_check_violations TO authenticated;
