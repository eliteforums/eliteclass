-- =============================================================================
-- Migration: Add teacher-configurable submission type flags to assignments
--
-- Replaces the single 'submission_type' enum with three independent boolean
-- flags so teachers can enable/disable text, link, and file-upload options
-- individually (and allow any combination of them).
-- =============================================================================

-- ── 1. Add new boolean columns to the assignments table ──────────────────────
ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS allow_text         BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS allow_link         BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS allow_file_upload  BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 2. Backfill existing rows ────────────────────────────────────────────────
-- For assignments that had a restrictive 'submission_type', we seed the flags
-- so that existing behaviour is preserved.  Everything else (NULL / 'any')
-- keeps the TRUE defaults set above.
UPDATE public.assignments
    SET allow_text        = FALSE,
        allow_link        = FALSE,
        allow_file_upload = TRUE
    WHERE submission_type = 'file_upload';

UPDATE public.assignments
    SET allow_text        = TRUE,
        allow_link        = FALSE,
        allow_file_upload = FALSE
    WHERE submission_type = 'text';

UPDATE public.assignments
    SET allow_text        = FALSE,
        allow_link        = TRUE,
        allow_file_upload = FALSE
    WHERE submission_type = 'url_link';

-- ── 3. Index for filtering by submission-type capabilities ───────────────────
CREATE INDEX IF NOT EXISTS idx_assignments_allow_text
    ON public.assignments(allow_text);

CREATE INDEX IF NOT EXISTS idx_assignments_allow_link
    ON public.assignments(allow_link);

CREATE INDEX IF NOT EXISTS idx_assignments_allow_file_upload
    ON public.assignments(allow_file_upload);

-- ── 4. Add comment documenting the migration ─────────────────────────────────
COMMENT ON COLUMN public.assignments.allow_text IS
    'When TRUE students can submit a written text response.';

COMMENT ON COLUMN public.assignments.allow_link IS
    'When TRUE students can submit a URL / link.';

COMMENT ON COLUMN public.assignments.allow_file_upload IS
    'When TRUE students can upload one or more files.';
