// ---------------------------------------------------------------------------
// Daily Challenge — deterministic game + topic per UTC day
// ---------------------------------------------------------------------------
// The same student device gets the same challenge each day. Different
// students get the same challenge globally on a given day (so they can
// compare scores), but per-user completion state lives in localStorage.
// ---------------------------------------------------------------------------

import type { DailyChallenge, Difficulty, GameId } from "../types";

const CHALLENGE_TOPICS: ReadonlyArray<string> = [
  "Photosynthesis",
  "World War II",
  "Renewable Energy",
  "Human Anatomy",
  "Solar System",
  "Shakespeare",
  "Algebra Basics",
  "Indian Independence Movement",
  "Cellular Biology",
  "Famous Inventors",
  "Periodic Table",
  "Greek Mythology",
  "Computer Networks",
  "Climate Change",
  "Calculus Fundamentals",
  "World Capitals",
  "Programming Concepts",
  "Ancient Civilizations",
  "Probability and Statistics",
  "Famous Paintings",
  "Music Theory",
  "Geology",
  "Astronomy",
  "Genetics",
  "Indian Constitution",
  "World Geography",
  "Economic Principles",
  "Chemistry Reactions",
  "Human Body Systems",
  "Newton's Laws",
];

const GAMES: ReadonlyArray<GameId> = [
  "quiz-rush",
  "flashcard-match",
  "hangman",
  "word-scramble",
  "fill-blanks",
  "true-false-speedrun",
];

const DIFFICULTIES: ReadonlyArray<Difficulty> = ["easy", "medium", "hard"];

/** Local YYYY-MM-DD for a given date. */
export function localDateISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Tiny string hash → 32-bit unsigned int. */
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function getDailyChallenge(date: Date = new Date()): DailyChallenge {
  const dateISO = localDateISO(date);
  const seed = hashString(dateISO);
  const gameId = GAMES[seed % GAMES.length];
  const topic = CHALLENGE_TOPICS[(seed >>> 8) % CHALLENGE_TOPICS.length];
  const difficulty = DIFFICULTIES[(seed >>> 16) % DIFFICULTIES.length];
  return { dateISO, gameId, topic, difficulty };
}

/** Days difference between two YYYY-MM-DD strings (a - b). */
export function dayDiff(aISO: string, bISO: string): number {
  const a = new Date(`${aISO}T00:00:00`);
  const b = new Date(`${bISO}T00:00:00`);
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}
