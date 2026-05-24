// ---------------------------------------------------------------------------
// PlayerSidebar — collapsible curriculum navigator with per-lesson progress
// ---------------------------------------------------------------------------

import { useState } from "react";
import type { ComponentType } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  PlayCircle,
  FileText,
  BookOpen,
  HelpCircle,
  ClipboardList,
  Clock,
  Lock,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type {
  LmsModule,
  LmsLesson,
  LmsLessonProgress,
  LmsCourseProgress,
  LmsLessonType,
} from "@/types";

// ── Lesson type icons ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LESSON_ICONS: Record<LmsLessonType, ComponentType<any>> = {
  video: PlayCircle,
  pdf: FileText,
  text: BookOpen,
  quiz: HelpCircle,
  assignment: ClipboardList,
  live: Radio,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(secs: number): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${m}m`;
}

function getModuleCompletion(
  lessons: LmsLesson[],
  progressMap: Record<string, LmsLessonProgress>,
): { completed: number; total: number } {
  const total = lessons.length;
  const completed = lessons.filter((l) => progressMap[l.id]?.is_completed).length;
  return { completed, total };
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PlayerSidebarProps {
  modules: (LmsModule & { lessons: LmsLesson[] })[];
  currentLessonId: string;
  progressMap: Record<string, LmsLessonProgress>;
  onLessonSelect: (lesson: LmsLesson) => void;
  collapsed: boolean;
  onToggle: () => void;
  courseProgress: LmsCourseProgress | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlayerSidebar({
  modules,
  currentLessonId,
  progressMap,
  onLessonSelect,
  collapsed,
  onToggle,
  courseProgress,
}: PlayerSidebarProps) {
  // Find the module that contains the current lesson so we can default-open it
  const currentModuleId =
    modules.find((m) => m.lessons.some((l) => l.id === currentLessonId))?.id ?? "";

  const [openModules, setOpenModules] = useState<string[]>(
    currentModuleId ? [currentModuleId] : [],
  );

  const totalLessons = modules.reduce((acc, m) => acc + m.lessons.length, 0);
  const completedLessons = courseProgress?.completed_lessons ?? 0;
  const completionPct = courseProgress?.completion_pct ?? 0;

  return (
    <>
      {/* Mobile Backdrop */}
      {!collapsed && (
        <div
          className="absolute inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden transition-opacity"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "absolute md:relative h-full flex shrink-0 flex-col border-r border-border/60 bg-background/95 backdrop-blur-md md:bg-muted/10 transition-all duration-300 ease-in-out z-40",
          collapsed
            ? "-translate-x-full md:translate-x-0 w-0 opacity-0 overflow-hidden"
            : "translate-x-0 w-[85vw] max-w-[340px] md:w-[340px] opacity-100 shadow-2xl md:shadow-none",
        )}
        aria-label="Course curriculum"
      >
        {/* ── Toggle button ─────────────────────────────────────────────── */}
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Open curriculum" : "Close curriculum"}
          className={cn(
            "absolute -right-4 top-6 z-40 flex size-8 items-center justify-center rounded-full",
            "border border-border/80 bg-background shadow-md transition-all duration-300 hover:bg-muted hover:scale-105",
            collapsed ? "right-[-16px] opacity-100" : "-right-4",
          )}
        >
          {collapsed ? (
            <ChevronRight className="size-4 text-muted-foreground ml-0.5" />
          ) : (
            <ChevronLeft className="size-4 text-muted-foreground mr-0.5" />
          )}
        </button>

        {!collapsed && (
          <>
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="border-b border-border p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Course Content</h2>
                <Button variant="ghost" size="icon" onClick={onToggle} className="size-7">
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              {/* Overall progress */}
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {completedLessons} / {totalLessons} lessons
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {Math.round(completionPct)}%
                  </span>
                </div>
                <Progress value={completionPct} className="h-1.5" />
              </div>
            </div>

            {/* ── Module / Lesson list ─────────────────────────────────────── */}
            <ScrollArea className="flex-1">
              {modules.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No modules or lessons are available for this course yet.
                </div>
              ) : (
                <Accordion
                  type="multiple"
                  value={openModules}
                  onValueChange={setOpenModules}
                  className="w-full"
                >
                  {modules.map((mod) => {
                    const { completed, total } = getModuleCompletion(mod.lessons, progressMap);
                    const allDone = total > 0 && completed === total;

                    return (
                      <AccordionItem
                        key={mod.id}
                        value={mod.id}
                        className="border-b border-border/40"
                      >
                        <AccordionTrigger className="px-5 py-4 text-left hover:no-underline hover:bg-muted/30 transition-colors">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            {allDone ? (
                              <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                                <CheckCircle2 className="size-3.5" />
                              </div>
                            ) : (
                              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-background border shadow-sm text-[10px] font-bold text-muted-foreground">
                                {completed}
                              </span>
                            )}
                            <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                              {mod.title}
                            </span>
                          </div>
                          <span className="ml-3 shrink-0 text-[10px] font-medium tracking-widest text-muted-foreground">
                            {completed}/{total}
                          </span>
                        </AccordionTrigger>

                        <AccordionContent className="pb-3 pt-1">
                          <ul className="space-y-1 px-3">
                            {mod.lessons.map((lesson) => {
                              const progress = progressMap[lesson.id];
                              const isActive = lesson.id === currentLessonId;
                              const isCompleted = progress?.is_completed ?? false;
                              const Icon = LESSON_ICONS[lesson.lesson_type] ?? PlayCircle;

                              return (
                                <li key={lesson.id} className="relative group">
                                  {isActive && (
                                    <motion.div
                                      layoutId="activeLessonIndicator"
                                      className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-md bg-primary z-10"
                                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    />
                                  )}
                                  <button
                                    onClick={() => onLessonSelect(lesson)}
                                    className={cn(
                                      "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-all duration-300",
                                      "hover:bg-background hover:shadow-sm hover:scale-[1.01]",
                                      isActive &&
                                        "bg-background border-border/50 shadow-sm ring-1 ring-primary/20",
                                    )}
                                    aria-current={isActive ? "step" : undefined}
                                  >
                                    {/* Type icon */}
                                    <div
                                      className={cn(
                                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                                        isActive
                                          ? "bg-primary/10 text-primary shadow-inner"
                                          : isCompleted
                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                            : "bg-muted text-muted-foreground group-hover:bg-muted/80",
                                      )}
                                    >
                                      <Icon className={cn("size-4")} />
                                    </div>

                                    {/* Title + meta */}
                                    <div className="min-w-0 flex-1">
                                      <p
                                        className={cn(
                                          "truncate text-sm leading-snug transition-colors",
                                          isActive
                                            ? "font-bold text-primary"
                                            : "font-medium text-foreground/80 group-hover:text-foreground",
                                        )}
                                      >
                                        {lesson.title}
                                      </p>
                                      {lesson.video_duration_secs > 0 && (
                                        <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                                          <Clock className="size-3" />
                                          <span>{formatDuration(lesson.video_duration_secs)}</span>
                                        </div>
                                      )}
                                      {/* Mini progress bar for partially-watched video */}
                                      {!isCompleted &&
                                        progress &&
                                        lesson.video_duration_secs > 0 && (
                                          <Progress
                                            value={
                                              (progress.watch_seconds /
                                                lesson.video_duration_secs) *
                                              100
                                            }
                                            className="mt-2 h-1.5 bg-muted/50 overflow-hidden [&>div]:bg-primary"
                                          />
                                        )}
                                    </div>

                                    {/* Status icon */}
                                    <div className="shrink-0 pt-1">
                                      {isCompleted ? (
                                        <div className="animate-in zoom-in duration-300">
                                          <CheckCircle2 className="size-4 text-emerald-500 drop-shadow-sm" />
                                        </div>
                                      ) : lesson.is_preview ? (
                                        <span className="rounded-md bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase text-primary">
                                          Preview
                                        </span>
                                      ) : !progress ? (
                                        <Lock className="size-3.5 text-muted-foreground/30" />
                                      ) : null}
                                    </div>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </ScrollArea>
          </>
        )}
      </aside>
    </>
  );
}
