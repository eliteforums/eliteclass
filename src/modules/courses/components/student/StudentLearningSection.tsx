import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, GraduationCap, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudentEnrollments } from "@/modules/courses/hooks/useEnrollment";
import { cn } from "@/lib/utils";

interface StudentLearningSectionProps {
  studentId: string;
}

export function StudentLearningSection({ studentId }: StudentLearningSectionProps) {
  const navigate = useNavigate();
  const { data: enrollments = [], isLoading } = useStudentEnrollments(studentId);

  const recent = useMemo(() => {
    return [...enrollments]
      .sort((a, b) => {
        const aTime = a.progress?.last_accessed_at ?? a.enrolled_at;
        const bTime = b.progress?.last_accessed_at ?? b.enrolled_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      })
      .slice(0, 3);
  }, [enrollments]);

  const goMyLearning = () => void navigate({ to: "/dashboard/student/my-learning" });
  const goCatalog = () => void navigate({ to: "/dashboard/student/courses" });
  const openCourse = (courseId: string) =>
    void navigate({
      to: "/dashboard/student/learn/$courseId",
      params: { courseId },
    });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-inner">
            <GraduationCap className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Continue Learning</h2>
            <p className="text-sm text-muted-foreground/80">Jump back into your recent courses</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={goCatalog}
            className="h-9 px-4 rounded-full font-medium hover:bg-muted/50 transition-colors"
          >
            Browse Courses
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={goMyLearning}
            className="h-9 px-4 rounded-full font-medium shadow-sm"
          >
            View All
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl bg-muted/40" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <Card className="border-dashed border-2 border-border/60 bg-muted/5 overflow-hidden">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-50" />
            <div className="relative z-10 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-2 shadow-sm">
              <Sparkles className="size-7" />
            </div>
            <div className="relative z-10 max-w-[280px] space-y-1.5">
              <h3 className="text-lg font-semibold text-foreground">Ready to start?</h3>
              <p className="text-sm text-muted-foreground">
                You are not enrolled in any courses yet. Browse your institute catalog to get
                started.
              </p>
            </div>
            <Button onClick={goCatalog} className="relative z-10 mt-2 rounded-full px-8 shadow-md">
              Explore Catalog
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {recent.map((enrollment) => {
            const pct = enrollment.progress?.completion_pct ?? 0;
            const course = enrollment.course;

            // Generate a deterministic gradient based on course title
            const gradientVariants = [
              "from-blue-500/20 to-indigo-500/5",
              "from-emerald-500/20 to-teal-500/5",
              "from-violet-500/20 to-fuchsia-500/5",
              "from-amber-500/20 to-orange-500/5",
            ];
            const gradientClass = gradientVariants[course.title.length % gradientVariants.length];

            return (
              <Card
                key={enrollment.id}
                className={cn(
                  "group overflow-hidden rounded-2xl border border-border/50 transition-all duration-300",
                  "hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-primary/5 hover:-translate-y-1 cursor-pointer",
                )}
                onClick={() => openCourse(enrollment.course_id)}
              >
                <div className={cn("h-16 w-full bg-gradient-to-r", gradientClass)} />
                <CardContent className="relative -mt-6 space-y-4 p-5 pt-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-background border shadow-sm">
                    {course.thumbnail_url ? (
                      <img
                        src={course.thumbnail_url}
                        className="h-full w-full object-cover rounded-xl"
                        alt=""
                      />
                    ) : (
                      <BookOpen className="size-5 text-muted-foreground" />
                    )}
                  </div>

                  <div>
                    <p className="line-clamp-2 text-base font-bold leading-tight text-foreground group-hover:text-primary transition-colors">
                      {course.title}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {course.subtitle || "Continue where you left off"}
                    </p>
                  </div>

                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                      <span>Progress</span>
                      <span className={pct === 100 ? "text-emerald-500" : "text-primary"}>
                        {Math.round(pct)}%
                      </span>
                    </div>
                    <Progress
                      value={pct}
                      className={cn(
                        "h-1.5 bg-muted/60",
                        pct === 100 ? "[&>div]:bg-emerald-500" : "[&>div]:bg-primary",
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
