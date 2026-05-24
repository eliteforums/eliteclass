// ---------------------------------------------------------------------------
// PlayerHeader — sticky top bar for the full-screen course player
// ---------------------------------------------------------------------------

import { ArrowLeft, Home, BookOpen, Clock, BarChart, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import type { LmsCourse, LmsLesson } from "@/types";

export interface PlayerHeaderProps {
  course: LmsCourse;
  currentLesson: LmsLesson | null;
  completionPct: number;
  onBack: () => void;
}

const fixTitle = (title: string) => {
  if (title?.toUpperCase() === "PYHTON") return "Python";
  if (title?.toLowerCase() === "pdf") return "Documentation & Resources";
  return title;
};

export function PlayerHeader({ course, currentLesson, completionPct, onBack }: PlayerHeaderProps) {
  const isComplete = completionPct >= 100;
  const courseTitle = fixTitle(course.title);
  const lessonTitle = fixTitle(currentLesson?.title ?? "");

  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 text-foreground shadow-sm backdrop-blur-md">
      <div className="flex h-16 items-center gap-4 px-4 sm:px-6">
        {/* ── Left: back arrow + breadcrumb ───────────────────────────── */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Exit course"
        >
          <ArrowLeft className="size-5" />
        </Button>

        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="hidden sm:flex size-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <BookOpen className="size-4 text-primary" />
          </div>
          <div className="min-w-0 flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <p className="truncate text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
                {courseTitle}
              </p>
              {course.category && (
                <Badge
                  variant="secondary"
                  className="hidden lg:flex h-4 px-1.5 text-[9px] font-bold uppercase tracking-tighter bg-primary/5 text-primary border-primary/10"
                >
                  <Tag className="mr-1 size-2" />
                  {course.category.name}
                </Badge>
              )}
            </div>
            {currentLesson && (
              <p className="truncate text-sm font-bold leading-tight text-foreground">
                {lessonTitle}
              </p>
            )}
          </div>
        </div>

        {/* ── Metadata: Difficulty & Duration (Desktop) ────────────────── */}
        <div className="hidden xl:flex items-center gap-6 px-6 border-l border-r border-border/50 mx-2 h-8 text-muted-foreground">
          <div className="flex items-center gap-2">
            <BarChart className="size-3.5 text-primary/60" />
            <span className="text-xs font-medium capitalize">{course.difficulty}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-primary/60" />
            <span className="text-xs font-medium">{course.estimated_duration_mins} mins</span>
          </div>
        </div>

        {/* ── Centre: completion progress bar (desktop only) ───────────── */}
        <div
          className="hidden w-56 shrink-0 flex-col gap-1.5 md:flex"
          aria-label={`${Math.round(completionPct)}% complete`}
        >
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>Progress</span>
            <span className={isComplete ? "text-emerald-500" : "text-primary"}>
              {Math.round(completionPct)}%
            </span>
          </div>
          <Progress
            value={completionPct}
            className={cn(
              "h-1.5 bg-muted/60",
              isComplete
                ? "[&>div]:bg-emerald-500 [&>div]:shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                : "[&>div]:bg-primary [&>div]:shadow-[0_0_10px_rgba(59,130,246,0.5)]",
              "[&>div]:transition-all [&>div]:duration-500",
            )}
          />
        </div>

        {/* ── Right: exit button & Theme Toggle ─────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-2 pl-4 border-l border-border/50 ml-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Go to dashboard"
          >
            <Home className="size-5" />
          </Button>
        </div>
      </div>

      {/* Mobile progress bar — sits flush under the header row */}
      <Progress
        value={completionPct}
        className={cn(
          "h-0.5 rounded-none bg-muted/60 md:hidden",
          isComplete ? "[&>div]:bg-emerald-500" : "[&>div]:bg-primary",
          "[&>div]:transition-all [&>div]:duration-500",
        )}
      />
    </header>
  );
}
