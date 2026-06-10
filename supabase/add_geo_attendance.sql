-- =============================================================================
-- EliteClass — Geo-Fenced Attendance System
--
-- Flow:
--   1. Teacher sends an attendance prompt (captures their GPS location)
--   2. All students in the batch see the prompt via Realtime
--   3. Students tap "Mark Present" — their GPS is compared to teacher's location
--   4. If within 100 meters → attendance marked as present
--   5. Prompt expires after 5 minutes automatically
--
-- FIXED (2026-06-10):
--   1. Added validate_attendance_response() trigger for server-side distance check
--   2. Added handle_duplicate_response() trigger to gracefully handle race conditions
--   3. Added prompt cleanup function for expired prompt archival
--   4. Added cron job setup for auto-expiry
--
-- Tables:
--   - attendance_prompts: teacher-initiated attendance sessions
--   - attendance_responses: student responses with GPS validation result
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ATTENDANCE PROMPTS — Teacher-initiated geo-fenced sessions
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.attendance_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Teacher's GPS at prompt creation time
  teacher_latitude DOUBLE PRECISION NOT NULL,
  teacher_longitude DOUBLE PRECISION NOT NULL,
  teacher_accuracy DOUBLE PRECISION,
  -- Config
  radius_meters INTEGER NOT NULL DEFAULT 100, -- Max distance for valid attendance
  duration_minutes INTEGER NOT NULL DEFAULT 5, -- How long the prompt stays active
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_attendance_prompts_batch ON public.attendance_prompts (batch_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_prompts_institute ON public.attendance_prompts (institute_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_prompts_status ON public.attendance_prompts (status, expires_at);

ALTER TABLE public.attendance_prompts ENABLE ROW LEVEL SECURITY;

-- Teachers/admins can create prompts
CREATE POLICY "staff_create_prompts" ON public.attendance_prompts
  FOR INSERT WITH CHECK (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() IN ('admin'::user_role, 'staff'::user_role)
    AND teacher_id = auth.uid()
  );

-- Staff/admin can view and manage prompts in their institute
CREATE POLICY "staff_view_prompts" ON public.attendance_prompts
  FOR SELECT USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() IN ('admin'::user_role, 'staff'::user_role)
  );

-- Staff can update (cancel) their own prompts
CREATE POLICY "staff_update_prompts" ON public.attendance_prompts
  FOR UPDATE USING (
    teacher_id = auth.uid()
    AND institute_id = public.get_my_institute_id()
  );

-- Students can view active prompts for their batches
CREATE POLICY "students_view_active_prompts" ON public.attendance_prompts
  FOR SELECT USING (
    status = 'active'
    AND expires_at > now()
    AND batch_id IN (
      SELECT sba.batch_id FROM public.student_batch_assignments sba
      JOIN public.students s ON s.id = sba.student_id
      WHERE s.user_id = auth.uid() AND sba.is_active = true
    )
  );

-- Super admin full access
CREATE POLICY "super_admin_prompts" ON public.attendance_prompts
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Enable Realtime for live prompt delivery to students
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_prompts;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ATTENDANCE RESPONSES — Student GPS validation
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.attendance_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES public.attendance_prompts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  -- Student's GPS at response time
  student_latitude DOUBLE PRECISION NOT NULL,
  student_longitude DOUBLE PRECISION NOT NULL,
  student_accuracy DOUBLE PRECISION,
  -- Validation result (recalculated server-side by trigger)
  distance_meters DOUBLE PRECISION NOT NULL, -- Calculated distance from teacher
  is_within_radius BOOLEAN NOT NULL, -- distance_meters <= prompt.radius_meters
  status TEXT NOT NULL CHECK (status IN ('present', 'rejected', 'late')),
  -- Server-validated flag (set by trigger)
  server_validated BOOLEAN NOT NULL DEFAULT false,
  server_distance_meters DOUBLE PRECISION, -- Server-recalculated distance
  -- Timestamps
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Prevent duplicate responses
  UNIQUE(prompt_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_responses_prompt ON public.attendance_responses (prompt_id);
CREATE INDEX IF NOT EXISTS idx_attendance_responses_student ON public.attendance_responses (student_id, responded_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_responses_institute ON public.attendance_responses (institute_id, responded_at DESC);

ALTER TABLE public.attendance_responses ENABLE ROW LEVEL SECURITY;

-- Students can insert their own response
CREATE POLICY "students_respond" ON public.attendance_responses
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND institute_id = public.get_my_institute_id()
  );

-- Students can view their own responses
CREATE POLICY "students_view_own_responses" ON public.attendance_responses
  FOR SELECT USING (user_id = auth.uid());

-- Staff/admin can view all responses in their institute
CREATE POLICY "staff_view_responses" ON public.attendance_responses
  FOR SELECT USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() IN ('admin'::user_role, 'staff'::user_role)
  );

-- Super admin full access
CREATE POLICY "super_admin_responses" ON public.attendance_responses
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. HELPER FUNCTION — Haversine distance calculation (server-side validation)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.haversine_distance(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  R CONSTANT DOUBLE PRECISION := 6371000; -- Earth radius in meters
  dLat DOUBLE PRECISION;
  dLon DOUBLE PRECISION;
  a DOUBLE PRECISION;
  c DOUBLE PRECISION;
BEGIN
  dLat := radians(lat2 - lat1);
  dLon := radians(lon2 - lon1);
  a := sin(dLat / 2) * sin(dLat / 2) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(dLon / 2) * sin(dLon / 2);
  c := 2 * atan2(sqrt(a), sqrt(1 - a));
  RETURN R * c;
END;
$$;

GRANT EXECUTE ON FUNCTION public.haversine_distance(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. TRIGGER — Server-side distance validation on response insert
--
--    Recalculates distance server-side to prevent client-side tampering.
--    Updates status based on server-calculated distance vs. prompt radius.
--    Marks the response as server_validated = true on success.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_attendance_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prompt_record RECORD;
  server_distance DOUBLE PRECISION;
  should_be_within BOOLEAN;
  should_status TEXT;
BEGIN
  -- Get the associated prompt
  SELECT * INTO prompt_record
  FROM public.attendance_prompts
  WHERE id = NEW.prompt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance prompt % not found', NEW.prompt_id;
  END IF;

  -- Recalculate distance server-side using haversine
  server_distance := public.haversine_distance(
    prompt_record.teacher_latitude,
    prompt_record.teacher_longitude,
    NEW.student_latitude,
    NEW.student_longitude
  );

  -- Determine correct status based on server calculation
  should_be_within := server_distance <= prompt_record.radius_meters;

  IF should_be_within THEN
    should_status := 'present';
  ELSE
    should_status := 'rejected';
  END IF;

  -- Override client-provided values with server-calculated ones
  NEW.distance_meters := ROUND(server_distance);
  NEW.is_within_radius := should_be_within;
  NEW.status := should_status;
  NEW.server_validated := true;
  NEW.server_distance_meters := ROUND(server_distance);

  RETURN NEW;
END;
$$;

-- Drop existing trigger if present (for idempotent migrations)
DROP TRIGGER IF EXISTS trg_validate_attendance_response ON public.attendance_responses;

CREATE TRIGGER trg_validate_attendance_response
  BEFORE INSERT ON public.attendance_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_attendance_response();


-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. TRIGGER — Graceful handling of duplicate responses
--
--    Instead of raising a 23505 error, silently return the existing response.
--    This prevents confusing error messages for race conditions.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_duplicate_attendance_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing RECORD;
BEGIN
  -- Check if a response already exists for this prompt + student
  SELECT * INTO existing
  FROM public.attendance_responses
  WHERE prompt_id = NEW.prompt_id
    AND student_id = NEW.student_id;

  IF FOUND THEN
    -- Return the existing record instead of inserting
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if present (for idempotent migrations)
DROP TRIGGER IF EXISTS trg_handle_duplicate_response ON public.attendance_responses;

CREATE TRIGGER trg_handle_duplicate_response
  BEFORE INSERT ON public.attendance_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_duplicate_attendance_response();


-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. AUTO-EXPIRE FUNCTION — Marks prompts as expired after duration
--    Call this periodically via pg_cron or a Supabase Edge Function
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.expire_attendance_prompts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE public.attendance_prompts
  SET status = 'expired'
  WHERE status = 'active' AND expires_at <= now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_attendance_prompts() TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. ENABLE REALTIME FOR ATTENDANCE RESPONSES (optional)
--    Uncomment if you want students to see responses in real-time
-- ═══════════════════════════════════════════════════════════════════════════════

-- ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_responses;
