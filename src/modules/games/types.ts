// ---------------------------------------------------------------------------
// Game types shared across the AI Games feature
// ---------------------------------------------------------------------------

export type GameId =
  | "quiz-rush"
  | "flashcard-match"
  | "hangman"
  | "word-scramble"
  | "fill-blanks"
  | "true-false-speedrun";

export type Difficulty = "easy" | "medium" | "hard";

export interface GameSession {
  gameId: GameId;
  topic: string;
  difficulty: Difficulty;
  startedAt: number;
}

// ── Per-game content shapes (what the Groq generator returns) ────────────────

export interface QuizQuestion {
  question: string;
  options: string[]; // 4 options
  correctIndex: number; // 0..3
  explanation: string;
}

export interface Flashcard {
  term: string;
  definition: string;
}

export interface HangmanWord {
  word: string; // a single uppercase word, no spaces
  hint: string;
  category: string;
}

export interface ScrambleEntry {
  word: string; // uppercase, single token preferred
  hint: string;
}

export interface FillBlankEntry {
  sentence: string; // contains exactly one "___" blank
  answer: string;
  hint: string;
}

export interface TrueFalseStatement {
  statement: string;
  isTrue: boolean;
  explanation: string;
}

// ── Per-game results (what the player ends with) ────────────────────────────

export interface GameResult {
  gameId: GameId;
  topic: string;
  difficulty: Difficulty;
  score: number;
  maxScore: number;
  durationMs: number;
  finishedAt: number;
  /** True when this run satisfied the daily challenge (double XP). */
  isDailyChallenge?: boolean;
}

// ── Persisted high-score record ─────────────────────────────────────────────

export interface HighScoreRecord {
  gameId: GameId;
  bestScore: number;
  bestPercent: number;
  bestDurationMs: number | null;
  playCount: number;
  lastPlayedAt: number;
}

// ── Player progress (XP, levels, streaks, achievements) ────────────────────

export type AchievementId =
  | "first-play"
  | "first-perfect"
  | "perfect-streak-3"
  | "all-games-played"
  | "streak-3-days"
  | "streak-7-days"
  | "streak-30-days"
  | "level-5"
  | "level-10"
  | "level-25"
  | "century-club" // 100 plays total
  | "polymath" // 10 different topics
  | "daily-warrior" // 5 daily challenges completed
  | "speed-demon" // perfect quiz-rush under 60s
  | "hard-mode"; // 5 hard-difficulty wins

export interface Achievement {
  id: AchievementId;
  name: string;
  description: string;
  unlockedAt: number | null;
}

export interface PlayerProgress {
  xp: number;
  level: number;
  /** Streak of consecutive UTC-day periods with at least one play. */
  dailyStreak: number;
  longestStreak: number;
  lastPlayDateISO: string | null; // YYYY-MM-DD in local time
  totalPlays: number;
  totalPerfects: number;
  uniqueTopics: string[]; // lower-cased, distinct, capped at 100
  achievements: Record<AchievementId, number | null>; // id → unlockedAt or null
  dailyChallengesCompleted: number;
  hardWins: number;
}

export interface XPGain {
  base: number;
  difficultyBonus: number;
  perfectBonus: number;
  dailyChallengeMultiplier: number;
  total: number;
}

export interface AwardedRewards {
  xpGain: XPGain;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
  unlockedAchievements: Achievement[];
  isPerfect: boolean;
  isDailyChallenge: boolean;
  dailyStreak: number;
  streakIncreased: boolean;
}

export interface DailyChallenge {
  dateISO: string; // YYYY-MM-DD local
  gameId: GameId;
  topic: string;
  difficulty: Difficulty;
}
