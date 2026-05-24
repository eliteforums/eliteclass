-- ============================================================
-- EduOS Migration 041 — MCQ Test/Exam System
-- ============================================================

-- ── 1. Enums ────────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE exam_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE exam_attempt_status AS ENUM ('in_progress', 'submitted', 'graded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Tables ───────────────────────────────────────────────────────────────

-- 1. Main Exams Table
CREATE TABLE IF NOT EXISTS public.exams (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id                UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    created_by                  UUID NOT NULL REFERENCES public.users(id),
    title                       TEXT NOT NULL,
    description                 TEXT,
    instructions                TEXT,
    duration_mins               INTEGER NOT NULL DEFAULT 60,
    start_time                  TIMESTAMPTZ,
    end_time                    TIMESTAMPTZ,
    total_marks                 NUMERIC(10,2) DEFAULT 0,
    passing_marks               NUMERIC(10,2) DEFAULT 0,
    status                      exam_status NOT NULL DEFAULT 'draft',
    auto_submit                 BOOLEAN NOT NULL DEFAULT TRUE,
    negative_marking            BOOLEAN NOT NULL DEFAULT FALSE,
    negative_marks_per_question NUMERIC(10,2) DEFAULT 0,
    randomize_questions         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Exam Questions
CREATE TABLE IF NOT EXISTS public.exam_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id         UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    question_text   TEXT NOT NULL,
    image_url       TEXT,
    marks           NUMERIC(10,2) NOT NULL DEFAULT 1,
    explanation     TEXT,
    position        INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Exam Options
CREATE TABLE IF NOT EXISTS public.exam_options (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id     UUID NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
    option_text     TEXT NOT NULL,
    is_correct      BOOLEAN NOT NULL DEFAULT FALSE,
    position        INTEGER NOT NULL DEFAULT 0
);

-- 4. Exam Assignments (Link to Students)
CREATE TABLE IF NOT EXISTS public.exam_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id         UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id      UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    institute_id    UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(exam_id, student_id)
);

-- 5. Exam Attempts
CREATE TABLE IF NOT EXISTS public.exam_attempts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id             UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id          UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    institute_id        UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    status              exam_attempt_status NOT NULL DEFAULT 'in_progress',
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at        TIMESTAMPTZ,
    score               NUMERIC(10,2) DEFAULT 0,
    total_questions     INTEGER DEFAULT 0,
    correct_answers     INTEGER DEFAULT 0,
    wrong_answers       INTEGER DEFAULT 0,
    unanswered_questions INTEGER DEFAULT 0,
    percentage          NUMERIC(5,2) DEFAULT 0,
    passed              BOOLEAN DEFAULT FALSE,
    violation_count     INTEGER DEFAULT 0,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Exam Answers
CREATE TABLE IF NOT EXISTS public.exam_answers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id          UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    question_id         UUID NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
    selected_option_id  UUID REFERENCES public.exam_options(id) ON DELETE SET NULL,
    is_correct          BOOLEAN DEFAULT FALSE,
    points_earned       NUMERIC(10,2) DEFAULT 0,
    answered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(attempt_id, question_id)
);

-- 7. Exam Violations
CREATE TABLE IF NOT EXISTS public.exam_violations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id      UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    violation_type  TEXT NOT NULL, -- 'tab_switch', 'blur', 'minimize'
    violation_data  JSONB,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exams_institute ON public.exams(institute_id);
CREATE INDEX IF NOT EXISTS idx_exams_status    ON public.exams(status);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON public.exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_options_question ON public.exam_options(question_id);
CREATE INDEX IF NOT EXISTS idx_exam_assignments_student ON public.exam_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam ON public.exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_student ON public.exam_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_answers_attempt ON public.exam_answers(attempt_id);

-- ── 4. RLS Policies ─────────────────────────────────────────────────────────
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_violations ENABLE ROW LEVEL SECURITY;

-- Exams Policies
CREATE POLICY "admin_manage_exams" ON public.exams FOR ALL
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff'));

CREATE POLICY "student_read_assigned_exams" ON public.exams FOR SELECT
    USING (
        id IN (
            SELECT exam_id FROM public.exam_assignments ea
            JOIN public.students s ON s.id = ea.student_id
            WHERE s.user_id = auth.uid()
        )
    );

-- Questions & Options Policies
CREATE POLICY "admin_manage_exam_content" ON public.exam_questions FOR ALL
    USING (exam_id IN (SELECT id FROM public.exams WHERE institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff')));

CREATE POLICY "student_read_exam_content" ON public.exam_questions FOR SELECT
    USING (exam_id IN (SELECT exam_id FROM public.exam_assignments ea JOIN public.students s ON s.id = ea.student_id WHERE s.user_id = auth.uid()));

CREATE POLICY "admin_manage_exam_options" ON public.exam_options FOR ALL
    USING (question_id IN (SELECT id FROM public.exam_questions WHERE exam_id IN (SELECT id FROM public.exams WHERE institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff'))));

CREATE POLICY "student_read_exam_options" ON public.exam_options FOR SELECT
    USING (question_id IN (SELECT id FROM public.exam_questions WHERE exam_id IN (SELECT exam_id FROM public.exam_assignments ea JOIN public.students s ON s.id = ea.student_id WHERE s.user_id = auth.uid())));

-- Assignments Policies
CREATE POLICY "admin_manage_exam_assignments" ON public.exam_assignments FOR ALL
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff'));

CREATE POLICY "student_read_own_exam_assignments" ON public.exam_assignments FOR SELECT
    USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

-- Attempts Policies
CREATE POLICY "admin_read_all_attempts" ON public.exam_attempts FOR SELECT
    USING (institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff'));

CREATE POLICY "student_manage_own_attempts" ON public.exam_attempts FOR ALL
    USING (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()))
    WITH CHECK (student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid()));

-- Answers Policies
CREATE POLICY "admin_read_all_answers" ON public.exam_answers FOR SELECT
    USING (attempt_id IN (SELECT id FROM public.exam_attempts WHERE institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff')));

CREATE POLICY "student_manage_own_answers" ON public.exam_answers FOR ALL
    USING (attempt_id IN (SELECT id FROM public.exam_attempts WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())))
    WITH CHECK (attempt_id IN (SELECT id FROM public.exam_attempts WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())));

-- Violations Policies
CREATE POLICY "admin_read_all_violations" ON public.exam_violations FOR SELECT
    USING (attempt_id IN (SELECT id FROM public.exam_attempts WHERE institute_id = public.get_my_institute_id() AND public.get_my_role() IN ('admin', 'staff')));

CREATE POLICY "student_create_own_violations" ON public.exam_violations FOR INSERT
    WITH CHECK (attempt_id IN (SELECT id FROM public.exam_attempts WHERE student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())));

-- ── 5. Triggers ─────────────────────────────────────────────────────────────
CREATE TRIGGER exams_set_updated_at
  BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 6. Functions & RPCs ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_violation_count(attempt_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.exam_attempts
    SET violation_count = violation_count + 1
    WHERE id = attempt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
