// ---------------------------------------------------------------------------
// Hangman — guess the word
// ---------------------------------------------------------------------------
// AI picks topic-relevant words. Player has 6 wrong guesses before the round
// is lost. Score = correct rounds * 10 + remaining lives bonus.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lightbulb, RotateCcw, Skull } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateHangmanWords } from "../services/gameAI.service";
import { useGameScores } from "../hooks/useGameScores";
import type { AwardedRewards, Difficulty, GameResult, HangmanWord } from "../types";
import { GameSetupPanel, type SetupConfig } from "./GameSetupPanel";
import { GameResultPanel } from "./GameResultPanel";

const MAX_WRONG = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type Stage = "setup" | "playing" | "done";

export function HangmanGame({
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
  const [words, setWords] = useState<HangmanWord[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState(0);
  const [score, setScore] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [roundState, setRoundState] = useState<"playing" | "won" | "lost">("playing");
  const [rewards, setRewards] = useState<AwardedRewards | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const { recordResult, getScore, progress } = useGameScores();

  const current = words[roundIndex];
  const wordChars = useMemo(() => (current ? current.word.split("") : []), [current]);
  const masked = useMemo(
    () => wordChars.map((c) => (guessed.has(c) ? c : "_")),
    [wordChars, guessed],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleStart = useCallback(
    async (config: SetupConfig) => {
      setLoading(true);
      setError(null);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const ws = await generateHangmanWords(
          config.topic,
          config.difficulty,
          config.count,
          { signal: controller.signal },
        );
        if (ws.length === 0) throw new Error("Got no words. Try a different topic.");
        setWords(ws);
        setTopic(config.topic);
        setDifficulty(config.difficulty);
        setIsDaily(!!forcedConfig?.isDailyChallenge);
        setRoundIndex(0);
        setGuessed(new Set());
        setWrong(0);
        setScore(0);
        setRoundState("playing");
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

  const guess = useCallback(
    (letter: string) => {
      if (!current || roundState !== "playing" || guessed.has(letter)) return;
      const nextGuessed = new Set(guessed);
      nextGuessed.add(letter);
      setGuessed(nextGuessed);

      const correct = wordChars.includes(letter);
      if (!correct) setWrong((w) => w + 1);

      const won = wordChars.every((c) => nextGuessed.has(c));
      const lost = !correct && wrong + 1 >= MAX_WRONG;
      if (won) {
        setRoundState("won");
        const livesBonus = (MAX_WRONG - wrong) * 2;
        setScore((s) => s + 10 + livesBonus);
      } else if (lost) {
        setRoundState("lost");
      }
    },
    [current, guessed, roundState, wordChars, wrong],
  );

  const nextRound = useCallback(() => {
    if (roundIndex + 1 >= words.length) {
      const result: GameResult = {
        gameId: "hangman",
        topic,
        difficulty,
        score,
        maxScore: words.length * (10 + MAX_WRONG * 2),
        durationMs: Date.now() - startedAt,
        finishedAt: Date.now(),
        isDailyChallenge: isDaily,
      };
      const awarded = recordResult(result);
      setRewards(awarded);
      setStage("done");
      return;
    }
    setRoundIndex((i) => i + 1);
    setGuessed(new Set());
    setWrong(0);
    setRoundState("playing");
  }, [roundIndex, words.length, score, topic, difficulty, isDaily, startedAt, recordResult]);

  if (stage === "setup") {
    return (
      <GameSetupPanel
        title="Hangman"
        description="Classic word-guessing game with AI-picked topic words. 6 wrong guesses ends the round."
        defaultCount={5}
        countMin={3}
        countMax={10}
        countLabel="Rounds"
        loading={loading}
        error={error}
        onStart={handleStart}
        forcedConfig={forcedConfig}
      />
    );
  }

  if (stage === "done") {
    const result: GameResult = {
      gameId: "hangman",
      topic,
      difficulty,
      score,
      maxScore: words.length * (10 + MAX_WRONG * 2),
      durationMs: Date.now() - startedAt,
      finishedAt: Date.now(),
      isDailyChallenge: isDaily,
    };
    return (
      <GameResultPanel
        result={result}
        highScore={getScore("hangman")}
        rewards={rewards}
        progress={progress}
        onPlayAgain={() => setStage("setup")}
        onClose={onClose}
      />
    );
  }

  if (!current) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">
            Round {roundIndex + 1} / {words.length}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Skull className="size-3" />
            {wrong} / {MAX_WRONG}
          </Badge>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Score </span>
          <span className="font-semibold text-primary tabular-nums">{score}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lightbulb className="size-4 text-amber-500" />
          <span className="font-medium">Hint:</span>
          <span>{current.hint}</span>
        </div>

        <div className="flex justify-center flex-wrap gap-2">
          {masked.map((char, i) => (
            <div
              key={i}
              className={cn(
                "size-10 sm:size-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold uppercase tabular-nums",
                char === "_"
                  ? "border-border bg-card text-transparent"
                  : "border-primary/40 bg-primary/10 text-primary",
              )}
            >
              {char === "_" ? "·" : char}
            </div>
          ))}
        </div>

        <HangmanFigure wrong={wrong} />

        {roundState === "playing" ? (
          // Explicit 7-column grid on mobile, 13-column on sm+ using arbitrary
          // value class so Tailwind doesn't drop sm:grid-cols-13 (not in core).
          <div className="grid grid-cols-7 sm:grid-cols-[repeat(13,minmax(0,1fr))] gap-1.5">
            {ALPHABET.map((l) => {
              const tried = guessed.has(l);
              const isInWord = tried && wordChars.includes(l);
              return (
                <button
                  key={l}
                  onClick={() => guess(l)}
                  disabled={tried}
                  className={cn(
                    "size-9 rounded-lg border text-sm font-semibold transition-all",
                    !tried && "hover:bg-primary hover:text-primary-foreground hover:border-primary",
                    tried && isInWord && "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300",
                    tried && !isInWord && "bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-400 opacity-60",
                  )}
                >
                  {l}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-center space-y-3">
            <p className="font-semibold">
              {roundState === "won" ? "Nice! You got it." : "Round lost."}
            </p>
            <p className="text-sm text-muted-foreground">
              The word was <span className="font-bold text-foreground">{current.word}</span>
            </p>
            <Button onClick={nextRound} className="w-full sm:w-auto">
              {roundIndex + 1 >= words.length ? "Finish game" : "Next round"}
            </Button>
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

function HangmanFigure({ wrong }: { wrong: number }) {
  return (
    <div className="flex justify-center">
      <svg viewBox="0 0 120 140" className="w-32 h-36 text-foreground/80">
        <line x1="10" y1="130" x2="80" y2="130" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <line x1="30" y1="130" x2="30" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <line x1="30" y1="20" x2="80" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <line x1="80" y1="20" x2="80" y2="35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        {wrong >= 1 && <circle cx="80" cy="45" r="10" stroke="currentColor" strokeWidth="2.5" fill="none" />}
        {wrong >= 2 && <line x1="80" y1="55" x2="80" y2="90" stroke="currentColor" strokeWidth="2.5" />}
        {wrong >= 3 && <line x1="80" y1="65" x2="65" y2="80" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />}
        {wrong >= 4 && <line x1="80" y1="65" x2="95" y2="80" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />}
        {wrong >= 5 && <line x1="80" y1="90" x2="65" y2="110" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />}
        {wrong >= 6 && <line x1="80" y1="90" x2="95" y2="110" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />}
      </svg>
    </div>
  );
}
