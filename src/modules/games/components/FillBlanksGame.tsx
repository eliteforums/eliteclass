// ---------------------------------------------------------------------------
// Fill in the Blanks — sentence completion
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Lightbulb, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { generateFillBlanks } from "../services/gameAI.service";
import { useGameScores } from "../hooks/useGameScores";
import type { AwardedRewards, Difficulty, FillBlankEntry, GameResult } from "../types";
import { GameSetupPanel, type SetupConfig } from "./GameSetupPanel";
import { GameResultPanel } from "./GameResultPanel";

type Stage = "setup" | "playing" | "done";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ");
}

export function FillBlanksGame({
  onClose,
  forcedConfig,
}: {
  onClose: () => void;
  forcedConfig?: { topic: string; difficulty: Difficulty; isDailyChallenge?: boolean };
}) {
  const [stage, setStage] = useState<Stage>("setup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [isDaily, setIsDaily] = useState(false);
  const [entries, setEntries] = useState<FillBlankEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [rewards, setRewards] = useState<AwardedRewards | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const { recordResult, getScore, progress } = useGameScores();
  const current = entries[index];
  const maxScore = entries.length * 10;

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleStart = useCallback(
    async (config: SetupConfig) => {
      setLoading(true);
      setError(null);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const items = await generateFillBlanks(
          config.topic,
          config.difficulty,
          config.count,
          { signal: controller.signal },
        );
        if (items.length === 0) throw new Error("Got no items. Try a different topic.");
        setEntries(items);
        setTopic(config.topic);
        setDifficulty(config.difficulty);
        setIsDaily(!!forcedConfig?.isDailyChallenge);
        setIndex(0);
        setInput("");
        setScore(0);
        setRevealed(false);
        setShowHint(false);
        setStartedAt(Date.now());
        setRewards(null);
        setStage("playing");
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not start the game.");
      } finally {
        setLoading(false);
      }
    },
    [forcedConfig],
  );

  const submit = useCallback(() => {
    if (!current || revealed) return;
    const guess = normalize(input);
    if (!guess) return;
    const correct = normalize(current.answer);
    if (guess === correct) {
      setScore((s) => s + (showHint ? 5 : 10));
    }
    setRevealed(true);
  }, [current, input, revealed, showHint]);

  const next = useCallback(() => {
    if (index + 1 >= entries.length) {
      const result: GameResult = {
        gameId: "fill-blanks",
        topic,
        difficulty,
        score,
        maxScore,
        durationMs: Date.now() - startedAt,
        finishedAt: Date.now(),
        isDailyChallenge: isDaily,
      };
      const awarded = recordResult(result);
      setRewards(awarded);
      setStage("done");
      return;
    }
    setIndex((i) => i + 1);
    setInput("");
    setRevealed(false);
    setShowHint(false);
  }, [index, entries.length, score, maxScore, topic, difficulty, isDaily, startedAt, recordResult]);

  const finalResult: GameResult = useMemo(
    () => ({
      gameId: "fill-blanks",
      topic,
      difficulty,
      score,
      maxScore,
      durationMs: Date.now() - startedAt,
      finishedAt: Date.now(),
      isDailyChallenge: isDaily,
    }),
    [topic, difficulty, score, maxScore, startedAt, isDaily],
  );

  if (stage === "setup") {
    return (
      <GameSetupPanel
        title="Fill in the Blanks"
        description="Complete the sentence with the missing key term. Toggle a hint for half points."
        defaultCount={8}
        countMin={5}
        countMax={15}
        countLabel="Sentences"
        loading={loading}
        error={error}
        onStart={handleStart}
        forcedConfig={forcedConfig}
      />
    );
  }

  if (stage === "done") {
    return (
      <GameResultPanel
        result={finalResult}
        highScore={getScore("fill-blanks")}
        rewards={rewards}
        progress={progress}
        onPlayAgain={() => setStage("setup")}
        onClose={onClose}
      />
    );
  }

  if (!current) return null;
  const isCorrect = revealed && normalize(input) === normalize(current.answer);
  const [before, after] = current.sentence.split("___");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="outline">
          {index + 1} / {entries.length}
        </Badge>
        <div className="text-sm">
          <span className="text-muted-foreground">Score </span>
          <span className="font-semibold text-primary tabular-nums">{score}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <p className="text-lg leading-relaxed">
          <span>{before}</span>
          <span
            className={cn(
              "inline-block min-w-[8ch] mx-1 px-2 py-0.5 rounded-md border-b-2 text-center font-bold uppercase",
              revealed
                ? isCorrect
                  ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300"
                  : "bg-rose-500/10 border-rose-500 text-rose-700 dark:text-rose-300"
                : "bg-primary/10 border-primary text-primary",
            )}
          >
            {revealed ? current.answer : input || "____"}
          </span>
          <span>{after}</span>
        </p>

        {showHint && !revealed && current.hint && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm flex items-start gap-2">
            <Lightbulb className="size-4 text-amber-500 mt-0.5" />
            <p>{current.hint}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type the missing word..."
            disabled={revealed}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            autoFocus
            className="text-base"
          />
          {revealed ? (
            <Button onClick={next}>
              {index + 1 >= entries.length ? "Finish" : "Next"}
            </Button>
          ) : (
            <Button onClick={submit} className="gap-2">
              <Check className="size-4" />
              Submit
            </Button>
          )}
        </div>

        {!revealed && current.hint && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHint(true)}
            disabled={showHint}
            className="gap-2"
          >
            <Lightbulb className="size-3.5" />
            {showHint ? "Hint shown" : "Show hint (half points)"}
          </Button>
        )}

        {revealed && (
          <div
            className={cn(
              "rounded-lg p-3 text-sm flex items-center gap-2",
              isCorrect
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                : "bg-rose-500/10 border border-rose-500/30 text-rose-900 dark:text-rose-200",
            )}
          >
            {isCorrect ? <Check className="size-4" /> : <X className="size-4" />}
            <span>
              {isCorrect ? "Correct!" : `Correct answer: ${current.answer}`}
            </span>
          </div>
        )}
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
