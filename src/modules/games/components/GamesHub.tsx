// ---------------------------------------------------------------------------
// GamesHub — AI-powered brain games launcher embedded in /my-learning
// ---------------------------------------------------------------------------
// Renders six game cards. Selecting one opens a full-screen dialog containing
// the game component. High scores are persisted via useGameScores (localStorage)
// so the section also works offline (game generation needs Groq though).
// ---------------------------------------------------------------------------

import { useState, type ComponentType } from "react";
import {
  Award,
  Brain,
  Gamepad2,
  Lightbulb,
  Shuffle,
  Target,
  Timer,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useGameScores } from "../hooks/useGameScores";
import type { GameId } from "../types";
import { QuizRushGame } from "./QuizRushGame";
import { FlashcardMatchGame } from "./FlashcardMatchGame";
import { HangmanGame } from "./HangmanGame";
import { WordScrambleGame } from "./WordScrambleGame";
import { FillBlanksGame } from "./FillBlanksGame";
import { TrueFalseSpeedrunGame } from "./TrueFalseSpeedrunGame";

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

export function GamesHub() {
  const [active, setActive] = useState<GameId | null>(null);
  const { getScore } = useGameScores();

  const close = () => setActive(null);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((game) => {
          const Icon = game.icon;
          const high = getScore(game.id);
          return (
            <Card
              key={game.id}
              onClick={() => setActive(game.id)}
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

      <Dialog open={active !== null} onOpenChange={(v) => !v && close()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">
            {active ? GAMES.find((g) => g.id === active)?.name : "Game"}
          </DialogTitle>
          {active === "quiz-rush" && <QuizRushGame onClose={close} />}
          {active === "flashcard-match" && <FlashcardMatchGame onClose={close} />}
          {active === "hangman" && <HangmanGame onClose={close} />}
          {active === "word-scramble" && <WordScrambleGame onClose={close} />}
          {active === "fill-blanks" && <FillBlanksGame onClose={close} />}
          {active === "true-false-speedrun" && <TrueFalseSpeedrunGame onClose={close} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
