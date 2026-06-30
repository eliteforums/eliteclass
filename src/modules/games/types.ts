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
