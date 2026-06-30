// ---------------------------------------------------------------------------
// GameSetupPanel — reusable topic + difficulty picker
// ---------------------------------------------------------------------------
// Every game starts with this. It collects the topic, difficulty, and
// optional count, surfaces a missing-API-key warning, and fires `onStart`.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Sparkles, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { hasGroqKey } from "../services/gameAI.service";
import type { Difficulty } from "../types";

export interface GameSetupPanelProps {
  title: string;
  description: string;
  defaultCount?: number;
  countMin?: number;
  countMax?: number;
  countLabel?: string;
  loading?: boolean;
  error?: string | null;
  onStart: (config: { topic: string; difficulty: Difficulty; count: number }) => void;
}

export function GameSetupPanel({
  title,
  description,
  defaultCount = 10,
  countMin = 5,
  countMax = 20,
  countLabel = "Questions",
  loading = false,
  error = null,
  onStart,
}: GameSetupPanelProps) {
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [count, setCount] = useState(defaultCount);
  const keyAvailable = hasGroqKey();

  const canStart = topic.trim().length >= 2 && !loading && keyAvailable;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Badge variant="outline" className="gap-1.5">
          <Sparkles className="size-3.5" />
          AI-Powered
        </Badge>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {!keyAvailable && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <KeyRound className="size-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Groq API key needed</p>
            <p className="text-xs mt-1 opacity-80">
              Open AI Assistant → Settings and paste your Groq key to play AI games.
              Free keys are available at console.groq.com.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="game-topic">Topic</Label>
          <Input
            id="game-topic"
            placeholder="e.g. Photosynthesis, World War II, JavaScript closures"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            autoFocus
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Be specific. Better topics make better questions.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="game-difficulty">Difficulty</Label>
            <Select
              value={difficulty}
              onValueChange={(v) => setDifficulty(v as Difficulty)}
              disabled={loading}
            >
              <SelectTrigger id="game-difficulty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="game-count">{countLabel}</Label>
            <Input
              id="game-count"
              type="number"
              min={countMin}
              max={countMax}
              value={count}
              onChange={(e) =>
                setCount(
                  Math.min(countMax, Math.max(countMin, Number(e.target.value) || countMin)),
                )
              }
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              {countMin}–{countMax} items
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-900 dark:text-rose-300">
          {error}
        </div>
      )}

      <Button
        size="lg"
        className="w-full gap-2"
        onClick={() => onStart({ topic: topic.trim(), difficulty, count })}
        disabled={!canStart}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Generating with Groq...
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            Generate &amp; Start
          </>
        )}
      </Button>
    </div>
  );
}
