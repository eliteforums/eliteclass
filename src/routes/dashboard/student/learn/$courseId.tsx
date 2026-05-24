// ---------------------------------------------------------------------------
// EduOS — /dashboard/student/learn/$courseId
// Full-screen course learning page (wraps CoursePlayer).
// Uses position:fixed to overlay the dashboard layout completely.
// ---------------------------------------------------------------------------

import { useEffect, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { useCourseStore } from "@/modules/courses/store/courseStore";
import { useAllLessonProgress } from "@/modules/courses/hooks/useProgress";
import { CoursePlayer } from "@/modules/courses/components/player/CoursePlayer";
import {
  getStudentEnrollment,
} from "@/modules/courses/services/course.service";
import { upsertLessonProgress } from "@/modules/courses/services/progress.service";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { enrollmentKeys } from "@/modules/courses/hooks/useEnrollment";
import { progressKeys } from "@/modules/courses/hooks/useProgress";
import { getStudentCourseCurriculum } from "@/modules/courses/services/student-curriculum.server";
import type { LmsLessonProgress } from "@/types";

// ── Route ─────────────────────────────────────────────────────────────────────

type LearnSearch = {
  lessonId?: string;
};

export const Route = createFileRoute("/dashboard/student/learn/$courseId")({
  validateSearch: (search: Record<string, unknown>): LearnSearch => ({
    lessonId: (search.lessonId as string) || undefined,
  }),
  head: () => ({ meta: [{ title: "Learn — EduOS" }] }),
  component: LearnPageWrapper,
});

// ── Wrapper (applies ProtectedRoute) ─────────────────────────────────────────

function LearnPageWrapper() {
  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <LearnPage />
    </ProtectedRoute>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function LearnPage() {
  const { courseId } = Route.useParams();
  const { lessonId: initialLessonId } = Route.useSearch();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // Zustand store for optimistic progress updates
  const progressMap = useCourseStore((s) => s.lessonProgressMap);
  const setProgressMap = useCourseStore((s) => s.setProgressMap);
  const setLessonProgress = useCourseStore((s) => s.setLessonProgress);
  const updateLessonProgress = useCourseStore((s) => s.updateLessonProgress);
  const clearProgress = useCourseStore((s) => s.clearProgress);
  const queryClient = useQueryClient();

  const instituteId = user?.institute_id ?? "";
  const studentId = user?.id ?? "";

  // ── Fetch enrollment ───────────────────────────────────────────────────

  const {
    data: enrollment,
    isLoading: enrollmentLoading,
    error: enrollmentError,
  } = useQuery({
    queryKey: [...enrollmentKeys.check(courseId, studentId), instituteId] as const,
    queryFn: async () => {
      const res = await getStudentEnrollment(courseId, studentId, instituteId);
      if (!res.success || !res.data) {
        throw new Error(res.error ?? "Enrollment not found");
      }
      return res.data;
    },
    enabled: !!courseId && !!studentId && !!instituteId,
    retry: false,
  });

  // ── Fetch course curriculum ────────────────────────────────────────────

  const {
    data: course,
    isLoading: courseLoading,
    error: courseError,
  } = useQuery({
    queryKey: ["course-curriculum", courseId, instituteId],
    queryFn: async () => {
      const res = await getStudentCourseCurriculum({
        data: {
          courseId,
          enrollmentId: enrollment.id,
          studentId,
          instituteId,
        },
      });
      if (!res.success || !res.data) {
        throw new Error(res.error ?? "Course not found");
      }
      return res.data;
    },
    enabled: !!courseId && !!instituteId && !!enrollment?.id,
    staleTime: 5 * 60 * 1000, // 5 min — curriculum rarely changes
  });

  // ── Fetch all lesson progress ──────────────────────────────────────────

  const { data: progressMapFromQuery, isLoading: progressLoading } = useAllLessonProgress(
    enrollment?.id ?? "",
    courseId,
  );

  // ── Sync query data → Zustand store ───────────────────────────────────

  useEffect(() => {
    if (progressMapFromQuery) {
      setProgressMap(progressMapFromQuery);
    }
  }, [progressMapFromQuery, setProgressMap]);

  // ── Clean up Zustand store when leaving the player ─────────────────────

  useEffect(() => {
    return () => {
      clearProgress();
    };
  }, [clearProgress]);

  // ── Handle enrollment errors (redirect if not enrolled) ───────────────

  useEffect(() => {
    if (enrollmentError) {
      toast.error("You are not enrolled in this course.");
      void navigate({ to: "/dashboard/student/my-learning" });
    }
  }, [enrollmentError, navigate]);

  // ── onProgressUpdate callback ─────────────────────────────────────────

  const handleProgressUpdate = useCallback(
    (lessonId: string, data: Partial<LmsLessonProgress>) => {
      if (!enrollment || !studentId || !instituteId) return;

      // 1. Optimistic update in Zustand store immediately
      const existing = progressMap[lessonId];
      if (existing) {
        updateLessonProgress(lessonId, data);
      }

      // 2. Persist to DB (fire-and-forget; errors are non-critical)
      void upsertLessonProgress({
        enrollment_id: enrollment.id,
        lesson_id: lessonId,
        student_id: studentId,
        course_id: courseId,
        institute_id: instituteId,
        is_completed: data.is_completed ?? existing?.is_completed,
        watch_seconds: data.watch_seconds ?? existing?.watch_seconds,
        last_position_secs: data.last_position_secs ?? existing?.last_position_secs,
      }).then((res) => {
        if (res.success && res.data) {
          // Reconcile with server data
          setLessonProgress(lessonId, res.data);
          // Invalidate course progress to update the progress bar
          void queryClient.invalidateQueries({
            queryKey: progressKeys.course(enrollment.id),
          });
        }
      });
    },
    [
      enrollment,
      studentId,
      instituteId,
      courseId,
      progressMap,
      updateLessonProgress,
      setLessonProgress,
      queryClient,
    ],
  );

  // ── Loading state ──────────────────────────────────────────────────────

  const isLoading = enrollmentLoading || courseLoading || progressLoading;

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-background">
        {/* Fake header */}
        <div className="flex h-14 items-center gap-3 border-b border-border bg-slate-900 px-4">
          <Skeleton className="size-8 rounded-md bg-slate-700" />
          <Skeleton className="h-4 w-48 bg-slate-700" />
          <div className="flex-1" />
          <Skeleton className="h-4 w-24 bg-slate-700" />
        </div>

        {/* Fake video area */}
        <div className="flex flex-1">
          <div className="flex flex-1 flex-col">
            <Skeleton className="aspect-video w-full rounded-none bg-slate-800" />
            <div className="flex items-center justify-between p-4">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
          {/* Fake sidebar */}
          <div className="hidden w-80 border-l border-border bg-card p-4 md:block">
            <Skeleton className="mb-4 h-5 w-32" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="mb-4 h-2 w-full" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="mb-3 h-12 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error state (course not found) ────────────────────────────────────

  if (courseError || !course) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background">
        <AlertCircle className="size-12 text-muted-foreground/40" />
        <h2 className="text-lg font-semibold text-foreground">Course not found</h2>
        <p className="text-sm text-muted-foreground">
          {courseError instanceof Error ? courseError.message : "This course could not be loaded."}
        </p>
        <Button
          variant="outline"
          onClick={() => void navigate({ to: "/dashboard/student/my-learning" })}
          className="gap-2"
        >
          <ArrowLeft className="size-4" />
          Back to My Learning
        </Button>
      </div>
    );
  }

  // ── Enrollment not yet resolved (should have redirected) ──────────────

  if (!enrollment) {
    return null;
  }

  // ── Render CoursePlayer ────────────────────────────────────────────────

  return (
    <CoursePlayer
      course={course}
      enrollment={enrollment}
      initialLessonId={initialLessonId}
      progressMap={progressMap}
      onProgressUpdate={handleProgressUpdate}
    />
  );
}
