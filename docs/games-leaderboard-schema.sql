-- ---------------------------------------------------------------------------
-- Games Leaderboard schema + RPCs
-- ---------------------------------------------------------------------------
-- Persists every completed game run so students can compete within their
-- institute. The view is institute-scoped — students only see classmates
-- from the same institute. Anonymous/legacy plays still work fully offline
-- (the client just skips the network write when no row would be visible).
--
-- Run this once in the Supabase SQL editor. Idempotent.
-- ---------------------------------------------------------------------------

-- 1. game_scores table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.game_scores (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institute_id         UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  game_id              TEXT NOT NULL CHECK (length(game_id) BETWEEN 1 AND 40),
  topic                TEXT NOT NULL CHECK (length(topic) BETWEEN 1 AND 120),
  difficulty           TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  score                INTEGER NOT NULL CHECK (score >= 0),
  max_score            INTEGER NOT NULL CHECK (max_score >= 0),
  percent              NUMERIC(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  duration_ms          INTEGER NOT NULL CHECK (duration_ms >= 0),
  is_perfect           BOOLEAN NOT NULL DEFAULT FALSE,
  is_daily_challenge   BOOLEAN NOT NULL DEFAULT FALSE,
  xp_earned            INTEGER NOT NULL DEFAULT 0 CHECK (xp_earned >= 0),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_scores_inst_created
  ON public.game_scores (institute_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_scores_user_created
  ON public.game_scores (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_scores_inst_game_score
  ON public.game_scores (institute_id, game_id, score DESC);

CREATE INDEX IF NOT EXISTS idx_game_scores_inst_xp_recent
  ON public.game_scores (institute_id, created_at DESC, xp_earned);

ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;

-- 2. RLS policies ───────────────────────────────────────────────────────────
-- Drop-and-recreate so re-runs pick up policy updates cleanly.

DROP POLICY IF EXISTS "game_scores_insert_own"           ON public.game_scores;
DROP POLICY IF EXISTS "game_scores_read_institute"       ON public.game_scores;
DROP POLICY IF EXISTS "game_scores_super_admin_all"      ON public.game_scores;

-- Students (any signed-in user) insert their own rows. user_id must match
-- auth.uid() and institute_id must match the user's profile institute.
CREATE POLICY "game_scores_insert_own" ON public.game_scores
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND institute_id = public.get_my_institute_id()
  );

-- Anyone in the institute can read (this is what powers the leaderboard).
CREATE POLICY "game_scores_read_institute" ON public.game_scores
  FOR SELECT
  USING (
    institute_id = public.get_my_institute_id()
    OR public.is_super_admin()
  );

CREATE POLICY "game_scores_super_admin_all" ON public.game_scores
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());


-- 3. Leaderboard RPC ────────────────────────────────────────────────────────
-- Returns the institute leaderboard ranked by total XP within a time window.
-- Optionally filtered by game_id (game-specific leaderboard).
--
-- p_period: 'all' | 'week' | 'month' | 'today'
-- p_game_id: NULL means aggregate across all games
-- p_limit: max rows (clamped 1..100)

CREATE OR REPLACE FUNCTION public.get_game_leaderboard(
  p_period   TEXT DEFAULT 'all',
  p_game_id  TEXT DEFAULT NULL,
  p_limit    INTEGER DEFAULT 20
)
RETURNS TABLE (
  user_id          UUID,
  name             TEXT,
  avatar_url       TEXT,
  total_xp         BIGINT,
  total_plays      BIGINT,
  total_perfects   BIGINT,
  best_score       INTEGER,
  best_percent     NUMERIC,
  is_me            BOOLEAN,
  rank             BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     UUID := auth.uid();
  v_institute_id  UUID := public.get_my_institute_id();
  v_since         TIMESTAMPTZ;
  v_limit         INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_institute_id IS NULL THEN
    -- Super admin or stray users — return empty rather than error.
    RETURN;
  END IF;

  v_since := CASE lower(coalesce(p_period, 'all'))
    WHEN 'today' THEN date_trunc('day', now())
    WHEN 'week'  THEN now() - INTERVAL '7 days'
    WHEN 'month' THEN now() - INTERVAL '30 days'
    ELSE TIMESTAMPTZ '1970-01-01'
  END;

  RETURN QUERY
  WITH scoped AS (
    SELECT gs.*
      FROM public.game_scores gs
     WHERE gs.institute_id = v_institute_id
       AND gs.created_at >= v_since
       AND (p_game_id IS NULL OR gs.game_id = p_game_id)
  ),
  agg AS (
    SELECT
      s.user_id,
      SUM(s.xp_earned)::BIGINT      AS total_xp,
      COUNT(*)::BIGINT              AS total_plays,
      SUM(CASE WHEN s.is_perfect THEN 1 ELSE 0 END)::BIGINT AS total_perfects,
      MAX(s.score)::INTEGER         AS best_score,
      MAX(s.percent)::NUMERIC       AS best_percent
    FROM scoped s
    GROUP BY s.user_id
  )
  SELECT
    a.user_id,
    COALESCE(u.name, 'Anonymous')              AS name,
    u.avatar_url                                AS avatar_url,
    a.total_xp,
    a.total_plays,
    a.total_perfects,
    a.best_score,
    a.best_percent,
    (a.user_id = v_caller_id)                  AS is_me,
    DENSE_RANK() OVER (ORDER BY a.total_xp DESC, a.total_plays DESC) AS rank
  FROM agg a
  JOIN public.users u ON u.id = a.user_id
  ORDER BY rank ASC, a.total_xp DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_game_leaderboard(TEXT, TEXT, INTEGER) TO authenticated;


-- 4. Streak leaderboard RPC ────────────────────────────────────────────────
-- Returns the top players by current daily streak (consecutive UTC days with
-- at least one play). Useful "social pressure" leaderboard distinct from XP.

CREATE OR REPLACE FUNCTION public.get_streak_leaderboard(
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  user_id        UUID,
  name           TEXT,
  avatar_url     TEXT,
  current_streak INTEGER,
  is_me          BOOLEAN,
  rank           BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     UUID := auth.uid();
  v_institute_id  UUID := public.get_my_institute_id();
  v_limit         INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_institute_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH play_days AS (
    -- One row per user per day they played at all.
    SELECT DISTINCT
      gs.user_id,
      (gs.created_at AT TIME ZONE 'UTC')::DATE AS play_date
      FROM public.game_scores gs
     WHERE gs.institute_id = v_institute_id
  ),
  numbered AS (
    SELECT
      pd.user_id,
      pd.play_date,
      pd.play_date - (ROW_NUMBER() OVER (PARTITION BY pd.user_id ORDER BY pd.play_date))::INTEGER AS streak_group
    FROM play_days pd
  ),
  streaks AS (
    SELECT
      n.user_id,
      n.streak_group,
      COUNT(*)::INTEGER AS streak_len,
      MAX(n.play_date)  AS last_play
    FROM numbered n
    GROUP BY n.user_id, n.streak_group
  ),
  current_streaks AS (
    -- A streak is "current" iff its last play is today or yesterday (UTC).
    SELECT
      s.user_id,
      s.streak_len AS current_streak
    FROM streaks s
    WHERE s.last_play >= ((now() AT TIME ZONE 'UTC')::DATE - INTERVAL '1 day')
  ),
  best_current AS (
    SELECT
      cs.user_id,
      MAX(cs.current_streak) AS current_streak
    FROM current_streaks cs
    GROUP BY cs.user_id
  )
  SELECT
    bc.user_id,
    COALESCE(u.name, 'Anonymous')              AS name,
    u.avatar_url                                AS avatar_url,
    bc.current_streak,
    (bc.user_id = v_caller_id)                  AS is_me,
    DENSE_RANK() OVER (ORDER BY bc.current_streak DESC) AS rank
  FROM best_current bc
  JOIN public.users u ON u.id = bc.user_id
  WHERE bc.current_streak >= 1
  ORDER BY rank ASC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_streak_leaderboard(INTEGER) TO authenticated;


-- Smoke test (run with a real authenticated session):
--   SELECT * FROM public.get_game_leaderboard('week', NULL, 10);
--   SELECT * FROM public.get_game_leaderboard('all', 'quiz-rush', 5);
--   SELECT * FROM public.get_streak_leaderboard(10);
