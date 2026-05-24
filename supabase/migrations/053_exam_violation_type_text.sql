-- ============================================================
-- EduOS Migration 053 — violation_type enum → TEXT
-- ============================================================
-- Fixes: column "violation_type" is of type violation_type but expression is of type text
-- The app and record_and_check_violations() pass plain text labels.

-- test_violations (proctoring log used by record_and_check_violations)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'test_violations'
          AND column_name = 'violation_type'
    ) THEN
        ALTER TABLE public.test_violations
        ALTER COLUMN violation_type TYPE TEXT USING violation_type::TEXT;
    END IF;
EXCEPTION
    WHEN others THEN
        -- Column may already be TEXT; ignore duplicate_alter errors.
        NULL;
END $$;

-- exam_violations (legacy direct inserts from exam.service)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'exam_violations'
          AND column_name = 'violation_type'
    ) THEN
        ALTER TABLE public.exam_violations
        ALTER COLUMN violation_type TYPE TEXT USING violation_type::TEXT;
    END IF;
EXCEPTION
    WHEN others THEN
        NULL;
END $$;

-- Remove orphaned enum if nothing else references it.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'violation_type' AND typnamespace = 'public'::regnamespace) THEN
        DROP TYPE public.violation_type;
    END IF;
EXCEPTION
    WHEN dependent_objects_still_exist THEN
        NULL;
END $$;
