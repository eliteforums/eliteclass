-- ============================================================
-- EduOS Migration 011 — Full LMS (Course Management & Learning System)
-- ============================================================
--
-- WHAT THIS MIGRATION DOES:
--
--  1.  lms_categories           — course subject categories
--  2.  lms_courses              — rich LMS course metadata
--  3.  lms_course_tags          — many-to-many tag associations
--  4.  lms_modules              — ordered course sections
--  5.  lms_lessons              — individual lessons (video/pdf/text/quiz/assignment)
--  6.  lms_lesson_materials     — supplementary materials per lesson
--  7.  lms_enrollments          — student ↔ course enrollment tracking
--  8.  lms_lesson_progress      — per-lesson completion tracking
--  9.  lms_course_progress      — aggregated progress (maintained by trigger)
-- 10.  lms_quizzes              — quiz definitions linked to lessons or courses
-- 11.  lms_quiz_questions       — MCQ / true-false / short-answer questions
-- 12.  lms_quiz_choices         — selectable answers for MCQ questions
-- 13.  lms_quiz_attempts        — student quiz attempt records
-- 14.  lms_quiz_attempt_answers — per-question answers within an attempt
-- 15.  lms_assignments          — teacher-issued assignments
-- 16.  lms_assignment_submissions — student file / text submissions
-- 17.  lms_certificates         — course-completion certificates (future-ready)
--
--  Includes: indexes, RLS policies, storage bucket declarations,
--            progress-aggregation trigger, updated_at triggers.
--
-- IDEMPOTENCY: uses IF NOT EXISTS / OR REPLACE / DROP … IF EXISTS
-- DEPENDENCIES: Migrations 001–010 (institutes, users, students, batches,
--               update_updated_at_column trigger function)
-- ============================================================

-- ============================================================
-- SECTION 0 — Schema permissions (Supabase public schema guard)
-- ============================================================

GRANT USAGE, CREATE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================
-- SECTION 1 — Enums
-- ============================================================

DO $$ BEGIN
  CREATE TYPE lms_difficulty     AS ENUM ('beginner','intermediate','advanced','expert');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_visibility     AS ENUM ('public','institutional','private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_pricing        AS ENUM ('free','paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_course_status  AS ENUM ('draft','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_lesson_type    AS ENUM ('video','pdf','text','quiz','assignment','live');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_enroll_status  AS ENUM ('active','completed','dropped','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_quiz_qtype     AS ENUM ('mcq','true_false','short_answer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_attempt_status AS ENUM ('in_progress','submitted','graded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lms_sub_status     AS ENUM ('submitted','graded','returned','late');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SECTION 2 — lms_categories
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id  UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  slug          TEXT        NOT NULL,
  description   TEXT,
  color         TEXT        DEFAULT '#6366f1',   -- hex brand colour
  icon          TEXT        DEFAULT 'BookOpen',   -- lucide icon name
  position      INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institute_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lms_categories_institute ON public.lms_categories(institute_id);

-- ============================================================
-- SECTION 3 — lms_courses
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_courses (
  id                        UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id              UUID              NOT NULL REFERENCES public.institutes(id)  ON DELETE CASCADE,
  created_by                UUID              NOT NULL REFERENCES public.users(id),
  category_id               UUID              REFERENCES public.lms_categories(id)      ON DELETE SET NULL,

  -- Core metadata
  title                     TEXT              NOT NULL,
  subtitle                  TEXT,
  description               TEXT,
  slug                      TEXT              NOT NULL,

  -- Media
  thumbnail_url             TEXT,
  thumbnail_storage_path    TEXT,
  intro_video_url           TEXT,
  intro_video_storage_path  TEXT,

  -- Classification
  difficulty                lms_difficulty    NOT NULL DEFAULT 'beginner',
  language                  TEXT              NOT NULL DEFAULT 'English',
  tags                      TEXT[]            NOT NULL DEFAULT '{}',
  estimated_duration_mins   INTEGER           DEFAULT 0,

  -- Access control
  visibility                lms_visibility    NOT NULL DEFAULT 'institutional',
  pricing                   lms_pricing       NOT NULL DEFAULT 'free',
  price                     NUMERIC(10,2)     DEFAULT 0,

  -- Content structure (denormalised counters — kept in sync by triggers)
  total_modules             INTEGER           NOT NULL DEFAULT 0,
  total_lessons             INTEGER           NOT NULL DEFAULT 0,
  total_enrollments         INTEGER           NOT NULL DEFAULT 0,
  total_completions         INTEGER           NOT NULL DEFAULT 0,

  -- Publication
  status                    lms_course_status NOT NULL DEFAULT 'draft',
  is_featured               BOOLEAN           NOT NULL DEFAULT FALSE,
  published_at              TIMESTAMPTZ,

  -- Rich content
  prerequisites             TEXT[]            DEFAULT '{}',
  learning_outcomes         TEXT[]            DEFAULT '{}',

  -- Timestamps
  created_at                TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  UNIQUE (institute_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lms_courses_institute    ON public.lms_courses(institute_id);
CREATE INDEX IF NOT EXISTS idx_lms_courses_created_by  ON public.lms_courses(created_by);
CREATE INDEX IF NOT EXISTS idx_lms_courses_category    ON public.lms_courses(category_id);
CREATE INDEX IF NOT EXISTS idx_lms_courses_status      ON public.lms_courses(status);
CREATE INDEX IF NOT EXISTS idx_lms_courses_tags        ON public.lms_courses USING gin(tags);

-- ============================================================
-- SECTION 4 — lms_course_tags  (standalone tag registry)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_course_tag_registry (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID        NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  slug         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institute_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lms_tag_registry_institute ON public.lms_course_tag_registry(institute_id);

-- ============================================================
-- SECTION 5 — lms_modules (Course Sections)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_modules (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID        NOT NULL REFERENCES public.lms_courses(id)  ON DELETE CASCADE,
  institute_id UUID       NOT NULL REFERENCES public.institutes(id)   ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  position    INTEGER     NOT NULL DEFAULT 0,   -- 0-based display order
  is_published BOOLEAN    NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_modules_course    ON public.lms_modules(course_id);
CREATE INDEX IF NOT EXISTS idx_lms_modules_institute ON public.lms_modules(institute_id);

-- ============================================================
-- SECTION 6 — lms_lessons
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_lessons (
  id                    UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id             UUID             NOT NULL REFERENCES public.lms_modules(id)   ON DELETE CASCADE,
  course_id             UUID             NOT NULL REFERENCES public.lms_courses(id)   ON DELETE CASCADE,
  institute_id          UUID             NOT NULL REFERENCES public.institutes(id)    ON DELETE CASCADE,

  title                 TEXT             NOT NULL,
  description           TEXT,
  lesson_type           lms_lesson_type  NOT NULL DEFAULT 'video',
  position              INTEGER          NOT NULL DEFAULT 0,

  -- Access
  is_preview            BOOLEAN          NOT NULL DEFAULT FALSE,   -- free preview for non-enrolled
  is_published          BOOLEAN          NOT NULL DEFAULT FALSE,

  -- Video
  video_url             TEXT,                        -- external URL (YouTube, Vimeo)
  video_storage_path    TEXT,                        -- Supabase Storage path
  video_duration_secs   INTEGER          DEFAULT 0,

  -- Rich text content (for 'text' lesson type)
  content               TEXT,

  -- Timestamps
  created_at            TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_lessons_module    ON public.lms_lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_lms_lessons_course    ON public.lms_lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lms_lessons_institute ON public.lms_lessons(institute_id);
CREATE INDEX IF NOT EXISTS idx_lms_lessons_type      ON public.lms_lessons(lesson_type);

-- ============================================================
-- SECTION 7 — lms_lesson_materials (supplementary files)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_lesson_materials (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id        UUID        NOT NULL REFERENCES public.lms_lessons(id)  ON DELETE CASCADE,
  course_id        UUID        NOT NULL REFERENCES public.lms_courses(id)  ON DELETE CASCADE,
  institute_id     UUID        NOT NULL REFERENCES public.institutes(id)   ON DELETE CASCADE,
  uploaded_by      UUID        NOT NULL REFERENCES public.users(id),

  title            TEXT        NOT NULL,
  file_url         TEXT        NOT NULL,   -- signed-URL base path
  storage_path     TEXT        NOT NULL,
  file_type        TEXT        NOT NULL,   -- 'pdf','docx','pptx','image','zip','other'
  file_size_bytes  BIGINT      DEFAULT 0,
  is_downloadable  BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_materials_lesson    ON public.lms_lesson_materials(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lms_materials_course    ON public.lms_lesson_materials(course_id);
CREATE INDEX IF NOT EXISTS idx_lms_materials_institute ON public.lms_lesson_materials(institute_id);

-- ============================================================
-- SECTION 8 — lms_enrollments
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_enrollments (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID             NOT NULL REFERENCES public.lms_courses(id)  ON DELETE CASCADE,
  student_id      UUID             NOT NULL REFERENCES public.users(id)        ON DELETE CASCADE,
  institute_id    UUID             NOT NULL REFERENCES public.institutes(id)   ON DELETE CASCADE,
  enrolled_by     UUID             REFERENCES public.users(id),    -- admin/teacher who enrolled
  batch_id        UUID             REFERENCES public.batches(id),  -- bulk batch enrollment

  status          lms_enroll_status NOT NULL DEFAULT 'active',
  enrolled_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  dropped_at      TIMESTAMPTZ,

  -- Expiry (for time-limited access)
  expires_at      TIMESTAMPTZ,

  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  UNIQUE (course_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_lms_enrollments_course    ON public.lms_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_lms_enrollments_student   ON public.lms_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_enrollments_institute ON public.lms_enrollments(institute_id);
CREATE INDEX IF NOT EXISTS idx_lms_enrollments_batch     ON public.lms_enrollments(batch_id);
CREATE INDEX IF NOT EXISTS idx_lms_enrollments_status    ON public.lms_enrollments(status);

-- ============================================================
-- SECTION 9 — lms_lesson_progress
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_lesson_progress (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id     UUID        NOT NULL REFERENCES public.lms_enrollments(id) ON DELETE CASCADE,
  lesson_id         UUID        NOT NULL REFERENCES public.lms_lessons(id)     ON DELETE CASCADE,
  student_id        UUID        NOT NULL REFERENCES public.users(id)           ON DELETE CASCADE,
  course_id         UUID        NOT NULL REFERENCES public.lms_courses(id)     ON DELETE CASCADE,
  institute_id      UUID        NOT NULL REFERENCES public.institutes(id)      ON DELETE CASCADE,

  is_completed      BOOLEAN     NOT NULL DEFAULT FALSE,
  watch_seconds     INTEGER     NOT NULL DEFAULT 0,    -- video progress in seconds
  last_position_secs INTEGER    NOT NULL DEFAULT 0,    -- resume-point for video
  last_accessed_at  TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (enrollment_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lms_lp_enrollment ON public.lms_lesson_progress(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_lms_lp_lesson     ON public.lms_lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lms_lp_student    ON public.lms_lesson_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_lp_course     ON public.lms_lesson_progress(course_id);

-- ============================================================
-- SECTION 10 — lms_course_progress  (aggregated — maintained by trigger)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_course_progress (
  enrollment_id         UUID    PRIMARY KEY REFERENCES public.lms_enrollments(id) ON DELETE CASCADE,
  student_id            UUID    NOT NULL REFERENCES public.users(id),
  course_id             UUID    NOT NULL REFERENCES public.lms_courses(id),
  institute_id          UUID    NOT NULL REFERENCES public.institutes(id),

  completed_lessons     INTEGER NOT NULL DEFAULT 0,
  total_lessons         INTEGER NOT NULL DEFAULT 0,
  completion_pct        NUMERIC(5,2) NOT NULL DEFAULT 0,   -- 0.00 – 100.00
  total_watch_seconds   INTEGER NOT NULL DEFAULT 0,
  last_lesson_id        UUID    REFERENCES public.lms_lessons(id),
  last_accessed_at      TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_cp_student  ON public.lms_course_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_cp_course   ON public.lms_course_progress(course_id);

-- ============================================================
-- SECTION 11 — lms_quizzes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_quizzes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         UUID        NOT NULL REFERENCES public.lms_courses(id)   ON DELETE CASCADE,
  lesson_id         UUID        REFERENCES public.lms_lessons(id)            ON DELETE SET NULL,
  institute_id      UUID        NOT NULL REFERENCES public.institutes(id)    ON DELETE CASCADE,
  created_by        UUID        NOT NULL REFERENCES public.users(id),

  title             TEXT        NOT NULL,
  description       TEXT,
  time_limit_mins   INTEGER,                 -- NULL = unlimited
  passing_score     INTEGER     NOT NULL DEFAULT 70,   -- 0-100 %
  max_attempts      INTEGER     NOT NULL DEFAULT 3,
  shuffle_questions BOOLEAN     NOT NULL DEFAULT FALSE,
  show_answers      BOOLEAN     NOT NULL DEFAULT TRUE,  -- show correct answers after submit
  is_published      BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_quizzes_course    ON public.lms_quizzes(course_id);
CREATE INDEX IF NOT EXISTS idx_lms_quizzes_lesson    ON public.lms_quizzes(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lms_quizzes_institute ON public.lms_quizzes(institute_id);

-- ============================================================
-- SECTION 12 — lms_quiz_questions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_quiz_questions (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id       UUID           NOT NULL REFERENCES public.lms_quizzes(id)  ON DELETE CASCADE,
  question      TEXT           NOT NULL,
  question_type lms_quiz_qtype NOT NULL DEFAULT 'mcq',
  points        NUMERIC(5,2)   NOT NULL DEFAULT 1,
  position      INTEGER        NOT NULL DEFAULT 0,
  explanation   TEXT,                           -- shown after answer submission
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_qq_quiz ON public.lms_quiz_questions(quiz_id);

-- ============================================================
-- SECTION 13 — lms_quiz_choices
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_quiz_choices (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID        NOT NULL REFERENCES public.lms_quiz_questions(id) ON DELETE CASCADE,
  choice_text  TEXT        NOT NULL,
  is_correct   BOOLEAN     NOT NULL DEFAULT FALSE,
  position     INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lms_qc_question ON public.lms_quiz_choices(question_id);

-- ============================================================
-- SECTION 14 — lms_quiz_attempts
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_quiz_attempts (
  id            UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id       UUID              NOT NULL REFERENCES public.lms_quizzes(id)      ON DELETE CASCADE,
  enrollment_id UUID              NOT NULL REFERENCES public.lms_enrollments(id)  ON DELETE CASCADE,
  student_id    UUID              NOT NULL REFERENCES public.users(id)            ON DELETE CASCADE,
  institute_id  UUID              NOT NULL REFERENCES public.institutes(id)       ON DELETE CASCADE,

  score         NUMERIC(8,2)      NOT NULL DEFAULT 0,
  max_score     NUMERIC(8,2)      NOT NULL DEFAULT 0,
  percentage    NUMERIC(5,2)      NOT NULL DEFAULT 0,
  passed        BOOLEAN           NOT NULL DEFAULT FALSE,
  attempt_no    INTEGER           NOT NULL DEFAULT 1,

  status        lms_attempt_status NOT NULL DEFAULT 'in_progress',
  started_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  submitted_at  TIMESTAMPTZ,

  created_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_qa_quiz      ON public.lms_quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_lms_qa_student   ON public.lms_quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_qa_enroll    ON public.lms_quiz_attempts(enrollment_id);

-- ============================================================
-- SECTION 15 — lms_quiz_attempt_answers
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_quiz_attempt_answers (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id        UUID         NOT NULL REFERENCES public.lms_quiz_attempts(id)   ON DELETE CASCADE,
  question_id       UUID         NOT NULL REFERENCES public.lms_quiz_questions(id)  ON DELETE CASCADE,
  selected_choice_id UUID        REFERENCES public.lms_quiz_choices(id)             ON DELETE SET NULL,
  text_answer       TEXT,
  is_correct        BOOLEAN      NOT NULL DEFAULT FALSE,
  points_earned     NUMERIC(5,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_lms_qaa_attempt  ON public.lms_quiz_attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_lms_qaa_question ON public.lms_quiz_attempt_answers(question_id);

-- ============================================================
-- SECTION 16 — lms_assignments
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_assignments (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id            UUID        NOT NULL REFERENCES public.lms_courses(id)   ON DELETE CASCADE,
  lesson_id            UUID        REFERENCES public.lms_lessons(id)            ON DELETE SET NULL,
  institute_id         UUID        NOT NULL REFERENCES public.institutes(id)    ON DELETE CASCADE,
  created_by           UUID        NOT NULL REFERENCES public.users(id),

  title                TEXT        NOT NULL,
  description          TEXT,
  instructions         TEXT,
  attachment_urls      TEXT[]      DEFAULT '{}',
  due_date             TIMESTAMPTZ,
  max_score            NUMERIC(8,2) DEFAULT 100,
  allow_late           BOOLEAN     NOT NULL DEFAULT FALSE,
  is_published         BOOLEAN     NOT NULL DEFAULT FALSE,
  accepted_file_types  TEXT[]      DEFAULT '{}',   -- ['pdf','docx','zip']

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_assign_course    ON public.lms_assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_lms_assign_lesson    ON public.lms_assignments(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lms_assign_institute ON public.lms_assignments(institute_id);

-- ============================================================
-- SECTION 17 — lms_assignment_submissions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_assignment_submissions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID          NOT NULL REFERENCES public.lms_assignments(id)   ON DELETE CASCADE,
  enrollment_id   UUID          NOT NULL REFERENCES public.lms_enrollments(id)   ON DELETE CASCADE,
  student_id      UUID          NOT NULL REFERENCES public.users(id)             ON DELETE CASCADE,
  institute_id    UUID          NOT NULL REFERENCES public.institutes(id)        ON DELETE CASCADE,

  file_urls       TEXT[]        DEFAULT '{}',
  storage_paths   TEXT[]        DEFAULT '{}',
  text_response   TEXT,

  status          lms_sub_status NOT NULL DEFAULT 'submitted',
  submitted_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  is_late         BOOLEAN        NOT NULL DEFAULT FALSE,

  grade           NUMERIC(8,2),
  feedback        TEXT,
  graded_by       UUID           REFERENCES public.users(id),
  graded_at       TIMESTAMPTZ,

  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_lms_sub_assignment ON public.lms_assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_lms_sub_student    ON public.lms_assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_sub_enrollment ON public.lms_assignment_submissions(enrollment_id);

-- ============================================================
-- SECTION 18 — lms_certificates
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lms_certificates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id    UUID        NOT NULL REFERENCES public.lms_enrollments(id)  ON DELETE CASCADE,
  student_id       UUID        NOT NULL REFERENCES public.users(id),
  course_id        UUID        NOT NULL REFERENCES public.lms_courses(id),
  institute_id     UUID        NOT NULL REFERENCES public.institutes(id),

  certificate_no   TEXT        NOT NULL,  -- human-readable cert number
  certificate_url  TEXT,                  -- Supabase Storage path for PDF
  certificate_data JSONB       DEFAULT '{}',

  issued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ,

  UNIQUE (enrollment_id),
  UNIQUE (certificate_no)
);

CREATE INDEX IF NOT EXISTS idx_lms_cert_student ON public.lms_certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_lms_cert_course  ON public.lms_certificates(course_id);

-- ============================================================
-- SECTION 19 — updated_at triggers
-- (reuses update_updated_at_column() from migration 002)
-- ============================================================
DROP TRIGGER IF EXISTS trg_lms_categories_updated_at ON public.lms_categories;
CREATE TRIGGER trg_lms_categories_updated_at
  BEFORE UPDATE ON public.lms_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_courses_updated_at ON public.lms_courses;
CREATE TRIGGER trg_lms_courses_updated_at
  BEFORE UPDATE ON public.lms_courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_modules_updated_at ON public.lms_modules;
CREATE TRIGGER trg_lms_modules_updated_at
  BEFORE UPDATE ON public.lms_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_lessons_updated_at ON public.lms_lessons;
CREATE TRIGGER trg_lms_lessons_updated_at
  BEFORE UPDATE ON public.lms_lessons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_enrollments_updated_at ON public.lms_enrollments;
CREATE TRIGGER trg_lms_enrollments_updated_at
  BEFORE UPDATE ON public.lms_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_lp_updated_at ON public.lms_lesson_progress;
CREATE TRIGGER trg_lms_lp_updated_at
  BEFORE UPDATE ON public.lms_lesson_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_quizzes_updated_at ON public.lms_quizzes;
CREATE TRIGGER trg_lms_quizzes_updated_at
  BEFORE UPDATE ON public.lms_quizzes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_assignments_updated_at ON public.lms_assignments;
CREATE TRIGGER trg_lms_assignments_updated_at
  BEFORE UPDATE ON public.lms_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lms_sub_updated_at ON public.lms_assignment_submissions;
CREATE TRIGGER trg_lms_sub_updated_at
  BEFORE UPDATE ON public.lms_assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SECTION 20 — Denormalised counter triggers
-- ============================================================

-- ── Keep lms_courses.total_lessons in sync ───────────────────────────────────
CREATE OR REPLACE FUNCTION lms_sync_lesson_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.lms_courses
  SET
    total_lessons = (
      SELECT COUNT(*) FROM public.lms_lessons
      WHERE course_id = COALESCE(NEW.course_id, OLD.course_id)
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.course_id, OLD.course_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_lms_sync_lesson_count ON public.lms_lessons;
CREATE TRIGGER trg_lms_sync_lesson_count
  AFTER INSERT OR UPDATE OR DELETE ON public.lms_lessons
  FOR EACH ROW EXECUTE FUNCTION lms_sync_lesson_count();

-- ── Keep lms_courses.total_modules in sync ───────────────────────────────────
CREATE OR REPLACE FUNCTION lms_sync_module_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.lms_courses
  SET
    total_modules = (
      SELECT COUNT(*) FROM public.lms_modules
      WHERE course_id = COALESCE(NEW.course_id, OLD.course_id)
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.course_id, OLD.course_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_lms_sync_module_count ON public.lms_modules;
CREATE TRIGGER trg_lms_sync_module_count
  AFTER INSERT OR UPDATE OR DELETE ON public.lms_modules
  FOR EACH ROW EXECUTE FUNCTION lms_sync_module_count();

-- ── Keep lms_courses.total_enrollments in sync ───────────────────────────────
CREATE OR REPLACE FUNCTION lms_sync_enrollment_count()
RETURNS TRIGGER AS $$
DECLARE
  v_course_id UUID;
BEGIN
  v_course_id := COALESCE(NEW.course_id, OLD.course_id);
  UPDATE public.lms_courses
  SET
    total_enrollments = (
      SELECT COUNT(*) FROM public.lms_enrollments
      WHERE course_id = v_course_id AND status = 'active'
    ),
    total_completions = (
      SELECT COUNT(*) FROM public.lms_enrollments
      WHERE course_id = v_course_id AND status = 'completed'
    ),
    updated_at = NOW()
  WHERE id = v_course_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_lms_sync_enrollment_count ON public.lms_enrollments;
CREATE TRIGGER trg_lms_sync_enrollment_count
  AFTER INSERT OR UPDATE OR DELETE ON public.lms_enrollments
  FOR EACH ROW EXECUTE FUNCTION lms_sync_enrollment_count();

-- ── Upsert lms_course_progress when lesson progress changes ──────────────────
CREATE OR REPLACE FUNCTION lms_update_course_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_total    INTEGER;
  v_done     INTEGER;
  v_watch    INTEGER;
  v_pct      NUMERIC(5,2);
  v_enroll   RECORD;
BEGIN
  SELECT * INTO v_enroll
  FROM public.lms_enrollments
  WHERE id = COALESCE(NEW.enrollment_id, OLD.enrollment_id);

  SELECT COUNT(*)          INTO v_total
  FROM public.lms_lessons
  WHERE course_id = v_enroll.course_id AND is_published = TRUE;

  SELECT COUNT(*), COALESCE(SUM(watch_seconds),0)
  INTO v_done, v_watch
  FROM public.lms_lesson_progress
  WHERE enrollment_id = v_enroll.id AND is_completed = TRUE;

  v_pct := CASE WHEN v_total > 0 THEN ROUND((v_done::NUMERIC / v_total) * 100, 2) ELSE 0 END;

  INSERT INTO public.lms_course_progress
    (enrollment_id, student_id, course_id, institute_id,
     completed_lessons, total_lessons, completion_pct,
     total_watch_seconds, last_lesson_id, last_accessed_at, updated_at)
  VALUES
    (v_enroll.id, v_enroll.student_id, v_enroll.course_id, v_enroll.institute_id,
     v_done, v_total, v_pct,
     v_watch,
     COALESCE(NEW.lesson_id, OLD.lesson_id),
     NOW(), NOW())
  ON CONFLICT (enrollment_id) DO UPDATE
    SET completed_lessons   = EXCLUDED.completed_lessons,
        total_lessons       = EXCLUDED.total_lessons,
        completion_pct      = EXCLUDED.completion_pct,
        total_watch_seconds = EXCLUDED.total_watch_seconds,
        last_lesson_id      = EXCLUDED.last_lesson_id,
        last_accessed_at    = EXCLUDED.last_accessed_at,
        updated_at          = NOW();

  -- Auto-complete enrollment when 100 %
  IF v_pct >= 100 THEN
    UPDATE public.lms_enrollments
    SET status = 'completed', completed_at = NOW()
    WHERE id = v_enroll.id AND status = 'active';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_lms_update_course_progress ON public.lms_lesson_progress;
CREATE TRIGGER trg_lms_update_course_progress
  AFTER INSERT OR UPDATE ON public.lms_lesson_progress
  FOR EACH ROW EXECUTE FUNCTION lms_update_course_progress();

-- ============================================================
-- SECTION 21 — Row Level Security
-- ============================================================

ALTER TABLE public.lms_categories             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_courses                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_course_tag_registry    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_modules                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_lessons                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_lesson_materials       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_enrollments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_lesson_progress        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_course_progress        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_quizzes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_quiz_questions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_quiz_choices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_quiz_attempts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_quiz_attempt_answers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_assignments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_certificates           ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: is current user admin or staff of the same institute?
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lms_is_instructor()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role IN ('admin','staff')
    AND institute_id = get_my_institute_id()
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: is current user the creator/owner of a course? (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION lms_is_course_owner(p_course_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lms_courses WHERE id = p_course_id AND created_by = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_categories
-- ─────────────────────────────────────────────────────────────────────────────
-- Make policies idempotent: drop existing policies before creating
DROP POLICY IF EXISTS "lms_cat_super_admin" ON public.lms_categories;
DROP POLICY IF EXISTS "lms_cat_admin_manage" ON public.lms_categories;
DROP POLICY IF EXISTS "lms_cat_student_read" ON public.lms_categories;

DROP POLICY IF EXISTS "lms_course_super_admin" ON public.lms_courses;
DROP POLICY IF EXISTS "lms_course_admin_manage" ON public.lms_courses;
DROP POLICY IF EXISTS "lms_course_staff_own" ON public.lms_courses;
DROP POLICY IF EXISTS "lms_course_staff_read" ON public.lms_courses;
DROP POLICY IF EXISTS "lms_course_student_enrolled" ON public.lms_courses;

DROP POLICY IF EXISTS "lms_mod_super_admin" ON public.lms_modules;
DROP POLICY IF EXISTS "lms_mod_admin" ON public.lms_modules;
DROP POLICY IF EXISTS "lms_mod_staff_own" ON public.lms_modules;
DROP POLICY IF EXISTS "lms_mod_student_enrolled" ON public.lms_modules;

DROP POLICY IF EXISTS "lms_lesson_super_admin" ON public.lms_lessons;
DROP POLICY IF EXISTS "lms_lesson_admin" ON public.lms_lessons;
DROP POLICY IF EXISTS "lms_lesson_staff_own" ON public.lms_lessons;
DROP POLICY IF EXISTS "lms_lesson_student" ON public.lms_lessons;

DROP POLICY IF EXISTS "lms_mat_super_admin" ON public.lms_lesson_materials;
DROP POLICY IF EXISTS "lms_mat_admin" ON public.lms_lesson_materials;
DROP POLICY IF EXISTS "lms_mat_staff_own" ON public.lms_lesson_materials;
DROP POLICY IF EXISTS "lms_mat_student_enrolled" ON public.lms_lesson_materials;

DROP POLICY IF EXISTS "lms_enroll_super_admin" ON public.lms_enrollments;
DROP POLICY IF EXISTS "lms_enroll_admin" ON public.lms_enrollments;
DROP POLICY IF EXISTS "lms_enroll_staff_read" ON public.lms_enrollments;
DROP POLICY IF EXISTS "lms_enroll_student_own" ON public.lms_enrollments;

DROP POLICY IF EXISTS "lms_lp_super_admin" ON public.lms_lesson_progress;
DROP POLICY IF EXISTS "lms_lp_admin_read" ON public.lms_lesson_progress;
DROP POLICY IF EXISTS "lms_lp_staff_read" ON public.lms_lesson_progress;
DROP POLICY IF EXISTS "lms_lp_student_own" ON public.lms_lesson_progress;

DROP POLICY IF EXISTS "lms_cp_super_admin" ON public.lms_course_progress;
DROP POLICY IF EXISTS "lms_cp_admin_read" ON public.lms_course_progress;
DROP POLICY IF EXISTS "lms_cp_staff_read" ON public.lms_course_progress;
DROP POLICY IF EXISTS "lms_cp_student_own" ON public.lms_course_progress;

DROP POLICY IF EXISTS "lms_quiz_admin" ON public.lms_quizzes;
DROP POLICY IF EXISTS "lms_quiz_staff_own" ON public.lms_quizzes;
DROP POLICY IF EXISTS "lms_quiz_student_enrolled" ON public.lms_quizzes;

DROP POLICY IF EXISTS "lms_qq_read" ON public.lms_quiz_questions;
DROP POLICY IF EXISTS "lms_qq_manage" ON public.lms_quiz_questions;

DROP POLICY IF EXISTS "lms_qc_read" ON public.lms_quiz_choices;
DROP POLICY IF EXISTS "lms_qc_manage" ON public.lms_quiz_choices;

DROP POLICY IF EXISTS "lms_qa_admin_read" ON public.lms_quiz_attempts;
DROP POLICY IF EXISTS "lms_qa_staff_read" ON public.lms_quiz_attempts;
DROP POLICY IF EXISTS "lms_qa_student_own" ON public.lms_quiz_attempts;

DROP POLICY IF EXISTS "lms_qaa_student_own" ON public.lms_quiz_attempt_answers;
DROP POLICY IF EXISTS "lms_qaa_instructor_read" ON public.lms_quiz_attempt_answers;

DROP POLICY IF EXISTS "lms_assign_admin" ON public.lms_assignments;
DROP POLICY IF EXISTS "lms_assign_staff_own" ON public.lms_assignments;
DROP POLICY IF EXISTS "lms_assign_student_enrolled" ON public.lms_assignments;

DROP POLICY IF EXISTS "lms_sub_admin_read" ON public.lms_assignment_submissions;
DROP POLICY IF EXISTS "lms_sub_staff_grade" ON public.lms_assignment_submissions;
DROP POLICY IF EXISTS "lms_sub_student_own" ON public.lms_assignment_submissions;

DROP POLICY IF EXISTS "lms_cert_admin" ON public.lms_certificates;
DROP POLICY IF EXISTS "lms_cert_student_own" ON public.lms_certificates;

-- Storage object policies
DROP POLICY IF EXISTS "lms_video_upload" ON storage.objects;
DROP POLICY IF EXISTS "lms_video_read" ON storage.objects;
DROP POLICY IF EXISTS "lms_video_delete" ON storage.objects;
DROP POLICY IF EXISTS "lms_mat_upload" ON storage.objects;
DROP POLICY IF EXISTS "lms_mat_read" ON storage.objects;
DROP POLICY IF EXISTS "lms_mat_delete" ON storage.objects;
DROP POLICY IF EXISTS "lms_thumb_upload" ON storage.objects;
DROP POLICY IF EXISTS "lms_asub_upload" ON storage.objects;
DROP POLICY IF EXISTS "lms_asub_read" ON storage.objects;
CREATE POLICY "lms_cat_super_admin" ON public.lms_categories
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_cat_admin_manage" ON public.lms_categories
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() IN ('admin','staff'))
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() IN ('admin','staff'));

CREATE POLICY "lms_cat_student_read" ON public.lms_categories
  FOR SELECT USING (institute_id = get_my_institute_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_courses — instructors manage, students read published+enrolled
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_course_super_admin" ON public.lms_courses
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_course_admin_manage" ON public.lms_courses
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

-- Staff can create & edit their own courses
CREATE POLICY "lms_course_staff_own" ON public.lms_courses
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  );

-- Staff can read all courses in their institute (for course listing)
CREATE POLICY "lms_course_staff_read" ON public.lms_courses
  FOR SELECT
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'staff');

-- Students can only read published courses they are enrolled in
CREATE POLICY "lms_course_student_enrolled" ON public.lms_courses
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND status = 'published'
    AND (
      visibility = 'institutional'
      OR id IN (
        SELECT course_id FROM public.lms_enrollments
        WHERE student_id = auth.uid() AND status IN ('active','completed')
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_modules — mirror course permissions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_mod_super_admin" ON public.lms_modules
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_mod_admin" ON public.lms_modules
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_mod_staff_own" ON public.lms_modules
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_owner(course_id)
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_owner(course_id)
  );

CREATE POLICY "lms_mod_student_enrolled" ON public.lms_modules
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND course_id IN (
      SELECT course_id FROM public.lms_enrollments
      WHERE student_id = auth.uid() AND status IN ('active','completed')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_lessons
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_lesson_super_admin" ON public.lms_lessons
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_lesson_admin" ON public.lms_lessons
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_lesson_staff_own" ON public.lms_lessons
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_owner(course_id)
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_owner(course_id)
  );

-- Students: see published lessons if enrolled, or is_preview = TRUE
CREATE POLICY "lms_lesson_student" ON public.lms_lessons
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND is_published = TRUE
    AND (
      is_preview = TRUE
      OR course_id IN (
        SELECT course_id FROM public.lms_enrollments
        WHERE student_id = auth.uid() AND status IN ('active','completed')
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_lesson_materials
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_mat_super_admin" ON public.lms_lesson_materials
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_mat_admin" ON public.lms_lesson_materials
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_mat_staff_own" ON public.lms_lesson_materials
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND uploaded_by = auth.uid()
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "lms_mat_student_enrolled" ON public.lms_lesson_materials
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND course_id IN (
      SELECT course_id FROM public.lms_enrollments
      WHERE student_id = auth.uid() AND status IN ('active','completed')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_enrollments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_enroll_super_admin" ON public.lms_enrollments
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_enroll_admin" ON public.lms_enrollments
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_enroll_staff_read" ON public.lms_enrollments
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_owner(course_id)
  );

CREATE POLICY "lms_enroll_student_own" ON public.lms_enrollments
  FOR SELECT
  USING (student_id = auth.uid() AND get_my_role() = 'student');

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_lesson_progress & lms_course_progress
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_lp_super_admin" ON public.lms_lesson_progress
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_lp_admin_read" ON public.lms_lesson_progress
  FOR SELECT USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_lp_staff_read" ON public.lms_lesson_progress
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_owner(course_id)
  );

CREATE POLICY "lms_lp_student_own" ON public.lms_lesson_progress
  FOR ALL
  USING (student_id = auth.uid() AND get_my_role() = 'student')
  WITH CHECK (student_id = auth.uid() AND get_my_role() = 'student');

CREATE POLICY "lms_cp_super_admin" ON public.lms_course_progress
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "lms_cp_admin_read" ON public.lms_course_progress
  FOR SELECT USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_cp_staff_read" ON public.lms_course_progress
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND lms_is_course_owner(course_id)
  );

CREATE POLICY "lms_cp_student_own" ON public.lms_course_progress
  FOR ALL
  USING (student_id = auth.uid() AND get_my_role() = 'student')
  WITH CHECK (student_id = auth.uid() AND get_my_role() = 'student');

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_quizzes, lms_quiz_questions, lms_quiz_choices
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_quiz_admin" ON public.lms_quizzes
  FOR ALL USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_quiz_staff_own" ON public.lms_quizzes
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  );

CREATE POLICY "lms_quiz_student_enrolled" ON public.lms_quizzes
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND is_published = TRUE
    AND course_id IN (
      SELECT course_id FROM public.lms_enrollments
      WHERE student_id = auth.uid() AND status IN ('active','completed')
    )
  );

-- Questions & choices: follow quiz permissions (simplified — join-based)
CREATE POLICY "lms_qq_read" ON public.lms_quiz_questions
  FOR SELECT USING (
    quiz_id IN (
      SELECT id FROM public.lms_quizzes
      WHERE institute_id = get_my_institute_id()
    )
  );

CREATE POLICY "lms_qq_manage" ON public.lms_quiz_questions
  FOR ALL
  USING (
    quiz_id IN (
      SELECT id FROM public.lms_quizzes
      WHERE institute_id = get_my_institute_id()
      AND (get_my_role() = 'admin' OR created_by = auth.uid())
    )
  )
  WITH CHECK (
    quiz_id IN (
      SELECT id FROM public.lms_quizzes
      WHERE institute_id = get_my_institute_id()
      AND (get_my_role() = 'admin' OR created_by = auth.uid())
    )
  );

CREATE POLICY "lms_qc_read" ON public.lms_quiz_choices
  FOR SELECT USING (
    question_id IN (
      SELECT q.id FROM public.lms_quiz_questions q
      JOIN public.lms_quizzes qz ON qz.id = q.quiz_id
      WHERE qz.institute_id = get_my_institute_id()
    )
  );

CREATE POLICY "lms_qc_manage" ON public.lms_quiz_choices
  FOR ALL
  USING (
    question_id IN (
      SELECT q.id FROM public.lms_quiz_questions q
      JOIN public.lms_quizzes qz ON qz.id = q.quiz_id
      WHERE qz.institute_id = get_my_institute_id()
      AND (get_my_role() = 'admin' OR qz.created_by = auth.uid())
    )
  )
  WITH CHECK (
    question_id IN (
      SELECT q.id FROM public.lms_quiz_questions q
      JOIN public.lms_quizzes qz ON qz.id = q.quiz_id
      WHERE qz.institute_id = get_my_institute_id()
      AND (get_my_role() = 'admin' OR qz.created_by = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_quiz_attempts & lms_quiz_attempt_answers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_qa_admin_read" ON public.lms_quiz_attempts
  FOR SELECT USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_qa_staff_read" ON public.lms_quiz_attempts
  FOR SELECT
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND quiz_id IN (
      SELECT id FROM public.lms_quizzes WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "lms_qa_student_own" ON public.lms_quiz_attempts
  FOR ALL
  USING (student_id = auth.uid() AND get_my_role() = 'student')
  WITH CHECK (student_id = auth.uid() AND get_my_role() = 'student');

CREATE POLICY "lms_qaa_student_own" ON public.lms_quiz_attempt_answers
  FOR ALL
  USING (
    attempt_id IN (
      SELECT id FROM public.lms_quiz_attempts WHERE student_id = auth.uid()
    )
  )
  WITH CHECK (
    attempt_id IN (
      SELECT id FROM public.lms_quiz_attempts WHERE student_id = auth.uid()
    )
  );

CREATE POLICY "lms_qaa_instructor_read" ON public.lms_quiz_attempt_answers
  FOR SELECT
  USING (
    attempt_id IN (
      SELECT a.id FROM public.lms_quiz_attempts a
      JOIN public.lms_quizzes q ON q.id = a.quiz_id
      WHERE q.institute_id = get_my_institute_id()
      AND (get_my_role() = 'admin' OR q.created_by = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_assignments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_assign_admin" ON public.lms_assignments
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_assign_staff_own" ON public.lms_assignments
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND created_by = auth.uid()
  );

CREATE POLICY "lms_assign_student_enrolled" ON public.lms_assignments
  FOR SELECT
  USING (
    get_my_role() = 'student'
    AND institute_id = get_my_institute_id()
    AND is_published = TRUE
    AND course_id IN (
      SELECT course_id FROM public.lms_enrollments
      WHERE student_id = auth.uid() AND status IN ('active','completed')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_assignment_submissions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_sub_admin_read" ON public.lms_assignment_submissions
  FOR SELECT USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_sub_staff_grade" ON public.lms_assignment_submissions
  FOR ALL
  USING (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND assignment_id IN (
      SELECT id FROM public.lms_assignments WHERE created_by = auth.uid()
    )
  )
  WITH CHECK (
    institute_id = get_my_institute_id()
    AND get_my_role() = 'staff'
    AND assignment_id IN (
      SELECT id FROM public.lms_assignments WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "lms_sub_student_own" ON public.lms_assignment_submissions
  FOR ALL
  USING (student_id = auth.uid() AND get_my_role() = 'student')
  WITH CHECK (student_id = auth.uid() AND get_my_role() = 'student');

-- ─────────────────────────────────────────────────────────────────────────────
-- lms_certificates
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "lms_cert_admin" ON public.lms_certificates
  FOR ALL
  USING (institute_id = get_my_institute_id() AND get_my_role() = 'admin')
  WITH CHECK (institute_id = get_my_institute_id() AND get_my_role() = 'admin');

CREATE POLICY "lms_cert_student_own" ON public.lms_certificates
  FOR SELECT USING (student_id = auth.uid());

-- ============================================================
-- SECTION 22 — Storage Bucket Declarations
-- (Run via Supabase Dashboard / CLI — buckets are not DDL)
-- These INSERT statements create the buckets if they do not exist.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('lms-course-videos',
   'lms-course-videos',
   FALSE,
   5368709120,   -- 5 GB per file
   ARRAY['video/mp4','video/webm','video/ogg','video/quicktime']),

  ('lms-course-materials',
   'lms-course-materials',
   FALSE,
   104857600,    -- 100 MB per file
   ARRAY['application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-powerpoint',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/zip','image/png','image/jpeg','image/webp']),

  ('lms-thumbnails',
   'lms-thumbnails',
   TRUE,         -- public thumbnails are OK (no PII)
   5242880,      -- 5 MB per file
   ARRAY['image/png','image/jpeg','image/webp','image/gif']),

  ('lms-assignment-submissions',
   'lms-assignment-submissions',
   FALSE,
   52428800,     -- 50 MB per file
   ARRAY['application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/zip','image/png','image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS: each file path must be prefixed with institute_id ────────────

-- VIDEOS
CREATE POLICY "lms_video_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lms-course-videos'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

CREATE POLICY "lms_video_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lms-course-videos'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
  );

CREATE POLICY "lms_video_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lms-course-videos'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

-- MATERIALS
CREATE POLICY "lms_mat_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lms-course-materials'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

CREATE POLICY "lms_mat_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lms-course-materials'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
  );

CREATE POLICY "lms_mat_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lms-course-materials'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

-- THUMBNAILS (public bucket — storage path still scoped by institute)
CREATE POLICY "lms_thumb_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lms-thumbnails'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND lms_is_instructor()
  );

-- ASSIGNMENT SUBMISSIONS
CREATE POLICY "lms_asub_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lms-assignment-submissions'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
    AND get_my_role() IN ('student','admin','staff')
  );

CREATE POLICY "lms_asub_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lms-assignment-submissions'
    AND (storage.foldername(name))[1] = get_my_institute_id()::TEXT
  );

-- ============================================================
-- SECTION 23 — Utility RPCs
-- ============================================================

-- get_lms_analytics: quick admin/staff summary for a course
CREATE OR REPLACE FUNCTION get_lms_course_analytics(p_course_id UUID)
RETURNS TABLE (
  total_enrollments   BIGINT,
  active_enrollments  BIGINT,
  completions         BIGINT,
  avg_completion_pct  NUMERIC,
  avg_quiz_score      NUMERIC,
  total_submissions   BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(e.id)                                          AS total_enrollments,
    COUNT(e.id) FILTER (WHERE e.status = 'active')      AS active_enrollments,
    COUNT(e.id) FILTER (WHERE e.status = 'completed')   AS completions,
    ROUND(AVG(cp.completion_pct), 2)                    AS avg_completion_pct,
    ROUND(AVG(qa.percentage), 2)                        AS avg_quiz_score,
    COUNT(DISTINCT sub.id)                              AS total_submissions
  FROM public.lms_enrollments          e
  LEFT JOIN public.lms_course_progress cp  ON cp.enrollment_id = e.id
  LEFT JOIN public.lms_quiz_attempts   qa  ON qa.enrollment_id = e.id
  LEFT JOIN public.lms_assignment_submissions sub ON sub.enrollment_id = e.id
  WHERE e.course_id = p_course_id
    AND e.institute_id = get_my_institute_id();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- END OF MIGRATION 011
-- ============================================================
