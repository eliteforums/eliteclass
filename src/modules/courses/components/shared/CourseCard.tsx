// ---------------------------------------------------------------------------
// CourseCard — Udemy/Coursera-inspired card for LMS course listings.
//
// Supports three variants:
//   admin  — full actions dropdown (edit, publish/archive, enroll, delete)
//   staff  — same as admin, scoped to own courses
//   student — progress bar + continue/start button
// ---------------------------------------------------------------------------

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DifficultyBadge } from "@/modules/courses/components/shared/DifficultyBadge";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Users,
  Clock,
  MoreVertical,
  Edit,
  Trash2,
  Archive,
  Globe,
  Play,
  UserPlus,
} from "lucide-react";
import type { LmsCourse, LmsCourseProgress, LmsCourseStatus } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CourseCardProps {
  course: LmsCourse;
  progress?: LmsCourseProgress | null;
  showActions?: boolean;
  onEdit?: (course: LmsCourse) => void;
  onDelete?: (course: LmsCourse) => void;
  onPublish?: (course: LmsCourse) => void;
  onArchive?: (course: LmsCourse) => void;
  onView?: (course: LmsCourse) => void;
  onEnroll?: (course: LmsCourse) => void;
  variant?: "admin" | "student" | "staff";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const THUMBNAIL_GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-rose-600",
  "from-cyan-500 to-blue-600",
  "from-pink-500 to-rose-600",
] as const;

function thumbnailGradient(title: string): string {
  const index = title.charCodeAt(0) % THUMBNAIL_GRADIENTS.length;
  return THUMBNAIL_GRADIENTS[index];
}

function cardInitials(title: string): string {
  const words = title.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return title.slice(0, 2).toUpperCase();
}

function formatDuration(mins: number): string {
  if (!mins) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const STATUS_STYLES: Record<LmsCourseStatus, string> = {
  published: "bg-emerald-500 text-white",
  draft: "bg-amber-500 text-white",
  archived: "bg-gray-500 text-white",
};

const STATUS_LABELS: Record<LmsCourseStatus, string> = {
  published: "Published",
  draft: "Draft",
  archived: "Archived",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CourseCard({
  course,
  progress,
  showActions = true,
  onEdit,
  onDelete,
  onPublish,
  onArchive,
  onView,
  onEnroll,
  variant = "admin",
}: CourseCardProps) {
  const isStudent = variant === "student";
  const isAdminOrStaff = variant === "admin" || variant === "staff";
  const completionPct = progress?.completion_pct ?? 0;
  const isComplete = completionPct >= 100;

  const creatorName = course.creator?.name ?? (isStudent ? undefined : "Unknown creator");

  return (
    <Card
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card transition-all duration-300",
        "hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-primary/5 hover:-translate-y-1",
      )}
    >
      {/* ── Thumbnail ──────────────────────────────────────────────────────── */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted/20">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center bg-gradient-to-br transition-transform duration-500 ease-out group-hover:scale-105",
              thumbnailGradient(course.title),
            )}
          >
            <span className="select-none text-5xl font-extrabold text-white/90 tracking-tighter drop-shadow-sm">
              {cardInitials(course.title)}
            </span>
          </div>
        )}

        {/* Gradient overlay for better contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10 opacity-60 transition-opacity duration-300 group-hover:opacity-40" />

        {/* Status badge overlay */}
        <div className="absolute right-2 top-2">
          <span
            className={cn(
              "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase shadow",
              STATUS_STYLES[course.status],
            )}
          >
            {STATUS_LABELS[course.status]}
          </span>
        </div>

        {/* Featured badge */}
        {course.is_featured && (
          <div className="absolute left-2 top-2">
            <span className="inline-flex items-center rounded-md bg-yellow-400 px-2 py-0.5 text-[10px] font-semibold text-yellow-900 shadow">
              Featured
            </span>
          </div>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <CardContent className="flex flex-1 flex-col gap-2.5 p-5">
        {/* Category */}
        <div className="flex items-center justify-between">
          {course.category?.name && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary/80">
              {course.category.name}
            </p>
          )}
          <DifficultyBadge difficulty={course.difficulty} />
        </div>

        {/* Title */}
        <h3
          className="line-clamp-2 text-base font-bold leading-tight text-foreground transition-colors group-hover:text-primary"
          title={course.title}
        >
          {course.title}
        </h3>

        {/* Subtitle */}
        {course.subtitle && (
          <p className="line-clamp-2 text-sm text-muted-foreground/90 leading-relaxed">
            {course.subtitle}
          </p>
        )}

        {/* Stats row */}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-3 text-xs font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3 w-3" aria-hidden="true" />
            {course.total_lessons} {course.total_lessons === 1 ? "lesson" : "lessons"}
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" aria-hidden="true" />
            {course.total_enrollments.toLocaleString()} enrolled
          </span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatDuration(course.estimated_duration_mins)}
          </span>
        </div>

        {/* Student progress */}
        {isStudent && progress && (
          <div className="mt-2 space-y-1">
            {isComplete ? (
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs">
                ✓ Completed
              </Badge>
            ) : (
              <>
                <Progress value={completionPct} className="h-1.5" />
                <p className="text-[11px] text-muted-foreground">
                  {Math.round(completionPct)}% complete
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <CardFooter className="flex items-center justify-between gap-3 border-t border-border/50 bg-muted/10 px-5 py-3.5">
        {/* Creator name */}
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
            {creatorName ? creatorName.charAt(0).toUpperCase() : "U"}
          </div>
          <p className="truncate text-xs font-medium text-muted-foreground" title={creatorName}>
            {creatorName ?? "—"}
          </p>
        </div>

        {/* Actions */}
        {showActions && (
          <>
            {/* Admin / Staff — dropdown */}
            {isAdminOrStaff && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label="Course actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {/* Edit */}
                  <DropdownMenuItem onClick={() => onEdit?.(course)}>
                    <Edit className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>

                  {/* View */}
                  <DropdownMenuItem onClick={() => onView?.(course)}>
                    <Globe className="mr-2 h-3.5 w-3.5" />
                    View Details
                  </DropdownMenuItem>

                  {/* Publish / Archive toggle */}
                  {course.status !== "published" ? (
                    <DropdownMenuItem onClick={() => onPublish?.(course)}>
                      <Globe className="mr-2 h-3.5 w-3.5" />
                      Publish
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => onArchive?.(course)}>
                      <Archive className="mr-2 h-3.5 w-3.5" />
                      Archive
                    </DropdownMenuItem>
                  )}

                  {/* Enroll students */}
                  {onEnroll && (
                    <DropdownMenuItem onClick={() => onEnroll(course)}>
                      <UserPlus className="mr-2 h-3.5 w-3.5" />
                      Enroll Students
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  {/* Delete */}
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    onClick={() => onDelete?.(course)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Student — CTA button */}
            {isStudent && (
              <Button
                size="sm"
                variant={isComplete ? "outline" : "default"}
                className="h-7 shrink-0 text-xs"
                onClick={() => onView?.(course)}
              >
                <Play className="mr-1 h-3 w-3" />
                {progress && completionPct > 0 ? "Continue" : "Start Course"}
              </Button>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  );
}
