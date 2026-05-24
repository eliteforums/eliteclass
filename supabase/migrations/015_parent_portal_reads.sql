-- Parent portal read access for linked child analytics.
--
-- These policies expose read-only access for parents to the data needed by the
-- parent dashboard: batches, courses, linked enrollments, attendance history,
-- student history, and uploaded documents.

-- ── batches ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "parent_read_linked_batches" ON public.batches;

CREATE POLICY "parent_read_linked_batches"
  ON public.batches FOR SELECT
  USING (
    id IN (
      SELECT DISTINCT s.batch_id
      FROM public.students s
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
        AND s.batch_id IS NOT NULL
    )
  );

-- ── courses ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "parent_read_linked_courses" ON public.courses;

CREATE POLICY "parent_read_linked_courses"
  ON public.courses FOR SELECT
  USING (
    id IN (
      SELECT DISTINCT sc.course_id
      FROM public.student_courses sc
      JOIN public.students s ON s.id = sc.student_id
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── student_courses ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "parent_read_linked_student_courses" ON public.student_courses;

CREATE POLICY "parent_read_linked_student_courses"
  ON public.student_courses FOR SELECT
  USING (
    student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── student_documents ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "parent_read_linked_student_documents" ON public.student_documents;

CREATE POLICY "parent_read_linked_student_documents"
  ON public.student_documents FOR SELECT
  USING (
    student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── student_history ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "parent_read_linked_student_history" ON public.student_history;

CREATE POLICY "parent_read_linked_student_history"
  ON public.student_history FOR SELECT
  USING (
    student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── attendance_records ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "parent_read_linked_attendance_records" ON public.attendance_records;

CREATE POLICY "parent_read_linked_attendance_records"
  ON public.attendance_records FOR SELECT
  USING (
    student_id IN (
      SELECT s.id
      FROM public.students s
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── attendance_sessions ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "parent_read_linked_attendance_sessions" ON public.attendance_sessions;

CREATE POLICY "parent_read_linked_attendance_sessions"
  ON public.attendance_sessions FOR SELECT
  USING (
    id IN (
      SELECT DISTINCT ar.session_id
      FROM public.attendance_records ar
      JOIN public.students s ON s.id = ar.student_id
      JOIN public.student_parents sp ON sp.student_id = s.id
      JOIN public.parents p ON p.id = sp.parent_id
      WHERE p.user_id = auth.uid()
    )
  );
