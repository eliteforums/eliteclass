// ---------------------------------------------------------------------------
// useGameScores — per-user, per-game high score tracking via localStorage
// ---------------------------------------------------------------------------
// Scores are stored locally so games work offline. Keyed by user id so
// multiple students on the same device don't overwrite each other.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import type { GameId, GameResult, HighScoreRecord } from "../types";

const STORAGE_KEY = "eliteclass-game-scores";

type Store = Record<string, Record<string, HighScoreRecord>>; // userId → gameId → record

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
    // Quota or private mode — silently ignore.
  }
}

export function useGameScores() {
  const userId = useAuthStore((s) => s.user?.id) ?? "anon";
  const [scores, setScores] = useState<Record<string, HighScoreRecord>>(() => {
    return readStore()[userId] ?? {};
  });

  // Re-read when the user changes (sign in/out)
  useEffect(() => {
    setScores(readStore()[userId] ?? {});
  }, [userId]);

  const recordResult = useCallback(
    (result: GameResult): HighScoreRecord => {
      const store = readStore();
      const userBucket = store[userId] ?? {};
      const existing = userBucket[result.gameId];
      const percent = result.maxScore > 0 ? (result.score / result.maxScore) * 100 : 0;

      const next: HighScoreRecord = existing
        ? {
            gameId: result.gameId,
            bestScore: Math.max(existing.bestScore, result.score),
            bestPercent: Math.max(existing.bestPercent, percent),
            bestDurationMs:
              result.score === result.maxScore
                ? Math.min(existing.bestDurationMs ?? Infinity, result.durationMs)
                : existing.bestDurationMs,
            playCount: existing.playCount + 1,
            lastPlayedAt: result.finishedAt,
          }
        : {
            gameId: result.gameId,
            bestScore: result.score,
            bestPercent: percent,
            bestDurationMs: result.score === result.maxScore ? result.durationMs : null,
            playCount: 1,
            lastPlayedAt: result.finishedAt,
          };

      userBucket[result.gameId] = next;
      store[userId] = userBucket;
      writeStore(store);
      setScores({ ...userBucket });
      return next;
    },
    [userId],
  );

  const getScore = useCallback(
    (gameId: GameId): HighScoreRecord | null => scores[gameId] ?? null,
    [scores],
  );

  return { scores, recordResult, getScore };
}
