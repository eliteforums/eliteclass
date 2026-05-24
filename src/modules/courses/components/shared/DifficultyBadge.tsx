// ---------------------------------------------------------------------------
// DifficultyBadge — colour-coded badge for LMS course difficulty levels
// ---------------------------------------------------------------------------

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LmsDifficulty } from "@/types";

const CONFIG: Record<LmsDifficulty, { label: string; className: string }> = {
  beginner: {
    label: "Beginner",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  },
  intermediate: {
    label: "Intermediate",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  },
  advanced: {
    label: "Advanced",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  },
  expert: {
    label: "Expert",
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  },
};

interface DifficultyBadgeProps {
  difficulty: LmsDifficulty;
  className?: string;
}

export function DifficultyBadge({ difficulty, className }: DifficultyBadgeProps) {
  const config = CONFIG[difficulty] ?? CONFIG.beginner;

  return (
    <Badge variant="outline" className={cn("font-medium capitalize", config.className, className)}>
      {config.label}
    </Badge>
  );
}
