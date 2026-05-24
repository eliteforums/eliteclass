// ---------------------------------------------------------------------------
// EduOS — /dashboard/student/my-learning
// Student "My Learning" dashboard — course catalogue + progress stats
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  BarChart3,
  Play,
  Sparkles,
  GraduationCap,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import { useStudentEnrollments } from "@/modules/courses/hooks/useEnrollment";
import { DifficultyBadge } from "@/modules/courses/components/shared/DifficultyBadge";
import { ProgressRing } from "@/modules/courses/components/shared/ProgressRing";
import { EmptyCoursesState } from "@/modules/courses/components/shared/EmptyCoursesState";
import type { LmsEnrollmentWithProgress } from "@/types";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/student/my-learning")({
  head: () => ({ meta: [{ title: "My Learning — EduOS" }] }),
  component: MyLearningPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type CourseFilter = "all" | "in-progress" | "completed" | "not-started";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatWatchTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getEnrollmentFilter(e: LmsEnrollmentWithProgress, filter: CourseFilter): boolean {
  const pct = e.progress?.completion_pct ?? 0;
  switch (filter) {
    case "in-progress":
      return e.status === "active" && pct > 0 && pct < 100;
    case "completed":
      return e.status === "completed" || pct >= 100;
    case "not-started":
      return e.status === "active" && pct === 0;
    default:
      return true;
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

function MyLearningPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<CourseFilter>("all");

  const { data: enrollments = [], isLoading, error } = useStudentEnrollments(user?.id ?? "");

  // ── Computed stats ─────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total = enrollments.length;
    const completed = enrollments.filter(
      (e) => e.status === "completed" || (e.progress?.completion_pct ?? 0) >= 100,
    ).length;
    const inProgress = enrollments.filter(
      (e) =>
        e.status === "active" &&
        (e.progress?.completion_pct ?? 0) > 0 &&
        (e.progress?.completion_pct ?? 0) < 100,
    ).length;
    const avgCompletion =
      total > 0
        ? enrollments.reduce((sum, e) => sum + (e.progress?.completion_pct ?? 0), 0) / total
        : 0;
    const totalWatchSeconds = enrollments.reduce(
      (sum, e) => sum + (e.progress?.total_watch_seconds ?? 0),
      0,
    );

    return { total, completed, inProgress, avgCompletion, totalWatchSeconds };
  }, [enrollments]);

  // ── Continue Learning: recently accessed active enrollments ────────────

  const continueLearning = useMemo(() => {
    return enrollments
      .filter(
        (e) =>
          e.status === "active" &&
          e.progress?.last_accessed_at &&
          (e.progress?.completion_pct ?? 0) < 100,
      )
      .sort(
        (a, b) =>
          new Date(b.progress!.last_accessed_at!).getTime() -
          new Date(a.progress!.last_accessed_at!).getTime(),
      )
      .slice(0, 4);
  }, [enrollments]);

  // ── Filtered all-courses list ──────────────────────────────────────────

  const filteredEnrollments = useMemo(
    () => enrollments.filter((e) => getEnrollmentFilter(e, filter)),
    [enrollments, filter],
  );

  // ── Navigation ────────────────────────────────────────────────────────

  const goToCourse = (courseId: string) => {
    void navigate({
      to: "/dashboard/student/learn/$courseId",
      params: { courseId },
    });
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <div className="space-y-8">
        {/* ── Hero header ──────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-[2rem] border border-border/40 bg-card p-6 md:p-10 shadow-lg"
        >
          {/* Decorative background blobs */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 size-[300px] rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 size-[200px] rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-4 max-w-xl">
              <Badge
                variant="outline"
                className="gap-1.5 px-3 py-1 bg-background/50 backdrop-blur-sm border-primary/20 text-primary"
              >
                <Sparkles className="size-3.5" />
                My Learning
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl leading-tight">
                Welcome back,{" "}
                <span className="text-primary bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600">
                  {user?.name?.split(" ")[0] ?? "Student"}
                </span>
              </h1>
              <p className="text-base text-muted-foreground">
                Continue your journey. You have{" "}
                <strong className="text-foreground font-medium">
                  {stats.inProgress} course{stats.inProgress !== 1 ? "s" : ""}
                </strong>{" "}
                in progress.
              </p>
            </div>

            {/* Progress ring */}
            <div className="p-4 bg-background/50 rounded-3xl backdrop-blur-sm border border-border/50 shadow-sm">
              <ProgressRing
                value={stats.avgCompletion}
                size={100}
                strokeWidth={10}
                labelClassName="text-xl font-bold"
              />
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              icon={BookOpen}
              label="Enrolled"
              value={stats.total}
              iconClass="text-blue-500"
            />
            <StatCard
              icon={CheckCircle2}
              label="Completed"
              value={stats.completed}
              iconClass="text-emerald-500"
            />
            <StatCard
              icon={TrendingUp}
              label="In Progress"
              value={stats.inProgress}
              iconClass="text-amber-500"
            />
            <StatCard
              icon={Clock}
              label="Watch Time"
              value={formatWatchTime(stats.totalWatchSeconds)}
              iconClass="text-violet-500"
            />
          </div>
        </motion.section>

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-700 dark:text-rose-400">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>Failed to load enrollments. Please refresh the page.</p>
          </div>
        )}

        {/* ── Loading ────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          </div>
        )}

        {/* ── Empty enrollments ───────────────────────────────────────── */}
        {!isLoading && !error && enrollments.length === 0 && (
          <EmptyCoursesState
            role="student"
            onBrowse={() => void navigate({ to: "/dashboard/student/courses" })}
          />
        )}

        {/* ── Continue Learning ─────────────────────────────────────── */}
        {!isLoading && enrollments.length > 0 && continueLearning.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Play className="size-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Continue Learning</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {continueLearning.map((enrollment) => (
                <ContinueLearningCard
                  key={enrollment.id}
                  enrollment={enrollment}
                  onContinue={() => goToCourse(enrollment.course_id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── All Courses ──────────────────────────────────────────────── */}
        {!isLoading && enrollments.length > 0 && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="size-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">All Courses</h2>
                <Badge variant="secondary">{filteredEnrollments.length}</Badge>
              </div>

              <Tabs value={filter} onValueChange={(v) => setFilter(v as CourseFilter)}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="in-progress">In Progress</TabsTrigger>
                  <TabsTrigger value="completed">Completed</TabsTrigger>
                  <TabsTrigger value="not-started">Not Started</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {filteredEnrollments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
                <BookOpen className="size-12 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No courses match this filter.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredEnrollments.map((enrollment, i) => (
                  <motion.div
                    key={enrollment.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.04 }}
                  >
                    <CourseCard
                      enrollment={enrollment}
                      onAction={() => goToCourse(enrollment.course_id)}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Learning Stats mini-cards ────────────────────────────────── */}
        {!isLoading && enrollments.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Learning Stats</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <MiniStatCard
                label="Total watch time"
                value={formatWatchTime(stats.totalWatchSeconds)}
                description="Across all courses"
                icon={Clock}
              />
              <MiniStatCard
                label="Courses completed"
                value={String(stats.completed)}
                description={`Out of ${stats.total} enrolled`}
                icon={CheckCircle2}
              />
              <MiniStatCard
                label="Avg completion"
                value={`${Math.round(stats.avgCompletion)}%`}
                description="Across active courses"
                icon={TrendingUp}
              />
            </div>
          </section>
        )}
      </div>
    </ProtectedRoute>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: ComponentType<any>;
  label: string;
  value: number | string;
  iconClass?: string;
}) {
  return (
    <Card className="border-border/50 bg-background/70">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon className={`size-5 ${iconClass ?? "text-muted-foreground"}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ContinueLearningCard({
  enrollment,
  onContinue,
}: {
  enrollment: LmsEnrollmentWithProgress;
  onContinue: () => void;
}) {
  const course = enrollment.course;
  const pct = enrollment.progress?.completion_pct ?? 0;

  return (
    <Card className="w-72 shrink-0 cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 rounded-2xl border-border/50 bg-background group">
      {/* Thumbnail */}
      <div className="relative h-40 bg-muted overflow-hidden">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
            <BookOpen className="size-10 text-primary/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/20">
          <div className="size-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white border border-white/40 shadow-lg">
            <Play className="size-5 fill-current ml-1" />
          </div>
        </div>
      </div>

      <CardContent className="p-4">
        <p className="mb-2 line-clamp-2 text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
          {course.title}
        </p>
        <div className="mb-4 space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground font-medium">
            <span>{Math.round(pct)}% complete</span>
          </div>
          <Progress
            value={pct}
            className="h-1.5 bg-muted [&>div]:bg-primary [&>div]:shadow-[0_0_10px_rgba(var(--primary),0.5)]"
          />
        </div>
        <Button
          size="sm"
          onClick={onContinue}
          className="w-full gap-2 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors shadow-none border-none"
        >
          <Play className="size-3.5 fill-current" />
          Resume Lesson
        </Button>
      </CardContent>
    </Card>
  );
}

function CourseCard({
  enrollment,
  onAction,
}: {
  enrollment: LmsEnrollmentWithProgress;
  onAction: () => void;
}) {
  const course = enrollment.course;
  const pct = enrollment.progress?.completion_pct ?? 0;
  const isComplete = pct >= 100 || enrollment.status === "completed";
  const isStarted = pct > 0;

  return (
    <Card className="flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 rounded-[1.25rem] border-border/50 bg-background group h-full">
      {/* Thumbnail */}
      <div className="relative h-44 bg-muted overflow-hidden shrink-0">
        {course.thumbnail_url ? (
          <img
            src={course.thumbnail_url}
            alt={course.title}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
            <BookOpen className="size-12 text-primary/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        {isComplete && (
          <div className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-emerald-500 shadow-md backdrop-blur-sm border border-emerald-400/50">
            <CheckCircle2 className="size-4 text-white" />
          </div>
        )}

        {/* Category Badge */}
        {course.category_id && (
          <div className="absolute left-3 top-3">
            <Badge
              variant="secondary"
              className="bg-background/80 backdrop-blur-md shadow-sm border-none font-medium"
            >
              Course
            </Badge>
          </div>
        )}
      </div>

      <CardContent className="flex flex-col flex-1 p-5">
        {/* Difficulty & Status */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <DifficultyBadge difficulty={course.difficulty} />
          {isComplete && (
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] uppercase font-bold tracking-wider">
              Completed
            </Badge>
          )}
          {!isComplete && isStarted && (
            <Badge
              variant="outline"
              className="text-[10px] uppercase font-bold tracking-wider text-amber-600 border-amber-500/30 bg-amber-500/5"
            >
              In Progress
            </Badge>
          )}
        </div>

        {/* Title & subtitle */}
        <h3 className="line-clamp-2 text-base font-bold text-foreground group-hover:text-primary transition-colors">
          {course.title}
        </h3>
        {course.subtitle && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80 leading-relaxed">
            {course.subtitle}
          </p>
        )}

        <div className="flex-1" />

        {/* Progress bar */}
        <div className="my-4 space-y-1.5">
          <div className="flex justify-between text-xs font-medium text-muted-foreground">
            <span>{Math.round(pct)}% complete</span>
            <span>
              {enrollment.progress?.completed_lessons ?? 0} /{" "}
              {enrollment.progress?.total_lessons ?? course.total_lessons} lessons
            </span>
          </div>
          <Progress
            value={pct}
            className={cn(
              "h-1.5 bg-muted",
              isComplete ? "[&>div]:bg-emerald-500" : "[&>div]:bg-primary",
            )}
          />
        </div>

        {/* CTA */}
        <Button
          size="default"
          variant={isComplete ? "outline" : "default"}
          onClick={onAction}
          className={cn(
            "w-full gap-2 rounded-xl shadow-sm transition-all duration-300",
            !isComplete && "bg-primary/90 hover:bg-primary hover:shadow-md",
            isComplete && "border-border/60 hover:bg-muted/50",
          )}
        >
          {isComplete ? (
            <>
              <CheckCircle2 className="size-4" />
              Review Course
            </>
          ) : isStarted ? (
            <>
              <Play className="size-4 fill-current" />
              Continue Learning
            </>
          ) : (
            <>
              <Play className="size-4" />
              Start Course
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function MiniStatCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: ComponentType<any>;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="size-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
