// ---------------------------------------------------------------------------
// Flashcard Match — Memory-style match: terms ↔ definitions
// ---------------------------------------------------------------------------
// AI generates N term/definition pairs. The student flips cards two at a time
// trying to match them. Fewer moves and less time = higher score.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, RotateCcw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateFlashcards } from "../services/gameAI.service";
import { useGameScores } from "../hooks/useGameScores";
import type { Difficulty, Flashcard, GameResult } from "../types";
import { GameSetupPanel } from "./GameSetupPanel";
import { GameResultPanel } from "./GameResultPanel";

type Stage = "setup" | "playing" | "done";

interface BoardCard {
  id: string; // unique per rendered tile
  pairKey: string; // term — same on both halves of a pair
  face: "term" | "definition";
  text: string;
  matched: boolean;
  flipped: boolean;
}

function buildBoard(cards: Flashcard[]): BoardCard[] {
  const tiles: BoardCard[] = [];
  cards.forEach((c, i) => {
    tiles.push({
      id: `t-${i}`,
      pairKey: c.term,
      face: "term",
      text: c.term,
      matched: false,
      flipped: false,
    });
    tiles.push({
      id: `d-${i}`,
      pairKey: c.term,
      face: "definition",
      text: c.definition,
      matched: false,
      flipped: false,
    });
  });
  // Fisher-Yates shuffle
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

export function FlashcardMatchGame({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<Stage>("setup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [board, setBoard] = useState<BoardCard[]>([]);
  const [selected, setSelected] = useState<string[]>([]); // ids
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const totalPairs = board.length / 2;

  const { recordResult, getScore } = useGameScores();

  // Timer
  useEffect(() => {
    if (stage !== "playing") return;
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt), 250);
    return () => window.clearInterval(id);
  }, [stage, startedAt]);

  const handleStart = useCallback(
    async (config: { topic: string; difficulty: Difficulty; count: number }) => {
      setLoading(true);
      setError(null);
      try {
        const cards = await generateFlashcards(config.topic, config.difficulty, config.count);
        if (cards.length < 3) throw new Error("Not enough cards. Try a different topic.");
        setBoard(buildBoard(cards));
        setTopic(config.topic);
        setDifficulty(config.difficulty);
        setSelected([]);
        setMoves(0);
        setMatches(0);
        setStartedAt(Date.now());
        setElapsed(0);
        setStage("playing");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the game.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const flip = useCallback(
    (id: string) => {
      if (selected.length === 2) return; // mid-check
      const tile = board.find((t) => t.id === id);
      if (!tile || tile.matched || tile.flipped) return;

      const nextBoard = board.map((t) => (t.id === id ? { ...t, flipped: true } : t));
      const nextSelected = [...selected, id];
      setBoard(nextBoard);
      setSelected(nextSelected);

      if (nextSelected.length === 2) {
        const [aId, bId] = nextSelected;
        const a = nextBoard.find((t) => t.id === aId)!;
        const b = nextBoard.find((t) => t.id === bId)!;
        setMoves((m) => m + 1);
        const isMatch = a.pairKey === b.pairKey && a.face !== b.face;
        window.setTimeout(() => {
          setBoard((current) =>
            current.map((t) => {
              if (t.id === aId || t.id === bId) {
                return { ...t, matched: isMatch, flipped: isMatch };
              }
              return t;
            }),
          );
          setSelected([]);
          if (isMatch) setMatches((m) => m + 1);
        }, isMatch ? 350 : 750);
      }
    },
    [board, selected],
  );

  // Game complete?
  const completed = totalPairs > 0 && matches === totalPairs;
  useEffect(() => {
    if (stage === "playing" && completed) {
      const duration = Date.now() - startedAt;
      const perfectMoves = totalPairs; // best possible
      // Score: 10 per pair + bonus for efficiency, minus time penalty
      const efficiencyBonus = Math.max(0, (perfectMoves * 10) / Math.max(1, moves));
      const timePenalty = Math.min(20, Math.floor(duration / 5000));
      const finalScore = Math.max(
        0,
        Math.round(totalPairs * 10 + efficiencyBonus * 10 - timePenalty),
      );
      const result: GameResult = {
        gameId: "flashcard-match",
        topic,
        difficulty,
        score: finalScore,
        maxScore: totalPairs * 20,
        durationMs: duration,
        finishedAt: Date.now(),
      };
      recordResult(result);
      setStage("done");
    }
  }, [completed, stage, startedAt, totalPairs, moves, topic, difficulty, recordResult]);

  const finalResult: GameResult = useMemo(
    () => ({
      gameId: "flashcard-match",
      topic,
      difficulty,
      score: Math.round(matches * 10 + Math.max(0, (totalPairs - moves + matches) * 5)),
      maxScore: totalPairs * 20,
      durationMs: elapsed,
      finishedAt: Date.now(),
    }),
    [topic, difficulty, matches, totalPairs, moves, elapsed],
  );

  if (stage === "setup") {
    return (
      <GameSetupPanel
        title="Flashcard Match"
        description="Match terms with definitions. Fewer moves and less time gives more points."
        defaultCount={6}
        countMin={4}
        countMax={10}
        countLabel="Pairs"
        loading={loading}
        error={error}
        onStart={handleStart}
      />
    );
  }

  if (stage === "done") {
    return (
      <GameResultPanel
        result={finalResult}
        highScore={getScore("flashcard-match")}
        onPlayAgain={() => setStage("setup")}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1.5">
            <Sparkles className="size-3.5" />
            {topic}
          </Badge>
          <Badge variant="outline">
            {matches} / {totalPairs} pairs
          </Badge>
          <Badge variant="outline">{moves} moves</Badge>
        </div>
        <div className="flex items-center gap-2 text-sm tabular-nums text-muted-foreground">
          <Clock className="size-4" />
          {Math.floor(elapsed / 1000)}s
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {board.map((tile) => {
          const show = tile.flipped || tile.matched;
          return (
            <button
              key={tile.id}
              onClick={() => flip(tile.id)}
              disabled={tile.matched || selected.length === 2}
              className={cn(
                "aspect-[3/4] rounded-2xl border-2 p-3 text-left transition-all duration-200",
                "flex items-center justify-center text-center",
                show
                  ? tile.matched
                    ? "border-emerald-500 bg-emerald-500/10 cursor-default"
                    : "border-primary bg-primary/10"
                  : "border-border/60 bg-card hover:border-primary/40 hover:bg-primary/5 cursor-pointer",
              )}
            >
              {show ? (
                <span
                  className={cn(
                    "text-xs sm:text-sm",
                    tile.face === "term" ? "font-bold" : "leading-snug",
                  )}
                >
                  {tile.text}
                </span>
              ) : (
                <Sparkles className="size-6 text-muted-foreground/40" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setStage("setup")} className="gap-2">
          <RotateCcw className="size-3.5" />
          Restart
        </Button>
      </div>
    </div>
  );
}
