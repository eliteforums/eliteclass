-- =============================================================================
-- exam-reattempts-and-offline-caching (spec)
-- Adds: exams.max_attempts column, exam_attempt_overrides, exam_score_audits,
--       offline_conflicts, enforce_exam_attempt_limit trigger, start_exam_attempt
--       and update_exam_score RPCs, all required RLS.
--
-- Schema notes / deviations from spec brief, recorded for future readers:
--   * This codebase has NO `exam_results` table — score lives on
--     `exam_attempts.score`. Therefore `exam_score_audits` references
--     `exam_attempts(id)` (column `attempt_id`) and `update_exam_score`
--     takes `p_attempt_id` and UPDATEs `exam_attempts.score`.
--   * `exams.max_marks` does NOT exist; the maximum is `exams.total_marks`.
--     `update_exam_score` validates the new score against `total_marks`.
--   * The audit log table is `activity_logs` (not `user_activity_logs`).
--     Columns: id, institute_id, user_id, action, entity_type, entity_id,
--     metadata, created_at.
--   * `exam_attempts.institute_id` is NOT NULL, so `start_exam_attempt`
--     resolves it from the parent exam before INSERT.
--   * `exam_attempts.attempt_number` does not exist on legacy rows; we add
--     it via ALTER TABLE ADD COLUMN IF NOT EXISTS.
--   * Helper functions (`get_my_role()`, `get_my_institute_id()`,
--     `get_my_student_id()`, `is_super_admin()`) live in the `public`
--     schema and are referenced as `public.<helper>()`.
-- =============================================================================

-- ── 1. exams.max_attempts ───────────────────────────────────────────────────
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE public.exams
    ADD CONSTRAINT exams_max_attempts_range
    CHECK (max_attempts BETWEEN 0 AND 9999);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.exams.max_attempts IS
  '0 = unlimited; positive integer = hard cap; NULL not permitted';

-- ── 2. exam_attempts.attempt_number (added; legacy rows default to 1) ──────
ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;

-- Partial unique index: at most one un-submitted attempt per (student, exam)
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_attempt
  ON public.exam_attempts (student_id, exam_id)
  WHERE submitted_at IS NULL;

-- ── 3. exam_attempt_overrides ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_attempt_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     UUID NOT NULL REFERENCES public.exams(id)    ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  granted_by  UUID NOT NULL REFERENCES auth.users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ NULL,
  reason      TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_eao_exam_student
  ON public.exam_attempt_overrides (exam_id, student_id)
  WHERE consumed_at IS NULL;

ALTER TABLE public.exam_attempt_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eao_select" ON public.exam_attempt_overrides;
CREATE POLICY "eao_select"
  ON public.exam_attempt_overrides FOR SELECT
  USING (
    -- super_admin always
    public.is_super_admin()
    -- student can read their own overrides
    OR student_id = public.get_my_student_id()
    -- staff/admin within the exam's institute
    OR (
      public.get_my_role() IN ('staff', 'admin')
      AND (SELECT institute_id FROM public.exams WHERE id = exam_id)
          = public.get_my_institute_id()
    )
  );

DROP POLICY IF EXISTS "eao_write" ON public.exam_attempt_overrides;
CREATE POLICY "eao_write"
  ON public.exam_attempt_overrides FOR ALL
  USING (
    public.is_super_admin()
    OR (
      public.get_my_role() IN ('staff', 'admin')
      AND (SELECT institute_id FROM public.exams WHERE id = exam_id)
          = public.get_my_institute_id()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_my_role() IN ('staff', 'admin')
      AND (SELECT institute_id FROM public.exams WHERE id = exam_id)
          = public.get_my_institute_id()
    )
  );

-- ── 4. enforce_exam_attempt_limit() trigger ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_exam_attempt_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_max   INTEGER;
  v_count INTEGER;
  v_extra INTEGER;
BEGIN
  SELECT max_attempts INTO v_max
    FROM public.exams
   WHERE id = NEW.exam_id;

  IF v_max IS NULL THEN
    RAISE EXCEPTION 'exam not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- 0 = unlimited
  IF v_max = 0 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.exam_attempts
   WHERE exam_id = NEW.exam_id
     AND student_id = NEW.student_id;

  SELECT count(*) INTO v_extra
    FROM public.exam_attempt_overrides
   WHERE exam_id = NEW.exam_id
     AND student_id = NEW.student_id
     AND consumed_at IS NULL;

  IF v_count >= v_max + v_extra THEN
    RAISE EXCEPTION
      'attempt limit reached: % of % (overrides: %)',
      v_count, v_max, v_extra
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_exam_attempt_limit ON public.exam_attempts;
CREATE TRIGGER trg_enforce_exam_attempt_limit
  BEFORE INSERT ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_exam_attempt_limit();

-- ── 5. start_exam_attempt(p_exam_id) RPC ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_exam_attempt(p_exam_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_student     UUID;
  v_institute   UUID;
  v_max         INTEGER;
  v_count       INTEGER;
  v_attempt_id  UUID;
  v_override_id UUID;
BEGIN
  v_student := public.get_my_student_id();
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'not a student' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Resolve exam metadata (institute_id is NOT NULL on exam_attempts)
  SELECT institute_id, max_attempts
    INTO v_institute, v_max
    FROM public.exams
   WHERE id = p_exam_id;

  IF v_institute IS NULL THEN
    RAISE EXCEPTION 'exam not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Existing attempts for this (student, exam)
  SELECT count(*) INTO v_count
    FROM public.exam_attempts
   WHERE exam_id = p_exam_id
     AND student_id = v_student;

  -- Insert new attempt; the BEFORE INSERT trigger will enforce the limit
  -- (taking active overrides into account).
  INSERT INTO public.exam_attempts (
    id, exam_id, student_id, institute_id,
    started_at, attempt_number
  )
  VALUES (
    gen_random_uuid(), p_exam_id, v_student, v_institute,
    now(), v_count + 1
  )
  RETURNING id INTO v_attempt_id;

  -- If this attempt is only possible because of an override, consume the
  -- oldest unconsumed override for this (student, exam) pair.
  IF v_max > 0 AND (v_count + 1) > v_max THEN
    SELECT id INTO v_override_id
      FROM public.exam_attempt_overrides
     WHERE exam_id = p_exam_id
       AND student_id = v_student
       AND consumed_at IS NULL
     ORDER BY granted_at
     LIMIT 1;

    IF v_override_id IS NOT NULL THEN
      UPDATE public.exam_attempt_overrides
         SET consumed_at = now()
       WHERE id = v_override_id;
    END IF;
  END IF;

  RETURN v_attempt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_exam_attempt(UUID) TO authenticated;

-- ── 6. exam_score_audits (append-only) ──────────────────────────────────────
-- NOTE: references exam_attempts(id) since this codebase has no exam_results.
CREATE TABLE IF NOT EXISTS public.exam_score_audits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id     UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  exam_id        UUID NOT NULL REFERENCES public.exams(id)         ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES public.students(id)      ON DELETE CASCADE,
  editor_user_id UUID NOT NULL REFERENCES auth.users(id),
  edited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_score      NUMERIC NOT NULL,
  new_score      NUMERIC NOT NULL,
  reason         TEXT NOT NULL CHECK (length(reason) BETWEEN 3 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_esa_exam_edited_at
  ON public.exam_score_audits (exam_id, edited_at DESC);

ALTER TABLE public.exam_score_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "esa_select" ON public.exam_score_audits;
CREATE POLICY "esa_select"
  ON public.exam_score_audits FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.get_my_role() IN ('staff', 'admin')
      AND (SELECT institute_id FROM public.exams WHERE id = exam_id)
          = public.get_my_institute_id()
    )
  );

DROP POLICY IF EXISTS "esa_insert" ON public.exam_score_audits;
CREATE POLICY "esa_insert"
  ON public.exam_score_audits FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_my_role() IN ('staff', 'admin')
      AND (SELECT institute_id FROM public.exams WHERE id = exam_id)
          = public.get_my_institute_id()
    )
  );

DROP POLICY IF EXISTS "esa_update_super" ON public.exam_score_audits;
CREATE POLICY "esa_update_super"
  ON public.exam_score_audits FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "esa_delete_super" ON public.exam_score_audits;
CREATE POLICY "esa_delete_super"
  ON public.exam_score_audits FOR DELETE
  USING (public.is_super_admin());

-- ── 7. offline_conflicts ────────────────────────────────────────────────────
-- TODO: denormalize an institute_id column onto offline_conflicts so that
-- staff/admin can have institute-scoped SELECT without a per-entity_type
-- join. Until then, app layer filters; DB-side RLS limits to admin/super.
CREATE TABLE IF NOT EXISTS public.offline_conflicts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type              TEXT NOT NULL,
  entity_id                UUID NOT NULL,
  actor_user_id            UUID NOT NULL REFERENCES auth.users(id),
  client_base_updated_at   TIMESTAMPTZ NULL,
  server_updated_at        TIMESTAMPTZ NOT NULL,
  client_payload           JSONB NOT NULL,
  server_payload           JSONB NOT NULL,
  resolution               TEXT NOT NULL CHECK (resolution IN ('last-writer-wins')),
  resolved_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolver_user_id         UUID NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_oc_entity_resolved_at
  ON public.offline_conflicts (entity_type, entity_id, resolved_at DESC);

ALTER TABLE public.offline_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oc_select" ON public.offline_conflicts;
CREATE POLICY "oc_select"
  ON public.offline_conflicts FOR SELECT
  USING (
    public.is_super_admin()
    OR public.get_my_role() = 'admin'
  );

DROP POLICY IF EXISTS "oc_insert" ON public.offline_conflicts;
CREATE POLICY "oc_insert"
  ON public.offline_conflicts FOR INSERT
  WITH CHECK (actor_user_id = auth.uid());

DROP POLICY IF EXISTS "oc_update_super" ON public.offline_conflicts;
CREATE POLICY "oc_update_super"
  ON public.offline_conflicts FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "oc_delete_super" ON public.offline_conflicts;
CREATE POLICY "oc_delete_super"
  ON public.offline_conflicts FOR DELETE
  USING (public.is_super_admin());

-- ── 8. update_exam_score(p_attempt_id, p_new_score, p_reason) RPC ───────────
-- Single-transaction: validates input, updates exam_attempts.score, inserts
-- audit row, and writes to activity_logs. SECURITY DEFINER so RLS doesn't
-- block the audit/activity inserts; permission is enforced explicitly via
-- get_my_role() and institute checks.
CREATE OR REPLACE FUNCTION public.update_exam_score(
  p_attempt_id UUID,
  p_new_score  NUMERIC,
  p_reason     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role        user_role;
  v_old_score   NUMERIC;
  v_exam_id     UUID;
  v_student_id  UUID;
  v_institute   UUID;
  v_total_marks NUMERIC;
BEGIN
  v_role := public.get_my_role();
  IF v_role IS NULL OR v_role NOT IN ('staff', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Load attempt
  SELECT score, exam_id, student_id, institute_id
    INTO v_old_score, v_exam_id, v_student_id, v_institute
    FROM public.exam_attempts
   WHERE id = p_attempt_id;

  IF v_exam_id IS NULL THEN
    RAISE EXCEPTION 'attempt not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Institute scoping for staff/admin (super_admin bypasses)
  IF v_role <> 'super_admin'
     AND v_institute <> public.get_my_institute_id() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Load max score from exam
  SELECT total_marks INTO v_total_marks
    FROM public.exams
   WHERE id = v_exam_id;

  -- Guard: total_marks may be 0/NULL on legacy/draft exams; treat NULL as 0.
  v_total_marks := COALESCE(v_total_marks, 0);

  -- Validate inputs
  IF p_new_score IS NULL
     OR p_new_score < 0
     OR p_new_score > v_total_marks THEN
    RAISE EXCEPTION
      'invalid input: new_score must be between 0 and % (got %)',
      v_total_marks, p_new_score
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_reason IS NULL
     OR length(p_reason) < 3
     OR length(p_reason) > 500 THEN
    RAISE EXCEPTION
      'invalid input: reason must be between 3 and 500 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Apply change
  UPDATE public.exam_attempts
     SET score = p_new_score
   WHERE id = p_attempt_id;

  -- Audit row
  INSERT INTO public.exam_score_audits (
    attempt_id, exam_id, student_id, editor_user_id,
    old_score, new_score, reason
  )
  VALUES (
    p_attempt_id, v_exam_id, v_student_id, auth.uid(),
    COALESCE(v_old_score, 0), p_new_score, p_reason
  );

  -- Platform-wide activity feed
  INSERT INTO public.activity_logs (
    institute_id, user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    v_institute,
    auth.uid(),
    'exam.score_edit',
    'exam_attempts',
    p_attempt_id,
    jsonb_build_object(
      'old_score', COALESCE(v_old_score, 0),
      'new_score', p_new_score,
      'reason',    p_reason,
      'exam_id',   v_exam_id,
      'student_id', v_student_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.update_exam_score(UUID, NUMERIC, TEXT)
  TO authenticated;

-- =============================================================================
-- end exam-reattempts-and-offline-caching (spec)
-- =============================================================================
