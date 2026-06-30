// ---------------------------------------------------------------------------
// useGameScores — per-user game progress: high scores, XP, levels, streaks,
// achievements, daily challenge tracking
// ---------------------------------------------------------------------------
// Everything is in localStorage so the system works offline. State is keyed
// by user id so multiple students on the same device don't overwrite each
// other. Storage is versioned via STORAGE_KEY so future schema changes can
// re-migrate cleanly.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import type {
  Achievement,
  AchievementId,
  AwardedRewards,
  GameId,
  GameResult,
  HighScoreRecord,
  PlayerProgress,
  XPGain,
} from "../types";
import {
  ACHIEVEMENT_INDEX,
  levelFromXp,
  xpProgressWithinLevel,
} from "../lib/achievements";
import { dayDiff, localDateISO } from "../lib/dailyChallenge";
import { recordGameScoreRemote } from "../services/gameLeaderboard.service";

const STORAGE_KEY = "eliteclass-game-state-v2";

interface UserState {
  highScores: Record<string, HighScoreRecord>;
  progress: PlayerProgress;
  /** Daily challenge completion: dateISO → gameId completed that day. */
  dailyCompletions: Record<string, GameId>;
  /** Tracks last 3 results for "perfect-streak-3" achievement. */
  recentPerfects: boolean[];
}

type Store = Record<string, UserState>;

// ── Storage I/O ────────────────────────────────────────────────────────────

function emptyProgress(): PlayerProgress {
  return {
    xp: 0,
    level: 1,
    dailyStreak: 0,
    longestStreak: 0,
    lastPlayDateISO: null,
    totalPlays: 0,
    totalPerfects: 0,
    uniqueTopics: [],
    achievements: {
      "first-play": null,
      "first-perfect": null,
      "perfect-streak-3": null,
      "all-games-played": null,
      "streak-3-days": null,
      "streak-7-days": null,
      "streak-30-days": null,
      "level-5": null,
      "level-10": null,
      "level-25": null,
      "century-club": null,
      polymath: null,
      "daily-warrior": null,
      "speed-demon": null,
      "hard-mode": null,
    },
    dailyChallengesCompleted: 0,
    hardWins: 0,
  };
}

function emptyUserState(): UserState {
  return {
    highScores: {},
    progress: emptyProgress(),
    dailyCompletions: {},
    recentPerfects: [],
  };
}

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota / private mode — silently ignore.
  }
}

function ensureUser(store: Store, userId: string): UserState {
  if (!store[userId]) store[userId] = emptyUserState();
  // Backfill: if `achievements` map was added later, normalize shape.
  const fresh = emptyProgress();
  store[userId].progress = {
    ...fresh,
    ...store[userId].progress,
    achievements: { ...fresh.achievements, ...store[userId].progress.achievements },
  };
  if (!Array.isArray(store[userId].recentPerfects)) {
    store[userId].recentPerfects = [];
  }
  if (!store[userId].dailyCompletions) store[userId].dailyCompletions = {};
  return store[userId];
}

// ── XP math ────────────────────────────────────────────────────────────────

const DIFFICULTY_BONUS: Record<string, number> = {
  easy: 0,
  medium: 10,
  hard: 25,
};

function computeXP(result: GameResult, isPerfect: boolean): XPGain {
  const percent = result.maxScore > 0 ? result.score / result.maxScore : 0;
  // Base scales with accuracy (so a 50% run gets half base of a 100% run).
  const base = Math.max(5, Math.round(40 * percent));
  const difficultyBonus = DIFFICULTY_BONUS[result.difficulty] ?? 0;
  const perfectBonus = isPerfect ? 25 : 0;
  const subtotal = base + difficultyBonus + perfectBonus;
  const dailyChallengeMultiplier = result.isDailyChallenge ? 2 : 1;
  const total = subtotal * dailyChallengeMultiplier;
  return {
    base,
    difficultyBonus,
    perfectBonus,
    dailyChallengeMultiplier,
    total,
  };
}

// ── Streak helpers ─────────────────────────────────────────────────────────

function updateDailyStreak(progress: PlayerProgress, todayISO: string) {
  if (progress.lastPlayDateISO === todayISO) {
    // Already played today — keep streak as-is.
    return { increased: false, streak: progress.dailyStreak };
  }
  if (progress.lastPlayDateISO === null) {
    progress.dailyStreak = 1;
  } else {
    const diff = dayDiff(todayISO, progress.lastPlayDateISO);
    if (diff === 1) {
      progress.dailyStreak += 1;
    } else if (diff >= 2) {
      progress.dailyStreak = 1; // streak broken
    }
  }
  progress.lastPlayDateISO = todayISO;
  if (progress.dailyStreak > progress.longestStreak) {
    progress.longestStreak = progress.dailyStreak;
  }
  return { increased: true, streak: progress.dailyStreak };
}

// ── Achievement evaluation ─────────────────────────────────────────────────

function evaluateAchievements(
  state: UserState,
  result: GameResult,
  isPerfect: boolean,
  highScoresEntries: string[], // gameIds with at least one play
): Achievement[] {
  const unlocked: Achievement[] = [];
  const now = Date.now();

  const unlock = (id: AchievementId) => {
    if (state.progress.achievements[id] !== null) return; // already unlocked
    state.progress.achievements[id] = now;
    const meta = ACHIEVEMENT_INDEX[id];
    if (meta) unlocked.push({ ...meta, unlockedAt: now });
  };

  // First play
  if (state.progress.totalPlays >= 1) unlock("first-play");

  // Perfect-related
  if (isPerfect) unlock("first-perfect");
  // Track last 3 results for triple-perfect
  state.recentPerfects.push(isPerfect);
  if (state.recentPerfects.length > 3) state.recentPerfects.shift();
  if (
    state.recentPerfects.length === 3 &&
    state.recentPerfects.every(Boolean)
  ) {
    unlock("perfect-streak-3");
  }

  // All games tried
  const allGames: GameId[] = [
    "quiz-rush",
    "flashcard-match",
    "hangman",
    "word-scramble",
    "fill-blanks",
    "true-false-speedrun",
  ];
  if (allGames.every((g) => highScoresEntries.includes(g))) {
    unlock("all-games-played");
  }

  // Streak milestones
  if (state.progress.dailyStreak >= 3) unlock("streak-3-days");
  if (state.progress.dailyStreak >= 7) unlock("streak-7-days");
  if (state.progress.dailyStreak >= 30) unlock("streak-30-days");

  // Level milestones
  const level = levelFromXp(state.progress.xp);
  if (level >= 5) unlock("level-5");
  if (level >= 10) unlock("level-10");
  if (level >= 25) unlock("level-25");

  // Activity volume
  if (state.progress.totalPlays >= 100) unlock("century-club");

  // Topic variety
  if (state.progress.uniqueTopics.length >= 10) unlock("polymath");

  // Daily warrior
  if (state.progress.dailyChallengesCompleted >= 5) unlock("daily-warrior");

  // Speed demon — perfect Quiz Rush under 60s
  if (
    result.gameId === "quiz-rush" &&
    isPerfect &&
    result.durationMs < 60_000
  ) {
    unlock("speed-demon");
  }

  // Hard mode wins (≥80% on hard)
  if (
    result.difficulty === "hard" &&
    result.maxScore > 0 &&
    result.score / result.maxScore >= 0.8
  ) {
    state.progress.hardWins += 1;
    if (state.progress.hardWins >= 5) unlock("hard-mode");
  }

  return unlocked;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useGameScores() {
  const userId = useAuthStore((s) => s.user?.id) ?? "anon";
  const [state, setState] = useState<UserState>(() => {
    const store = readStore();
    return ensureUser(store, userId);
  });

  // Re-read when the user changes (sign in/out)
  useEffect(() => {
    const store = readStore();
    setState({ ...ensureUser(store, userId) });
  }, [userId]);

  const recordResult = useCallback(
    (result: GameResult): AwardedRewards => {
      const store = readStore();
      const userState = ensureUser(store, userId);

      const percent =
        result.maxScore > 0 ? (result.score / result.maxScore) * 100 : 0;
      const isPerfect = result.maxScore > 0 && result.score === result.maxScore;
      const todayISO = localDateISO(new Date(result.finishedAt));

      // 1. High scores
      const existing = userState.highScores[result.gameId];
      const nextHigh: HighScoreRecord = existing
        ? {
            gameId: result.gameId,
            bestScore: Math.max(existing.bestScore, result.score),
            bestPercent: Math.max(existing.bestPercent, percent),
            bestDurationMs: isPerfect
              ? Math.min(existing.bestDurationMs ?? Infinity, result.durationMs)
              : existing.bestDurationMs,
            playCount: existing.playCount + 1,
            lastPlayedAt: result.finishedAt,
          }
        : {
            gameId: result.gameId,
            bestScore: result.score,
            bestPercent: percent,
            bestDurationMs: isPerfect ? result.durationMs : null,
            playCount: 1,
            lastPlayedAt: result.finishedAt,
          };
      userState.highScores[result.gameId] = nextHigh;

      // 2. Aggregates
      userState.progress.totalPlays += 1;
      if (isPerfect) userState.progress.totalPerfects += 1;

      // Topic deduplication (case-insensitive, capped at 100)
      const topicKey = result.topic.trim().toLowerCase();
      if (topicKey && !userState.progress.uniqueTopics.includes(topicKey)) {
        userState.progress.uniqueTopics.push(topicKey);
        if (userState.progress.uniqueTopics.length > 100) {
          userState.progress.uniqueTopics.shift();
        }
      }

      // 3. Streak (update before XP so streak-based bonuses can be added later)
      const streakInfo = updateDailyStreak(userState.progress, todayISO);

      // 4. Daily challenge completion
      if (result.isDailyChallenge && !userState.dailyCompletions[todayISO]) {
        userState.dailyCompletions[todayISO] = result.gameId;
        userState.progress.dailyChallengesCompleted += 1;
      }

      // 5. XP + level
      const xpGain = computeXP(result, isPerfect);
      const previousLevel = userState.progress.level;
      userState.progress.xp += xpGain.total;
      const newLevel = levelFromXp(userState.progress.xp);
      userState.progress.level = newLevel;
      const leveledUp = newLevel > previousLevel;

      // 6. Achievements (after all state updates so checks see latest values)
      const unlockedAchievements = evaluateAchievements(
        userState,
        result,
        isPerfect,
        Object.keys(userState.highScores),
      );

      // Persist + re-render
      store[userId] = userState;
      writeStore(store);
      setState({ ...userState });

      const rewards: AwardedRewards = {
        xpGain,
        previousLevel,
        newLevel,
        leveledUp,
        unlockedAchievements,
        isPerfect,
        isDailyChallenge: !!result.isDailyChallenge,
        dailyStreak: userState.progress.dailyStreak,
        streakIncreased: streakInfo.increased,
      };

      // Fire-and-forget upload to server leaderboard. Failure is silent —
      // local progress (XP, streaks, achievements) is the source of truth
      // for the player's own dashboard; leaderboards are a social-proof
      // layer that gracefully degrades when offline.
      void recordGameScoreRemote(result, rewards);

      return rewards;
    },
    [userId],
  );

  const getScore = useCallback(
    (gameId: GameId): HighScoreRecord | null =>
      state.highScores[gameId] ?? null,
    [state],
  );

  const wasDailyChallengeCompletedToday = useCallback((): boolean => {
    const todayISO = localDateISO();
    return !!state.dailyCompletions[todayISO];
  }, [state]);

  const levelInfo = xpProgressWithinLevel(state.progress.xp);

  return {
    progress: state.progress,
    highScores: state.highScores,
    levelInfo,
    recordResult,
    getScore,
    wasDailyChallengeCompletedToday,
  };
}
