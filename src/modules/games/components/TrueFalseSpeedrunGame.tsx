// ---------------------------------------------------------------------------
// True / False Speedrun — Beat the clock answering T/F statements
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { Check, Clock, RotateCcw, X, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { generateTrueFalse } from "../services/gameAI.service";
import { useGameScores } from "../hooks/useGameScores";
import type { Difficulty, GameResult, TrueFalseStatement } from "../types";
import { GameSetupPanel } from "./GameSetupPanel";
import { GameResultPanel } from "./GameResultPanel";

const TOTAL_TIME_MS = 60_000; // 60 seconds total

type Stage = "setup" | "playing" | "done";

export function TrueFalseSpeedrunGame({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<Stage>("setup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [statements, setStatements] = useState<TrueFalseStatement[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME_MS);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [startedAt, setStartedAt] = useState(0);

  const { recordResult, getScore } = useGameScores();
  const current = statements[index];

  // Global countdown
  useEffect(() => {
    if (stage !== "playing") return;
    const start = Date.now();
    const startTimeLeft = timeLeft;
    const id = window.setInterval(() => {
      const remaining = Math.max(0, startTimeLeft - (Date.now() - start));
      setTimeLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(id);
      }
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // End when time runs out
  useEffect(() => {
    if (stage === "playing" && timeLeft === 0) {
      const result: GameResult = {
        gameId: "true-false-speedrun",
        topic,
        difficulty,
        score,
        maxScore: statements.length * 10,
        durationMs: TOTAL_TIME_MS,
        finishedAt: Date.now(),
      };
      recordResult(result);
      setStage("done");
    }
  }, [timeLeft, stage, score, statements.length, topic, difficulty, recordResult]);

  // End when all statements answered
  useEffect(() => {
    if (stage === "playing" && index >= statements.length && statements.length > 0) {
      const result: GameResult = {
        gameId: "true-false-speedrun",
        topic,
        difficulty,
        score,
        maxScore: statements.length * 10,
        durationMs: Date.now() - startedAt,
        finishedAt: Date.now(),
      };
      recordResult(result);
      setStage("done");
    }
  }, [index, statements.length, stage, score, topic, difficulty, startedAt, recordResult]);

  const handleStart = useCallback(
    async (config: { topic: string; difficulty: Difficulty; count: number }) => {
      setLoading(true);
      setError(null);
      try {
        const items = await generateTrueFalse(config.topic, config.difficulty, config.count);
        if (items.length === 0) throw new Error("Got no statements. Try a different topic.");
        setStatements(items);
        setTopic(config.topic);
        setDifficulty(config.difficulty);
        setIndex(0);
        setScore(0);
        setStreak(0);
        setBestStreak(0);
        setTimeLeft(TOTAL_TIME_MS);
        setFeedback(null);
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

  const answer = useCallback(
    (guess: boolean) => {
      if (!current || timeLeft === 0) return;
      const correct = guess === current.isTrue;
      if (correct) {
        const newStreak = streak + 1;
        const streakBonus = newStreak >= 3 ? Math.min(5, Math.floor(newStreak / 3)) : 0;
        setScore((s) => s + 10 + streakBonus);
        setStreak(newStreak);
        setBestStreak((b) => Math.max(b, newStreak));
        setFeedback("correct");
      } else {
        setStreak(0);
        setFeedback("wrong");
      }
      window.setTimeout(() => {
        setFeedback(null);
        setIndex((i) => i + 1);
      }, 280);
    },
    [current, streak, timeLeft],
  );

  if (stage === "setup") {
    return (
      <GameSetupPanel
        title="True / False Speedrun"
        description="60 seconds. As many statements as you can. Streaks score extra."
        defaultCount={20}
        countMin={10}
        countMax={30}
        countLabel="Statements"
        loading={loading}
        error={error}
        onStart={handleStart}
      />
    );
  }

  if (stage === "done") {
    const result: GameResult = {
      gameId: "true-false-speedrun",
      topic,
      difficulty,
      score,
      maxScore: statements.length * 10,
      durationMs: Math.min(TOTAL_TIME_MS, Date.now() - startedAt),
      finishedAt: Date.now(),
    };
    return (
      <GameResultPanel
        result={result}
        highScore={getScore("true-false-speedrun")}
        onPlayAgain={() => setStage("setup")}
        onClose={onClose}
      />
    );
  }

  if (!current) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {index + 1} / {statements.length}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Zap className="size-3" />
            Streak {streak}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums flex items-center gap-1">
            <Clock className="size-4 text-muted-foreground" />
            {Math.ceil(timeLeft / 1000)}s
          </span>
          <span className="text-sm font-semibold text-primary tabular-nums">{score} pts</span>
        </div>
      </div>

      <Progress
        value={(timeLeft / TOTAL_TIME_MS) * 100}
        className={cn(
          "h-1.5",
          timeLeft < 10000 ? "[&>div]:bg-rose-500" : "[&>div]:bg-primary",
        )}
      />

      <div
        className={cn(
          "rounded-2xl border-2 bg-card p-8 min-h-[200px] flex items-center justify-center text-center transition-colors duration-150",
          feedback === "correct" && "border-emerald-500 bg-emerald-500/5",
          feedback === "wrong" && "border-rose-500 bg-rose-500/5",
          !feedback && "border-border/60",
        )}
      >
        <p className="text-xl font-semibold leading-relaxed">{current.statement}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          size="lg"
          variant="outline"
          onClick={() => answer(true)}
          disabled={!!feedback}
          className="h-20 text-lg gap-2 border-emerald-500/40 hover:bg-emerald-500/10 hover:border-emerald-500"
        >
          <Check className="size-6 text-emerald-500" />
          True
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => answer(false)}
          disabled={!!feedback}
          className="h-20 text-lg gap-2 border-rose-500/40 hover:bg-rose-500/10 hover:border-rose-500"
        >
          <X className="size-6 text-rose-500" />
          False
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Best streak {bestStreak}</p>
        <Button variant="outline" size="sm" onClick={() => setStage("setup")} className="gap-2">
          <RotateCcw className="size-3.5" />
          Restart
        </Button>
      </div>
    </div>
  );
}
