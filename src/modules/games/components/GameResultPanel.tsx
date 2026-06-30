// ---------------------------------------------------------------------------
// GameResultPanel — end-of-game summary used by every game
// ---------------------------------------------------------------------------

import { Award, RotateCcw, Trophy, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GameResult, HighScoreRecord } from "../types";

export interface GameResultPanelProps {
  result: GameResult;
  highScore?: HighScoreRecord | null;
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
  onPlayAgain,
  onClose,
}: GameResultPanelProps) {
  const percent = result.maxScore > 0 ? (result.score / result.maxScore) * 100 : 0;
  const isNewHigh =
    highScore && highScore.bestScore === result.score && highScore.playCount === 1
      ? true
      : highScore?.bestScore === result.score && result.score > 0;

  const grade =
    percent >= 90 ? "Outstanding" : percent >= 70 ? "Great" : percent >= 50 ? "Good" : "Keep practicing";

  return (
    <div className="space-y-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-20 rounded-full bg-gradient-to-br from-primary/20 to-blue-500/20 flex items-center justify-center">
          <Trophy className="size-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">{grade}!</h2>
        <p className="text-muted-foreground text-sm">
          You finished {result.topic} on {result.difficulty} difficulty.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border/60 p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Score</p>
          <p className="text-2xl font-bold tabular-nums">
            {result.score}
            <span className="text-base text-muted-foreground">/{result.maxScore}</span>
          </p>
        </div>
        <div className="rounded-xl border border-border/60 p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Accuracy</p>
          <p className="text-2xl font-bold tabular-nums">{Math.round(percent)}%</p>
        </div>
        <div className="rounded-xl border border-border/60 p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Time</p>
          <p className="text-2xl font-bold tabular-nums">{formatDuration(result.durationMs)}</p>
        </div>
      </div>

      {highScore && (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2 text-left">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Award className="size-3.5" />
              Best score
            </span>
            <span className="font-semibold tabular-nums">{highScore.bestScore}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Zap className="size-3.5" />
              Total plays
            </span>
            <span className="font-semibold tabular-nums">{highScore.playCount}</span>
          </div>
          {isNewHigh && result.score > 0 && (
            <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
              New personal best!
            </Badge>
          )}
        </div>
      )}

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
