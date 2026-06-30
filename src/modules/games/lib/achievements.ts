// ---------------------------------------------------------------------------
// Achievement catalogue + XP curve constants
// ---------------------------------------------------------------------------

import type { Achievement, AchievementId } from "../types";

export const ACHIEVEMENT_CATALOG: ReadonlyArray<Achievement> = [
  {
    id: "first-play",
    name: "Welcome aboard",
    description: "Play your first game.",
    unlockedAt: null,
  },
  {
    id: "first-perfect",
    name: "Bullseye",
    description: "Score 100% in any game.",
    unlockedAt: null,
  },
  {
    id: "perfect-streak-3",
    name: "Untouchable",
    description: "Score 100% three times in a row.",
    unlockedAt: null,
  },
  {
    id: "all-games-played",
    name: "Renaissance Mind",
    description: "Play every game at least once.",
    unlockedAt: null,
  },
  {
    id: "streak-3-days",
    name: "On a roll",
    description: "Play games for 3 days in a row.",
    unlockedAt: null,
  },
  {
    id: "streak-7-days",
    name: "Weekly Warrior",
    description: "Play games for 7 days in a row.",
    unlockedAt: null,
  },
  {
    id: "streak-30-days",
    name: "Iron Discipline",
    description: "Play games for 30 days in a row.",
    unlockedAt: null,
  },
  {
    id: "level-5",
    name: "Apprentice",
    description: "Reach level 5.",
    unlockedAt: null,
  },
  {
    id: "level-10",
    name: "Scholar",
    description: "Reach level 10.",
    unlockedAt: null,
  },
  {
    id: "level-25",
    name: "Grandmaster",
    description: "Reach level 25.",
    unlockedAt: null,
  },
  {
    id: "century-club",
    name: "Century Club",
    description: "Play 100 games in total.",
    unlockedAt: null,
  },
  {
    id: "polymath",
    name: "Polymath",
    description: "Try 10 different topics.",
    unlockedAt: null,
  },
  {
    id: "daily-warrior",
    name: "Daily Warrior",
    description: "Complete 5 daily challenges.",
    unlockedAt: null,
  },
  {
    id: "speed-demon",
    name: "Speed Demon",
    description: "Score perfect on Quiz Rush in under 60 seconds.",
    unlockedAt: null,
  },
  {
    id: "hard-mode",
    name: "No Mercy",
    description: "Win 5 hard-difficulty games (≥80% score).",
    unlockedAt: null,
  },
];

export const ACHIEVEMENT_INDEX: Record<AchievementId, Achievement> =
  Object.fromEntries(ACHIEVEMENT_CATALOG.map((a) => [a.id, a])) as Record<
    AchievementId,
    Achievement
  >;

// ── XP / Level curve ────────────────────────────────────────────────────────
// Diablo-style: each level requires more XP than the previous one.
//   xpForLevel(n) = 100 * n^1.5  rounded
// Level 1: 100 XP  | Level 5: ~1118 XP | Level 10: ~3162 XP | Level 25: ~12500 XP

export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(100 * Math.pow(level - 1, 1.5));
}

/** Cumulative XP to reach the given level. */
export function cumulativeXpForLevel(level: number): number {
  let total = 0;
  for (let i = 2; i <= level; i++) total += xpRequiredForLevel(i);
  return total;
}

/** Given total XP, derive the player's level (level >= 1). */
export function levelFromXp(xp: number): number {
  let level = 1;
  let accumulated = 0;
  while (true) {
    const cost = xpRequiredForLevel(level + 1);
    if (accumulated + cost > xp) return level;
    accumulated += cost;
    level++;
    if (level > 200) return level; // safety guard
  }
}

/** XP progress within the current level: { current, needed }. */
export function xpProgressWithinLevel(xp: number): {
  level: number;
  current: number;
  needed: number;
  percent: number;
} {
  const level = levelFromXp(xp);
  const floor = cumulativeXpForLevel(level);
  const ceiling = cumulativeXpForLevel(level + 1);
  const current = xp - floor;
  const needed = ceiling - floor;
  const percent = needed > 0 ? (current / needed) * 100 : 0;
  return { level, current, needed, percent };
}
