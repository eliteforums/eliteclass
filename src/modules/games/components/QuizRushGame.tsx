// ---------------------------------------------------------------------------
// Quiz Rush — Timed rapid-fire MCQ game
// ---------------------------------------------------------------------------
// AI generates N questions on a topic. Each question has 12s on the clock.
// Time-based bonus + streak bonus reward speed and accuracy.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock, Flame, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { generateQuizQuestions } from "../services/gameAI.service";
import { useGameScores } from "../hooks/useGameScores";
import type { Difficulty, GameResult, QuizQuestion } from "../types";
import { GameSetupPanel } from "./GameSetupPanel";
import { GameResultPanel } from "./GameResultPanel";

const PER_QUESTION_MS = 12_000;
const TIME_BONUS_POINTS = 5; // up to +5 per question for speed
const STREAK_BONUS_POINTS = 2; // +2 every 3 in a row

type Stage = "setup" | "playing" | "done";

export function QuizRushGame({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<Stage>("setup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(PER_QUESTION_MS);
  const [picked, setPicked] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState(0);

  const tickRef = useRef<number | null>(null);
  const { recordResult, getScore } = useGameScores();

  const current = questions[index];
  const maxScore = useMemo(() => {
    return questions.length * (10 + TIME_BONUS_POINTS) + Math.floor(questions.length / 3) * STREAK_BONUS_POINTS;
  }, [questions.length]);

  const handleStart = useCallback(
    async (config: { topic: string; difficulty: Difficulty; count: number }) => {
      setLoading(true);
      setError(null);
      try {
        const qs = await generateQuizQuestions(config.topic, config.difficulty, config.count);
        if (qs.length === 0) throw new Error("Got no questions. Try a different topic.");
        setQuestions(qs);
        setTopic(config.topic);
        setDifficulty(config.difficulty);
        setIndex(0);
        setScore(0);
        setStreak(0);
        setBestStreak(0);
        setPicked(null);
        setTimeLeft(PER_QUESTION_MS);
        setStartedAt(Date.now());
        setStage("playing");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the quiz.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Per-question timer
  useEffect(() => {
    if (stage !== "playing" || picked !== null) return;
    const startedTickAt = Date.now();
    const startTimeLeft = timeLeft;
    tickRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedTickAt;
      const remaining = Math.max(0, startTimeLeft - elapsed);
      setTimeLeft(remaining);
      if (remaining === 0) {
        if (tickRef.current) window.clearInterval(tickRef.current);
        setPicked(-1); // timeout marker
      }
    }, 100);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, index, picked]);

  const pickOption = useCallback(
    (i: number) => {
      if (picked !== null || !current) return;
      setPicked(i);
      const correct = i === current.correctIndex;
      const timeBonus = Math.round((timeLeft / PER_QUESTION_MS) * TIME_BONUS_POINTS);
      if (correct) {
        const newStreak = streak + 1;
        const streakBonus = newStreak % 3 === 0 ? STREAK_BONUS_POINTS : 0;
        setScore((s) => s + 10 + timeBonus + streakBonus);
        setStreak(newStreak);
        setBestStreak((b) => Math.max(b, newStreak));
      } else {
        setStreak(0);
      }
    },
    [current, picked, streak, timeLeft],
  );

  const next = useCallback(() => {
    if (index + 1 >= questions.length) {
      const result: GameResult = {
        gameId: "quiz-rush",
        topic,
        difficulty,
        score,
        maxScore,
        durationMs: Date.now() - startedAt,
        finishedAt: Date.now(),
      };
      recordResult(result);
      setStage("done");
    } else {
      setIndex((i) => i + 1);
      setPicked(null);
      setTimeLeft(PER_QUESTION_MS);
    }
  }, [index, questions.length, score, maxScore, topic, difficulty, startedAt, recordResult]);

  if (stage === "setup") {
    return (
      <GameSetupPanel
        title="Quiz Rush"
        description="Answer fast, build streaks, beat the clock. Speed and accuracy both score."
        defaultCount={10}
        countMin={5}
        countMax={20}
        countLabel="Questions"
        loading={loading}
        error={error}
        onStart={handleStart}
      />
    );
  }

  if (stage === "done") {
    const result: GameResult = {
      gameId: "quiz-rush",
      topic,
      difficulty,
      score,
      maxScore,
      durationMs: Date.now() - startedAt,
      finishedAt: Date.now(),
    };
    return (
      <GameResultPanel
        result={result}
        highScore={getScore("quiz-rush")}
        onPlayAgain={() => setStage("setup")}
        onClose={onClose}
      />
    );
  }

  if (!current) return null;

  const showFeedback = picked !== null;
  const correctIdx = current.correctIndex;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {index + 1} / {questions.length}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Flame className="size-3" />
            Streak {streak}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-sm tabular-nums">
          <Clock className="size-4 text-muted-foreground" />
          <span>{Math.ceil(timeLeft / 1000)}s</span>
          <span className="font-semibold text-primary ml-2">{score} pts</span>
        </div>
      </div>

      <Progress
        value={(timeLeft / PER_QUESTION_MS) * 100}
        className={cn(
          "h-1.5",
          timeLeft < 3000 ? "[&>div]:bg-rose-500" : "[&>div]:bg-primary",
        )}
      />

      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
        <p className="text-lg font-semibold leading-snug">{current.question}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {current.options.map((opt, i) => {
            const isCorrect = showFeedback && i === correctIdx;
            const isPicked = showFeedback && i === picked;
            const isWrong = isPicked && !isCorrect;
            return (
              <button
                key={i}
                onClick={() => pickOption(i)}
                disabled={showFeedback}
                className={cn(
                  "w-full text-left rounded-xl border px-4 py-3 transition-all duration-150",
                  "hover:border-primary hover:bg-primary/5",
                  !showFeedback && "border-border/60",
                  isCorrect && "border-emerald-500 bg-emerald-500/10",
                  isWrong && "border-rose-500 bg-rose-500/10",
                  showFeedback && !isCorrect && !isPicked && "opacity-60",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-6 rounded-full border flex items-center justify-center text-xs font-bold",
                      isCorrect && "bg-emerald-500 text-white border-emerald-500",
                      isWrong && "bg-rose-500 text-white border-rose-500",
                    )}
                  >
                    {isCorrect ? <Check className="size-3.5" /> : isWrong ? <X className="size-3.5" /> : String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-sm">{opt}</span>
                </span>
              </button>
            );
          })}
        </div>

        {showFeedback && current.explanation && (
          <div className="rounded-lg bg-muted/40 border border-border/40 p-3 text-sm">
            <p className="font-medium mb-1">Explanation</p>
            <p className="text-muted-foreground">{current.explanation}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Best streak {bestStreak}</p>
        {showFeedback && (
          <Button onClick={next} size="lg">
            {index + 1 >= questions.length ? "See results" : "Next question"}
          </Button>
        )}
      </div>
    </div>
  );
}
