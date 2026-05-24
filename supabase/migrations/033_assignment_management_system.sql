-- ============================================================
-- EduOS Migration 033 — Assignment Management System
-- ============================================================

-- ── 1. Enums ────────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE assignment_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE submission_status AS ENUM ('pending', 'submitted', 'late', 'reviewed', 'graded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Tables ───────────────────────────────────────────────────────────────

-- 1. Main Assignments Table
CREATE TABLE IF NOT EXISTS public.assignments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id      UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    created_by        UUID NOT NULL REFERENCES public.users(id),
    title             TEXT NOT NULL,
    description       TEXT, -- Rich text content
    instructions      TEXT,
    total_marks       NUMERIC(10,2) DEFAULT 100,
    due_date          TIMESTAMPTZ,
    status            assignment_status NOT NULL DEFAULT 'draft',
    allow_late        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Assignment Assignees (Junction Table for Students)
CREATE TABLE IF NOT EXISTS public.assignment_assignees (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id     UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id        UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    institute_id      UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    assigned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(assignment_id, student_id)
);

-- 3. Assignment Resources (Files attached by Admin)
CREATE TABLE IF NOT EXISTS public.assignment_resources (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id     UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    institute_id      UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    file_name         TEXT NOT NULL,
    file_url          TEXT NOT NULL,
    storage_path      TEXT NOT NULL,
    file_type         TEXT,
    file_size         BIGINT,
    uploaded_by       UUID NOT NULL REFERENCES public.users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Assignment Submissions (Student work)
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id     UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id        UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    institute_id      UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    content           TEXT, -- Optional text submission
    status            submission_status NOT NULL DEFAULT 'submitted',
    submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_late           BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Grading & Feedback (integrated to keep it separate from LMS lessons)
    grade             NUMERIC(10,2),
    feedback          TEXT,
    graded_at         TIMESTAMPTZ,
    graded_by         UUID REFERENCES public.users(id),
    
    UNIQUE(assignment_id, student_id)
);

-- 5. Submission Files
CREATE TABLE IF NOT EXISTS public.submission_files (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id     UUID NOT NULL REFERENCES public.assignment_submissions(id) ON DELETE CASCADE,
    institute_id      UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    file_name         TEXT NOT NULL,
    file_url          TEXT NOT NULL,
    storage_path      TEXT NOT NULL,
    file_type         TEXT,
    file_size         BIGINT,
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Storage Buckets ───────────────────────────────────────────────────────
-- Supabase handles buckets via SQL or UI. We'll declare the policy-driven access here.
-- Buckets: 'assignment-resources', 'assignment-submissions'

-- ── 4. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assignments_institute ON public.assignments(institute_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status    ON public.assignments(status);
CREATE INDEX IF NOT EXISTS idx_assignees_student    ON public.assignment_assignees(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON public.assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student    ON public.assignment_submissions(student_id);

-- ── 5. RLS Policies ─────────────────────────────────────────────────────────
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;

-- Assignments Policies
CREATE POLICY "admin_manage_assignments" ON public.assignments FOR ALL
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "student_read_assigned_assignments" ON public.assignments FOR SELECT
    USING (
        assignments.id IN (
            SELECT assignment_id FROM public.assignment_assignees aa
            JOIN public.students s ON s.id = aa.student_id
            WHERE s.user_id = auth.uid()
        )
    );

-- Assignees Policies
CREATE POLICY "admin_manage_assignees" ON public.assignment_assignees FOR ALL
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "student_read_own_assignment_link" ON public.assignment_assignees FOR SELECT
    USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

-- Submissions Policies
CREATE POLICY "admin_read_all_submissions" ON public.assignment_submissions FOR SELECT
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "admin_grade_submissions" ON public.assignment_submissions FOR UPDATE
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "student_manage_own_submission" ON public.assignment_submissions FOR ALL
    USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()))
    WITH CHECK (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

-- File Policies (Resources & Submissions)
CREATE POLICY "admin_manage_resources" ON public.assignment_resources FOR ALL
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "student_read_resources" ON public.assignment_resources FOR SELECT
    USING (assignment_id IN (
        SELECT assignment_id FROM public.assignment_assignees aa
        JOIN public.students s ON s.id = aa.student_id
        WHERE s.user_id = auth.uid()
    ));

CREATE POLICY "admin_read_submission_files" ON public.submission_files FOR SELECT
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() = 'admin');

CREATE POLICY "student_manage_own_submission_files" ON public.submission_files FOR ALL
    USING (submission_id IN (
        SELECT sub.id FROM public.assignment_submissions sub
        JOIN public.students s ON s.id = sub.student_id
        WHERE s.user_id = auth.uid()
    ));

-- ── 6. Triggers ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS assignments_set_updated_at ON public.assignments;
CREATE TRIGGER assignments_set_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
