// ---------------------------------------------------------------------------
// Word Scramble — unscramble topic-relevant terms
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock, Lightbulb, RotateCcw, Shuffle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { generateScramble } from "../services/gameAI.service";
import { useGameScores } from "../hooks/useGameScores";
import type { Difficulty, GameResult, ScrambleEntry } from "../types";
import { GameSetupPanel } from "./GameSetupPanel";
import { GameResultPanel } from "./GameResultPanel";

const ROUND_MS = 45_000;

type Stage = "setup" | "playing" | "done";

function scramble(word: string): string {
  const chars = word.split("");
  for (let attempt = 0; attempt < 5; attempt++) {
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const out = chars.join("");
    if (out !== word) return out;
  }
  return chars.reverse().join("");
}

export function WordScrambleGame({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<Stage>("setup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [entries, setEntries] = useState<ScrambleEntry[]>([]);
  const [scrambled, setScrambled] = useState("");
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_MS);
  const [revealed, setRevealed] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);

  const { recordResult, getScore } = useGameScores();
  const current = entries[index];
  const maxScore = entries.length * 20;

  // Timer per round
  useEffect(() => {
    if (stage !== "playing" || revealed) return;
    const start = Date.now();
    const tick = window.setInterval(() => {
      const remaining = Math.max(0, ROUND_MS - (Date.now() - start));
      setTimeLeft(remaining);
      if (remaining === 0) {
        setRevealed(true);
        window.clearInterval(tick);
      }
    }, 200);
    return () => window.clearInterval(tick);
  }, [stage, index, revealed]);

  const handleStart = useCallback(
    async (config: { topic: string; difficulty: Difficulty; count: number }) => {
      setLoading(true);
      setError(null);
      try {
        const items = await generateScramble(config.topic, config.difficulty, config.count);
        if (items.length === 0) throw new Error("Got no words. Try a different topic.");
        setEntries(items);
        setScrambled(scramble(items[0].word));
        setTopic(config.topic);
        setDifficulty(config.difficulty);
        setIndex(0);
        setInput("");
        setScore(0);
        setTimeLeft(ROUND_MS);
        setRevealed(false);
        setHintsUsed(0);
        setStartedAt(Date.now());
        setStage("playing");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the game.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const submit = useCallback(() => {
    if (!current || revealed) return;
    const guess = input.trim().toUpperCase();
    if (!guess) return;
    if (guess === current.word) {
      const timeBonus = Math.round((timeLeft / ROUND_MS) * 10);
      const hintPenalty = hintsUsed * 5;
      setScore((s) => s + Math.max(5, 10 + timeBonus - hintPenalty));
    }
    setRevealed(true);
  }, [current, input, revealed, timeLeft, hintsUsed]);

  const next = useCallback(() => {
    if (index + 1 >= entries.length) {
      const result: GameResult = {
        gameId: "word-scramble",
        topic,
        difficulty,
        score,
        maxScore,
        durationMs: Date.now() - startedAt,
        finishedAt: Date.now(),
      };
      recordResult(result);
      setStage("done");
      return;
    }
    const nextIdx = index + 1;
    setIndex(nextIdx);
    setScrambled(scramble(entries[nextIdx].word));
    setInput("");
    setTimeLeft(ROUND_MS);
    setRevealed(false);
    setHintsUsed(0);
  }, [index, entries, score, maxScore, topic, difficulty, startedAt, recordResult]);

  const useHint = useCallback(() => {
    if (!current || revealed) return;
    setHintsUsed((h) => h + 1);
    // Reveal the first unrevealed letter as a placeholder in the input
    setInput((prev) => {
      const target = current.word;
      let revealedSoFar = prev.toUpperCase();
      // pad to full length
      while (revealedSoFar.length < target.length) revealedSoFar += "?";
      const arr = revealedSoFar.split("");
      const firstUnknown = arr.findIndex((c, i) => c !== target[i]);
      if (firstUnknown >= 0) {
        arr[firstUnknown] = target[firstUnknown];
      }
      return arr.join("").replace(/\?+$/, "");
    });
  }, [current, revealed]);

  const finalResult: GameResult = useMemo(
    () => ({
      gameId: "word-scramble",
      topic,
      difficulty,
      score,
      maxScore,
      durationMs: Date.now() - startedAt,
      finishedAt: Date.now(),
    }),
    [topic, difficulty, score, maxScore, startedAt],
  );

  if (stage === "setup") {
    return (
      <GameSetupPanel
        title="Word Scramble"
        description="Unscramble the topic term before the timer runs out. Use hints sparingly — they cost points."
        defaultCount={8}
        countMin={5}
        countMax={15}
        countLabel="Words"
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
        highScore={getScore("word-scramble")}
        onPlayAgain={() => setStage("setup")}
        onClose={onClose}
      />
    );
  }

  if (!current) return null;
  const isCorrect = revealed && input.trim().toUpperCase() === current.word;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {index + 1} / {entries.length}
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <Clock className="size-3" />
            {Math.ceil(timeLeft / 1000)}s
          </Badge>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Score </span>
          <span className="font-semibold text-primary tabular-nums">{score}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <div className="flex flex-col items-center gap-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Unscramble</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {scrambled.split("").map((c, i) => (
              <div
                key={i}
                className="size-10 sm:size-12 rounded-lg border-2 border-primary/30 bg-primary/5 flex items-center justify-center text-xl font-bold text-primary"
              >
                {c}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lightbulb className="size-4 text-amber-500" />
            <span>{current.hint}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="Your answer..."
            disabled={revealed}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            autoFocus
            className="text-lg tracking-widest uppercase font-semibold"
          />
          {revealed ? (
            <Button onClick={next} className="gap-2">
              {index + 1 >= entries.length ? "Finish" : "Next"}
            </Button>
          ) : (
            <Button onClick={submit} className="gap-2">
              <Check className="size-4" />
              Submit
            </Button>
          )}
        </div>

        {revealed && (
          <div
            className={cn(
              "rounded-lg p-3 text-sm",
              isCorrect
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                : "bg-rose-500/10 border border-rose-500/30 text-rose-900 dark:text-rose-200",
            )}
          >
            {isCorrect ? "Correct!" : `The answer was ${current.word}`}
          </div>
        )}

        {!revealed && (
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={useHint} className="gap-2">
              <Lightbulb className="size-3.5" />
              Hint (−5 pts)
            </Button>
            <span className="text-xs text-muted-foreground">Hints used: {hintsUsed}</span>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setStage("setup")} className="gap-2">
          <RotateCcw className="size-3.5" />
          Restart
        </Button>
      </div>

      {/* Reference for unused Shuffle import in icon set future-proofing */}
      <span className="hidden">
        <Shuffle />
      </span>
    </div>
  );
}
