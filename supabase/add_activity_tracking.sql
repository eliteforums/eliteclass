-- =============================================================================
-- EliteClass — Activity Tracking & Live Location
--
-- Tables:
--   1. user_sessions — login/logout events with IP, device, location
--   2. activity_logs — detailed action trail (CRUD, page visits, etc.)
--   3. user_locations — real-time GPS coordinates for live map
--
-- Visible to: admin, super_admin (full), staff (limited to own students)
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. USER SESSIONS — Login/Logout Events
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('login', 'logout', 'token_refresh')),
  ip_address TEXT,
  user_agent TEXT,
  device_type TEXT, -- 'mobile', 'tablet', 'desktop'
  browser TEXT,
  os TEXT,
  -- Location from IP geolocation
  city TEXT,
  region TEXT,
  country TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  -- Session metadata
  session_id TEXT, -- Supabase auth session ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_institute ON public.user_sessions (institute_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_event ON public.user_sessions (event_type, created_at DESC);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Admin can see all sessions in their institute
CREATE POLICY "admin_view_sessions" ON public.user_sessions
  FOR SELECT USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() IN ('admin'::user_role, 'staff'::user_role)
  );

-- Users can see their own sessions
CREATE POLICY "users_view_own_sessions" ON public.user_sessions
  FOR SELECT USING (user_id = auth.uid());

-- Authenticated users can insert their own session logs
CREATE POLICY "users_insert_own_sessions" ON public.user_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Super admin full access
CREATE POLICY "super_admin_sessions" ON public.user_sessions
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ACTIVITY LOGS — Detailed Action Trail
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  -- Action details
  action TEXT NOT NULL, -- 'page_view', 'student_created', 'attendance_marked', etc.
  category TEXT NOT NULL DEFAULT 'general', -- 'auth', 'student', 'attendance', 'fee', 'exam', 'course', 'chat', 'settings'
  description TEXT, -- Human-readable description
  -- Context
  target_type TEXT, -- 'student', 'batch', 'course', 'exam', 'fee', etc.
  target_id TEXT, -- ID of the affected entity
  target_name TEXT, -- Name of the affected entity (for display without join)
  -- Request metadata
  ip_address TEXT,
  page_url TEXT,
  -- Additional data
  metadata JSONB, -- Flexible field for extra context
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.user_activity_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_institute ON public.user_activity_logs (institute_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON public.user_activity_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON public.user_activity_logs (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_target ON public.user_activity_logs (target_type, target_id);

ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Admin/staff can view all logs in their institute
CREATE POLICY "admin_view_activity" ON public.user_activity_logs
  FOR SELECT USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() IN ('admin'::user_role, 'staff'::user_role)
  );

-- Users can view their own activity
CREATE POLICY "users_view_own_activity" ON public.user_activity_logs
  FOR SELECT USING (user_id = auth.uid());

-- Authenticated users can insert their own logs
CREATE POLICY "users_insert_activity" ON public.user_activity_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Super admin full access
CREATE POLICY "super_admin_activity" ON public.user_activity_logs
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. USER LOCATIONS — Real-Time GPS Tracking
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION, -- GPS accuracy in meters
  altitude DOUBLE PRECISION,
  speed DOUBLE PRECISION, -- meters/second
  heading DOUBLE PRECISION, -- degrees from north
  -- Reverse geocoded address (optional, filled async)
  address TEXT,
  city TEXT,
  -- Status
  is_online BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only keep latest location per user (upsert pattern)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_locations_unique_user
  ON public.user_locations (user_id);

CREATE INDEX IF NOT EXISTS idx_user_locations_institute ON public.user_locations (institute_id, is_online);
CREATE INDEX IF NOT EXISTS idx_user_locations_online ON public.user_locations (is_online, last_seen_at DESC);

ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- Admin/staff can view all locations in their institute
CREATE POLICY "admin_view_locations" ON public.user_locations
  FOR SELECT USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() IN ('admin'::user_role, 'staff'::user_role)
  );

-- Users can view and update their own location
CREATE POLICY "users_manage_own_location" ON public.user_locations
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Super admin full access
CREATE POLICY "super_admin_locations" ON public.user_locations
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Enable Realtime for live location updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. LOCATION HISTORY — GPS trail (optional, for route tracking)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_location_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_history_user ON public.user_location_history (user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_history_institute ON public.user_location_history (institute_id, recorded_at DESC);

-- Partition-friendly: auto-delete old records (keep 30 days)
-- Run this periodically: DELETE FROM user_location_history WHERE recorded_at < now() - interval '30 days';

ALTER TABLE public.user_location_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_view_location_history" ON public.user_location_history
  FOR SELECT USING (
    institute_id = public.get_my_institute_id()
    AND public.get_my_role() IN ('admin'::user_role, 'staff'::user_role)
  );

CREATE POLICY "users_insert_own_history" ON public.user_location_history
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "super_admin_location_history" ON public.user_location_history
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
