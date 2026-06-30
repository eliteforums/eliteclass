// ---------------------------------------------------------------------------
// GamesHub — AI-powered brain games launcher with stats, daily challenge,
// and achievements wall
// ---------------------------------------------------------------------------

import { useState, type ComponentType } from "react";
import {
  Award,
  Brain,
  Calendar,
  CheckCircle2,
  Crown,
  Flame,
  Gamepad2,
  Lightbulb,
  Lock,
  Shuffle,
  Sparkles,
  Star,
  Target,
  Timer,
  Trophy,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useGameScores } from "../hooks/useGameScores";
import { getDailyChallenge } from "../lib/dailyChallenge";
import { ACHIEVEMENT_CATALOG } from "../lib/achievements";
import type { Difficulty, GameId } from "../types";
import { QuizRushGame } from "./QuizRushGame";
import { FlashcardMatchGame } from "./FlashcardMatchGame";
import { HangmanGame } from "./HangmanGame";
import { WordScrambleGame } from "./WordScrambleGame";
import { FillBlanksGame } from "./FillBlanksGame";
import { TrueFalseSpeedrunGame } from "./TrueFalseSpeedrunGame";
import { LeaderboardView } from "./LeaderboardView";

interface GameMeta {
  id: GameId;
  name: string;
  tagline: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: ComponentType<any>;
  iconClass: string;
  accentClass: string;
}

const GAMES: GameMeta[] = [
  {
    id: "quiz-rush",
    name: "Quiz Rush",
    tagline: "Timed MCQs. Speed + accuracy.",
    icon: Timer,
    iconClass: "text-amber-500",
    accentClass: "from-amber-500/15 to-orange-500/5",
  },
  {
    id: "flashcard-match",
    name: "Flashcard Match",
    tagline: "Match terms to definitions.",
    icon: Brain,
    iconClass: "text-indigo-500",
    accentClass: "from-indigo-500/15 to-violet-500/5",
  },
  {
    id: "hangman",
    name: "Hangman",
    tagline: "Guess the word, save the stickman.",
    icon: Target,
    iconClass: "text-rose-500",
    accentClass: "from-rose-500/15 to-pink-500/5",
  },
  {
    id: "word-scramble",
    name: "Word Scramble",
    tagline: "Unscramble topic terms.",
    icon: Shuffle,
    iconClass: "text-emerald-500",
    accentClass: "from-emerald-500/15 to-teal-500/5",
  },
  {
    id: "fill-blanks",
    name: "Fill the Blanks",
    tagline: "Complete the sentence.",
    icon: Lightbulb,
    iconClass: "text-yellow-500",
    accentClass: "from-yellow-500/15 to-amber-500/5",
  },
  {
    id: "true-false-speedrun",
    name: "T/F Speedrun",
    tagline: "60 seconds. Fast calls only.",
    icon: Zap,
    iconClass: "text-cyan-500",
    accentClass: "from-cyan-500/15 to-blue-500/5",
  },
];

const GAME_BY_ID: Record<GameId, GameMeta> = Object.fromEntries(
  GAMES.map((g) => [g.id, g]),
) as Record<GameId, GameMeta>;

function formatDateLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function GamesHub() {
  const [active, setActive] = useState<GameId | null>(null);
  const [dailyMode, setDailyMode] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const {
    progress,
    highScores,
    levelInfo,
    getScore,
    wasDailyChallengeCompletedToday,
  } = useGameScores();

  // Per-result leaderboard writes happen inside useGameScores.recordResult.
  // No separate sync needed — game_scores is the source of truth.

  const daily = getDailyChallenge();
  const dailyDone = wasDailyChallengeCompletedToday();
  const dailyGameMeta = GAME_BY_ID[daily.gameId];
  const DailyIcon = dailyGameMeta.icon;

  const openGame = (id: GameId, asDailyChallenge = false) => {
    setActive(id);
    setDailyMode(asDailyChallenge);
  };
  const close = () => {
    setActive(null);
    setDailyMode(false);
  };

  const totalAchievements = ACHIEVEMENT_CATALOG.length;
  const unlockedAchievements = Object.values(progress.achievements).filter(
    (v) => v !== null,
  ).length;

  const forcedConfig =
    dailyMode && active === daily.gameId
      ? { topic: daily.topic, difficulty: daily.difficulty as Difficulty, isDailyChallenge: true }
      : undefined;

  return (
    <TooltipProvider delayDuration={250}>
      <section className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Gamepad2 className="size-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Brain Games</h2>
          <Badge variant="secondary" className="gap-1">
            <Zap className="size-3" />
            AI-powered
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground -mt-3">
          Pick a topic, pick a game. Groq AI generates fresh questions every time.
        </p>

        {/* ── Player Stats Banner ─────────────────────────────────────── */}
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-xl bg-primary/15 flex items-center justify-center font-bold text-primary text-lg tabular-nums">
                  {levelInfo.level}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Level</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {levelInfo.current} / {levelInfo.needed} XP
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="gap-1.5 px-3 py-1.5 cursor-default">
                      <Flame className="size-3.5 text-orange-500" />
                      <span className="tabular-nums">{progress.dailyStreak}-day streak</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Longest: {progress.longestStreak} days
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="gap-1.5 px-3 py-1.5 cursor-default">
                      <Sparkles className="size-3.5 text-primary" />
                      <span className="tabular-nums">{progress.xp} XP</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Total plays: {progress.totalPlays} · Perfects: {progress.totalPerfects}
                  </TooltipContent>
                </Tooltip>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAchievementsOpen(true)}
                  className="gap-1.5"
                >
                  <Trophy className="size-3.5 text-amber-500" />
                  <span className="tabular-nums">
                    {unlockedAchievements}/{totalAchievements}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLeaderboardOpen(true)}
                  className="gap-1.5"
                >
                  <Crown className="size-3.5 text-amber-500" />
                  Leaderboard
                </Button>
              </div>
            </div>
            <Progress value={levelInfo.percent} className="h-1.5" />
          </CardContent>
        </Card>

        {/* ── Daily Challenge ─────────────────────────────────────────── */}
        <Card
          onClick={() => !dailyDone && openGame(daily.gameId, true)}
          className={cn(
            "overflow-hidden cursor-pointer group transition-all duration-300 rounded-2xl",
            "border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-background",
            !dailyDone && "hover:shadow-xl hover:-translate-y-0.5",
            dailyDone && "cursor-default opacity-70",
          )}
        >
          <CardContent className="p-5 flex items-center gap-4 flex-wrap sm:flex-nowrap">
            <div className="size-12 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <Calendar className="size-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-700 dark:text-amber-300">
                  <Star className="size-3" />
                  Today's Challenge
                </Badge>
                <span className="text-xs text-muted-foreground">{formatDateLabel()}</span>
                {dailyDone && (
                  <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                    <CheckCircle2 className="size-3" />
                    Completed
                  </Badge>
                )}
              </div>
              <p className="font-semibold text-base">
                <span className="inline-flex items-center gap-1.5">
                  <DailyIcon className={cn("size-4", dailyGameMeta.iconClass)} />
                  {dailyGameMeta.name}
                </span>
                <span className="text-muted-foreground font-normal"> · {daily.topic}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {daily.difficulty} difficulty · Double XP if completed
              </p>
            </div>
            {!dailyDone && (
              <Button size="sm" className="shrink-0 gap-1.5">
                <Star className="size-3.5" />
                Play
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ── Game Cards ──────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((game) => {
            const Icon = game.icon;
            const high = getScore(game.id);
            return (
              <Card
                key={game.id}
                onClick={() => openGame(game.id, false)}
                className={cn(
                  "cursor-pointer group overflow-hidden border-border/50 transition-all duration-300 rounded-2xl",
                  "hover:shadow-xl hover:-translate-y-1",
                )}
              >
                <div className={cn("h-2 bg-gradient-to-r", game.accentClass)} />
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div
                      className={cn(
                        "size-12 rounded-xl flex items-center justify-center bg-gradient-to-br",
                        game.accentClass,
                      )}
                    >
                      <Icon className={cn("size-6", game.iconClass)} />
                    </div>
                    {high && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Award className="size-3" />
                        Best {high.bestScore}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-base text-foreground group-hover:text-primary transition-colors">
                      {game.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{game.tagline}</p>
                  </div>
                  {high && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Played {high.playCount}× · Best {Math.round(high.bestPercent)}%
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── Active Game Dialog ──────────────────────────────────────── */}
        <Dialog open={active !== null} onOpenChange={(v) => !v && close()}>
          <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
            <DialogTitle className="sr-only">
              {active ? GAME_BY_ID[active]?.name : "Game"}
            </DialogTitle>
            {active === "quiz-rush" && <QuizRushGame onClose={close} forcedConfig={forcedConfig} />}
            {active === "flashcard-match" && <FlashcardMatchGame onClose={close} forcedConfig={forcedConfig} />}
            {active === "hangman" && <HangmanGame onClose={close} forcedConfig={forcedConfig} />}
            {active === "word-scramble" && <WordScrambleGame onClose={close} forcedConfig={forcedConfig} />}
            {active === "fill-blanks" && <FillBlanksGame onClose={close} forcedConfig={forcedConfig} />}
            {active === "true-false-speedrun" && <TrueFalseSpeedrunGame onClose={close} forcedConfig={forcedConfig} />}
          </DialogContent>
        </Dialog>

        {/* ── Achievements Wall ───────────────────────────────────────── */}
        <Dialog open={achievementsOpen} onOpenChange={setAchievementsOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="size-5 text-amber-500" />
                Achievements
              </DialogTitle>
              <DialogDescription>
                {unlockedAchievements} of {totalAchievements} unlocked
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 sm:grid-cols-2">
              {ACHIEVEMENT_CATALOG.map((a) => {
                const unlockedAt = progress.achievements[a.id];
                const unlocked = unlockedAt !== null && unlockedAt !== undefined;
                return (
                  <div
                    key={a.id}
                    className={cn(
                      "rounded-xl border p-3 flex items-start gap-3 transition-colors",
                      unlocked
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-border/50 opacity-60",
                    )}
                  >
                    <div
                      className={cn(
                        "size-9 rounded-lg flex items-center justify-center shrink-0",
                        unlocked ? "bg-amber-500/15" : "bg-muted",
                      )}
                    >
                      {unlocked ? (
                        <Trophy className="size-4 text-amber-500" />
                      ) : (
                        <Lock className="size-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{a.name}</p>
                      <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                        {a.description}
                      </p>
                      {unlocked && (
                        <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                          Unlocked {new Date(unlockedAt as number).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40">
              <Stat label="Total plays" value={progress.totalPlays} />
              <Stat label="Perfect runs" value={progress.totalPerfects} />
              <Stat label="Topics tried" value={progress.uniqueTopics.length} />
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Leaderboard ─────────────────────────────────────────────── */}
        <Dialog open={leaderboardOpen} onOpenChange={setLeaderboardOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogTitle className="sr-only">Leaderboard</DialogTitle>
            <LeaderboardView />
          </DialogContent>
        </Dialog>

        {/* Suppress unused variable warning — highScores already drives card badges. */}
        {void highScores}
      </section>
    </TooltipProvider>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/50 p-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
