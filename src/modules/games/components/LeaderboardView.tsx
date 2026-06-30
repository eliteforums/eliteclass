// ---------------------------------------------------------------------------
// LeaderboardView — institute-scoped competitive leaderboard
// ---------------------------------------------------------------------------
// Three tabs:
//   - XP (with period selector: All / Month / Week / Today)
//   - Per-game best (game selector)
//   - Streak (current daily streak ranking)
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import {
  Crown,
  Flame,
  Loader2,
  Medal,
  RefreshCw,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  fetchLeaderboard,
  fetchStreakLeaderboard,
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type StreakLeaderboardEntry,
} from "../services/gameLeaderboard.service";
import type { GameId } from "../types";

const GAME_OPTIONS: { value: GameId | "all"; label: string }[] = [
  { value: "all", label: "All games" },
  { value: "quiz-rush", label: "Quiz Rush" },
  { value: "flashcard-match", label: "Flashcard Match" },
  { value: "hangman", label: "Hangman" },
  { value: "word-scramble", label: "Word Scramble" },
  { value: "fill-blanks", label: "Fill the Blanks" },
  { value: "true-false-speedrun", label: "T/F Speedrun" },
];

const PERIOD_OPTIONS: { value: LeaderboardPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "all", label: "All time" },
];

type Mode = "xp" | "streak";

export function LeaderboardView() {
  const [mode, setMode] = useState<Mode>("xp");
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [game, setGame] = useState<GameId | "all">("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [streakEntries, setStreakEntries] = useState<StreakLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "xp") {
        const rows = await fetchLeaderboard(
          period,
          game === "all" ? null : game,
          25,
        );
        setEntries(rows);
      } else {
        const rows = await fetchStreakLeaderboard(25);
        setStreakEntries(rows);
      }
    } finally {
      setLoading(false);
    }
  }, [mode, period, game]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Trophy className="size-5 text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Leaderboard</h3>
            <p className="text-xs text-muted-foreground">
              See how you rank within your institute.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="gap-1.5"
          disabled={loading}
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="xp" className="gap-1.5">
            <Sparkles className="size-3.5" />
            XP
          </TabsTrigger>
          <TabsTrigger value="streak" className="gap-1.5">
            <Flame className="size-3.5" />
            Streaks
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "xp" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as LeaderboardPeriod)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={game} onValueChange={(v) => setGame(v as GameId | "all")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GAME_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="size-4 animate-spin" />
          Loading leaderboard...
        </div>
      ) : mode === "xp" ? (
        <XpList entries={entries} />
      ) : (
        <StreakList entries={streakEntries} />
      )}

      <p className="text-xs text-muted-foreground text-center">
        Leaderboards are scoped to your institute. Updates within seconds of each finished game.
      </p>
    </div>
  );
}

function XpList({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          No scores recorded in this window yet.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Play a game to seed the leaderboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {entries.map((entry) => (
        <Row
          key={entry.user_id}
          rank={entry.rank}
          name={entry.name}
          avatarUrl={entry.avatar_url}
          isMe={entry.is_me}
          metric={`${entry.total_xp.toLocaleString()} XP`}
          subtitle={`${entry.total_plays} plays · ${entry.total_perfects} perfect`}
        />
      ))}
    </div>
  );
}

function StreakList({ entries }: { entries: StreakLeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          No active streaks yet. Play today to start one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {entries.map((entry) => (
        <Row
          key={entry.user_id}
          rank={entry.rank}
          name={entry.name}
          avatarUrl={entry.avatar_url}
          isMe={entry.is_me}
          metric={`${entry.current_streak} day${entry.current_streak === 1 ? "" : "s"}`}
          subtitle="Current streak"
          metricIcon={<Flame className="size-3.5 text-orange-500" />}
        />
      ))}
    </div>
  );
}

interface RowProps {
  rank: number;
  name: string;
  avatarUrl: string | null;
  isMe: boolean;
  metric: string;
  subtitle: string;
  metricIcon?: React.ReactNode;
}

function Row({ rank, name, avatarUrl, isMe, metric, subtitle, metricIcon }: RowProps) {
  const rankMedal =
    rank === 1 ? (
      <Crown className="size-4 text-amber-500" />
    ) : rank === 2 ? (
      <Medal className="size-4 text-slate-400" />
    ) : rank === 3 ? (
      <Medal className="size-4 text-amber-700" />
    ) : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 transition-colors",
        isMe
          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
          : "border-border/50 bg-card",
      )}
    >
      <div className="w-8 flex items-center justify-center font-bold tabular-nums text-muted-foreground text-sm">
        {rankMedal ?? `#${rank}`}
      </div>
      <Avatar className="size-9 shrink-0">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
        <AvatarFallback className="text-xs">
          {name
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate flex items-center gap-1.5">
          {name}
          {isMe && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
              You
            </Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-bold text-sm tabular-nums flex items-center gap-1 justify-end">
          {metricIcon}
          {metric}
        </p>
      </div>
    </div>
  );
}
