// ---------------------------------------------------------------------------
// GameResultPanel — end-of-game summary with XP gain, level-up,
// achievement unlocks, daily challenge bonus, and confetti for perfect runs.
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import { toast } from "sonner";
import {
  Award,
  Calendar,
  Flame,
  RotateCcw,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  xpProgressWithinLevel,
} from "../lib/achievements";
import type { AwardedRewards, GameResult, HighScoreRecord, PlayerProgress } from "../types";
import { Confetti } from "./Confetti";

export interface GameResultPanelProps {
  result: GameResult;
  highScore: HighScoreRecord | null;
  rewards: AwardedRewards | null;
  progress: PlayerProgress;
  onPlayAgain: () => void;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function GameResultPanel({
  result,
  highScore,
  rewards,
  progress,
  onPlayAgain,
  onClose,
}: GameResultPanelProps) {
  const percent = result.maxScore > 0 ? (result.score / result.maxScore) * 100 : 0;
  const isPerfect = rewards?.isPerfect ?? percent >= 99.5;
  const grade =
    percent >= 90 ? "Outstanding"
    : percent >= 70 ? "Great"
    : percent >= 50 ? "Good"
    : "Keep practicing";

  const levelInfo = xpProgressWithinLevel(progress.xp);

  // Fire toasts for level-up + achievements (once on mount).
  useEffect(() => {
    if (!rewards) return;
    if (rewards.leveledUp) {
      toast.success(`Level up — Level ${rewards.newLevel}!`, {
        description: "Keep going. New achievements unlocked at level 5, 10, 25.",
        duration: 5000,
      });
    }
    rewards.unlockedAchievements.forEach((a) => {
      toast.success(`Achievement unlocked: ${a.name}`, {
        description: a.description,
        duration: 6000,
      });
    });
    if (rewards.streakIncreased && rewards.dailyStreak >= 2) {
      toast.message(`🔥 ${rewards.dailyStreak}-day streak`, {
        description: "Come back tomorrow to keep it alive.",
        duration: 4000,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5 text-center relative">
      {isPerfect && <Confetti trigger={result.finishedAt} />}

      <div className="flex flex-col items-center gap-3">
        <div className="size-20 rounded-full bg-gradient-to-br from-primary/20 to-blue-500/20 flex items-center justify-center">
          <Trophy className="size-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">{grade}!</h2>
        <p className="text-muted-foreground text-sm">
          You finished {result.topic} on {result.difficulty} difficulty.
        </p>
        {rewards?.isDailyChallenge && (
          <Badge className="gap-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
            <Calendar className="size-3.5" />
            Daily challenge cleared — XP doubled
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-left">
        <Stat label="Score" value={`${result.score}/${result.maxScore}`} />
        <Stat label="Accuracy" value={`${Math.round(percent)}%`} />
        <Stat label="Time" value={formatDuration(result.durationMs)} />
      </div>

      {rewards && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 text-left">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5" />
              XP earned
            </span>
            <span className="font-bold text-lg tabular-nums text-primary">+{rewards.xpGain.total}</span>
          </div>
          <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1">
            <span>Base</span><span className="text-right tabular-nums">{rewards.xpGain.base}</span>
            {rewards.xpGain.difficultyBonus > 0 && (
              <>
                <span>Difficulty bonus</span>
                <span className="text-right tabular-nums">+{rewards.xpGain.difficultyBonus}</span>
              </>
            )}
            {rewards.xpGain.perfectBonus > 0 && (
              <>
                <span>Perfect bonus</span>
                <span className="text-right tabular-nums">+{rewards.xpGain.perfectBonus}</span>
              </>
            )}
            {rewards.xpGain.dailyChallengeMultiplier > 1 && (
              <>
                <span>Daily challenge ×{rewards.xpGain.dailyChallengeMultiplier}</span>
                <span className="text-right">applied</span>
              </>
            )}
          </div>
          <div className="pt-1 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Level {levelInfo.level}</span>
              <span className="text-muted-foreground tabular-nums">
                {levelInfo.current} / {levelInfo.needed} XP
              </span>
            </div>
            <Progress value={levelInfo.percent} className="h-2" />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2 text-left">
        <Row
          label={
            <span className="flex items-center gap-1.5">
              <Award className="size-3.5" />
              Best score
            </span>
          }
          value={highScore?.bestScore ?? result.score}
        />
        <Row
          label={
            <span className="flex items-center gap-1.5">
              <Flame className="size-3.5 text-orange-500" />
              Daily streak
            </span>
          }
          value={`${progress.dailyStreak} day${progress.dailyStreak === 1 ? "" : "s"}`}
        />
        <Row
          label="Total plays"
          value={progress.totalPlays}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button onClick={onPlayAgain} variant="default" size="lg" className="flex-1 gap-2">
          <RotateCcw className="size-4" />
          Play again
        </Button>
        <Button onClick={onClose} variant="outline" size="lg" className="flex-1 gap-2">
          <X className="size-4" />
          Close
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
