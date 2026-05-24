// ---------------------------------------------------------------------------
// CourseEnrollmentsList — Admin view of students enrolled in a course
// ---------------------------------------------------------------------------

import { Loader2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useCourseEnrollments } from "@/modules/courses/hooks/useEnrollment";
import type { LmsEnrollment } from "@/types";

interface CourseEnrollmentsListProps {
  courseId: string;
}

export function CourseEnrollmentsList({ courseId }: CourseEnrollmentsListProps) {
  const { data, isLoading, error } = useCourseEnrollments(courseId, 1, 50);
  const items = (data?.items ?? []) as LmsEnrollment[];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load enrollments"}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
        <Users className="size-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
        <p className="text-xs text-muted-foreground">
          Use &quot;Enroll students&quot; to add learners to this course.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{data?.total ?? items.length} enrolled</Badge>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {items.map((row) => {
          const student = row.student as { name?: string; email?: string } | undefined;
          const progressArr = row.progress as unknown;
          const progress = Array.isArray(progressArr)
            ? (progressArr[0] as { completion_pct?: number } | undefined)
            : (progressArr as { completion_pct?: number } | null);
          const pct = progress?.completion_pct ?? 0;

          return (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {student?.name ?? "Student"}
                </p>
                <p className="truncate text-xs text-muted-foreground">{student?.email}</p>
              </div>
              <div className="flex w-40 flex-col gap-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{Math.round(pct)}%</span>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {row.status}
                  </Badge>
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>
            </li>
          );
        })}
      </ul>
      {(data?.total ?? 0) > items.length && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="size-3" />
          Showing first {items.length} of {data?.total} enrollments
        </p>
      )}
    </div>
  );
}
