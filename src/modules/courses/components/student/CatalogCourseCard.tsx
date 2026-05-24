import { Loader2, Play, UserPlus, BookOpen, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DifficultyBadge } from "@/modules/courses/components/shared/DifficultyBadge";
import { useIsEnrolled, useSelfEnroll } from "@/modules/courses/hooks/useEnrollment";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import type { LmsCourse } from "@/types";

interface CatalogCourseCardProps {
  course: LmsCourse;
  onOpenCourse: (courseId: string) => void;
}

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

export function CatalogCourseCard({ course, onOpenCourse }: CatalogCourseCardProps) {
  const { user } = useAuthStore();
  const studentId = user?.id ?? "";

  const { data: enrollStatus, isLoading: checking } = useIsEnrolled(course.id, studentId);
  const { mutate: enroll, isPending: enrolling } = useSelfEnroll();

  const isEnrolled = enrollStatus?.enrolled ?? false;
  const pct = 0; // Progress is displayed in My Learning, not here

  const handlePrimary = () => {
    if (isEnrolled) {
      onOpenCourse(course.id);
      return;
    }

    enroll(course.id, {
      onSuccess: () => {
        toast.success(`Enrolled in "${course.title}"`);
        onOpenCourse(course.id);
      },
      onError: (err: Error) => toast.error(err.message ?? "Enrollment failed"),
    });
  };

  const busy = checking || enrolling;

  return (
    <Card className="group flex flex-col overflow-hidden rounded-[1.25rem] border border-border/50 bg-background transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted shrink-0">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center bg-gradient-to-br transition-transform duration-500 ease-out group-hover:scale-105",
              thumbnailGradient(course.title),
            )}
          >
            <span className="select-none text-4xl font-extrabold text-white/90 tracking-tighter drop-shadow-md">
              {cardInitials(course.title)}
            </span>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <div className="absolute left-3 top-3 z-10 flex gap-2">
          {course.is_featured && (
            <Badge className="bg-amber-400 text-amber-950 border-none font-bold uppercase tracking-widest text-[9px] px-2 py-0.5 shadow-sm">
              Featured
            </Badge>
          )}
          <DifficultyBadge difficulty={course.difficulty} />
        </div>
      </div>

      <CardContent className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 text-base font-bold leading-tight text-foreground transition-colors group-hover:text-primary mb-2">
          {course.title}
        </h3>

        {course.subtitle && (
          <p className="line-clamp-2 text-xs text-muted-foreground/80 leading-relaxed mb-4">
            {course.subtitle}
          </p>
        )}

        {isEnrolled && pct > 0 && (
          <div className="mb-4">
            <div className="flex justify-between text-[10px] mb-1 font-semibold text-muted-foreground">
              <span>PROGRESS</span>
              <span>{Math.round(pct)}%</span>
            </div>
            <Progress value={pct} className="h-1.5 bg-muted [&>div]:bg-primary" />
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
            <BookOpen className="h-3.5 w-3.5 text-primary/70" />
            {course.total_lessons} {course.total_lessons === 1 ? "lesson" : "lessons"}
          </span>
          <span className="inline-flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
            <Clock className="h-3.5 w-3.5 text-primary/70" />
            {formatDuration(course.estimated_duration_mins)}
          </span>
        </div>
      </CardContent>

      <CardFooter className="p-5 pt-0">
        <Button
          className={cn(
            "w-full gap-2 rounded-xl transition-all duration-300",
            isEnrolled
              ? "bg-primary text-primary-foreground hover:bg-primary hover:shadow-md"
              : "hover:bg-primary/90",
          )}
          variant={isEnrolled ? "default" : "default"}
          onClick={handlePrimary}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isEnrolled ? (
            <Play className="h-4 w-4 fill-current" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          {isEnrolled ? "Continue Learning" : "Enroll & Start"}
        </Button>
      </CardFooter>
    </Card>
  );
}
