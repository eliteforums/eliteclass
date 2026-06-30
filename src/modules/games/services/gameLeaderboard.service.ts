// ---------------------------------------------------------------------------
// Games Leaderboard service
// ---------------------------------------------------------------------------
// Server-backed leaderboard. Writes are fire-and-forget so the local XP/UX
// path is never blocked. Reads go through SECURITY DEFINER RPCs that scope
// rows to the caller's institute.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { AwardedRewards, GameId, GameResult } from "../types";

export type LeaderboardPeriod = "today" | "week" | "month" | "all";

export interface LeaderboardEntry {
  user_id: string;
  name: string;
  avatar_url: string | null;
  total_xp: number;
  total_plays: number;
  total_perfects: number;
  best_score: number;
  best_percent: number;
  is_me: boolean;
  rank: number;
}

export interface StreakLeaderboardEntry {
  user_id: string;
  name: string;
  avatar_url: string | null;
  current_streak: number;
  is_me: boolean;
  rank: number;
}

/**
 * Insert a row into `game_scores` for the just-finished result. Silently
 * no-ops when:
 *   - Supabase isn't configured (dev mode)
 *   - The user isn't signed in or has no institute_id
 *   - The network is unreachable (offline) — the local progress engine
 *     already captured the run; the row will simply be missing from the
 *     server leaderboard. We don't queue offline writes for leaderboards
 *     because retroactive leaderboard entries would feel weird.
 */
export async function recordGameScoreRemote(
  result: GameResult,
  rewards: AwardedRewards | null,
): Promise<void> {
  if (!supabase) return;
  const { user } = useAuthStore.getState();
  if (!user?.id || !user?.institute_id) return;

  try {
    const percent = result.maxScore > 0 ? (result.score / result.maxScore) * 100 : 0;
    const { error } = await supabase.from("game_scores").insert({
      user_id: user.id,
      institute_id: user.institute_id,
      game_id: result.gameId,
      topic: result.topic.slice(0, 120),
      difficulty: result.difficulty,
      score: result.score,
      max_score: result.maxScore,
      percent: Math.round(percent * 100) / 100,
      duration_ms: Math.min(result.durationMs, 6 * 60 * 60_000), // cap at 6h to satisfy INT
      is_perfect: rewards?.isPerfect ?? result.score === result.maxScore,
      is_daily_challenge: !!result.isDailyChallenge,
      xp_earned: rewards?.xpGain.total ?? 0,
    });
    if (error) {
      // Swallow — leaderboard is a nice-to-have. Local progress already saved.
      // eslint-disable-next-line no-console
      console.warn("[games] leaderboard write failed", error.message);
    }
  } catch (err) {
    // Network errors are fine; we don't queue these.
    void err;
  }
}

export async function fetchLeaderboard(
  period: LeaderboardPeriod,
  gameId: GameId | null,
  limit = 20,
): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_game_leaderboard", {
    p_period: period,
    p_game_id: gameId,
    p_limit: limit,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[games] leaderboard read failed", error.message);
    return [];
  }
  return (data ?? []) as LeaderboardEntry[];
}

export async function fetchStreakLeaderboard(
  limit = 20,
): Promise<StreakLeaderboardEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_streak_leaderboard", {
    p_limit: limit,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[games] streak leaderboard read failed", error.message);
    return [];
  }
  return (data ?? []) as StreakLeaderboardEntry[];
}
