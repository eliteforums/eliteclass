// ---------------------------------------------------------------------------
// Staff — My Courses Page
// Route: /dashboard/staff/courses/
//
// Scoped to courses created by the logged-in staff member (created_by filter).
// Same grid / filter / pagination UX as the admin page, minus the
// EnrollmentManager and scoped to staff role only.
// ---------------------------------------------------------------------------

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Globe, FileText, ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";

import {
  useCourses,
  useCourseStats,
  usePublishCourse,
  useArchiveCourse,
  useDeleteCourse,
} from "@/modules/courses/hooks/useCourses";
import type { CourseFilters } from "@/modules/courses/hooks/useCourses";

import { CourseCard } from "@/modules/courses/components/shared/CourseCard";
import { CourseCardSkeleton } from "@/modules/courses/components/shared/CourseCardSkeleton";
import { EmptyCoursesState } from "@/modules/courses/components/shared/EmptyCoursesState";
import { CourseFilters as CourseFiltersBar } from "@/modules/courses/components/admin/CourseFilters";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import type { LmsCourse, LmsCourseStatus, LmsDifficulty } from "@/types";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/staff/courses/")({
  head: () => ({ meta: [{ title: "My Courses \u2014 EduOS" }] }),
  component: StaffCoursesPage,
});

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  iconColorClass: string;
}

function StatCard({ label, value, icon: Icon, colorClass, iconColorClass }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colorClass}`}
      >
        <Icon className={`h-5 w-5 ${iconColorClass}`} aria-hidden="true" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-foreground tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────

function StaffCoursesPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const staffId = user?.id ?? "";

  // ── Filter state ─────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LmsCourseStatus | "all">("all");
  const [difficultyFilter, setDifficultyFilter] = useState<LmsDifficulty | "all">("all");
  const [page, setPage] = useState(1);

  // Staff see courses they created or are assigned to (handled by RLS)
  const filters: CourseFilters = {
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    difficulty: difficultyFilter !== "all" ? difficultyFilter : undefined,
    page,
    pageSize: 12,
  };

  // ── Dialog state ─────────────────────────────────────────────────────────
  const [courseToDelete, setCourseToDelete] = useState<LmsCourse | null>(null);

  // ── Data hooks ───────────────────────────────────────────────────────────
  const { data, isLoading, isFetching } = useCourses(filters);
  const { data: stats } = useCourseStats(); // Removed created_by filter

  const { mutate: publishCourse, isPending: publishing } = usePublishCourse();
  const { mutate: archiveCourse, isPending: archiving } = useArchiveCourse();
  const { mutate: deleteCourse, isPending: deleting } = useDeleteCourse();

  const courses = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleFilterChange = (updater: () => void) => {
    updater();
    setPage(1);
  };

  const handlePublish = (course: LmsCourse) => {
    publishCourse(course.id, {
      onSuccess: () => toast.success(`"${course.title}" is now published`),
      onError: (err: Error) => toast.error(err.message ?? "Failed to publish course"),
    });
  };

  const handleArchive = (course: LmsCourse) => {
    archiveCourse(course.id, {
      onSuccess: () => toast.success(`"${course.title}" has been archived`),
      onError: (err: Error) => toast.error(err.message ?? "Failed to archive course"),
    });
  };

  const handleDeleteConfirm = () => {
    if (!courseToDelete) return;
    const title = courseToDelete.title;
    deleteCourse(courseToDelete.id, {
      onSuccess: () => {
        toast.success(`"${title}" has been deleted`);
        setCourseToDelete(null);
      },
      onError: (err: Error) => toast.error(err.message ?? "Failed to delete course"),
    });
  };

  const goToCreate = () => navigate({ to: "/dashboard/admin/courses/create" as never });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute allowedRoles={["staff"]}>
      {/* ── Gradient header ──────────────────────────────────────────────── */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 py-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/10 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-8 left-1/3 h-32 w-32 rounded-full bg-primary/5 blur-2xl"
        />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary" className="mb-2">
              My Courses
            </Badge>
            <h1 className="text-2xl font-semibold text-foreground">My Courses</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage and publish the courses you've created for your students.
            </p>
          </div>

          <Button onClick={goToCreate} className="shrink-0 gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Course
          </Button>
        </div>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Courses"
          value={stats?.total ?? "—"}
          icon={BookOpen}
          colorClass="bg-blue-100 dark:bg-blue-950"
          iconColorClass="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label="Published"
          value={stats?.published ?? "—"}
          icon={Globe}
          colorClass="bg-emerald-100 dark:bg-emerald-950"
          iconColorClass="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          label="Draft"
          value={stats?.draft ?? "—"}
          icon={FileText}
          colorClass="bg-amber-100 dark:bg-amber-950"
          iconColorClass="text-amber-600 dark:text-amber-400"
        />
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <CourseFiltersBar
        search={search}
        onSearchChange={(v: string) => handleFilterChange(() => setSearch(v))}
        statusFilter={statusFilter}
        onStatusChange={(v: LmsCourseStatus | "all") =>
          handleFilterChange(() => setStatusFilter(v))
        }
        difficultyFilter={difficultyFilter}
        onDifficultyChange={(v: LmsDifficulty | "all") =>
          handleFilterChange(() => setDifficultyFilter(v))
        }
        onCreateCourse={goToCreate}
        role="staff"
      />

      {/* ── Course grid ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CourseCardSkeleton key={i} />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyCoursesState role="staff" onCreateCourse={goToCreate} />
      ) : (
        <>
          {isFetching && !isLoading && (
            <p className="mt-4 text-xs text-muted-foreground animate-pulse">Updating…</p>
          )}

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((course: LmsCourse) => (
              <CourseCard
                key={course.id}
                course={course}
                variant="staff"
                onEdit={(c: LmsCourse) =>
                  navigate({
                    to: "/dashboard/admin/courses/create" as never,
                    search: { edit: c.id } as never,
                  })
                }
                onPublish={handlePublish}
                onArchive={handleArchive}
                onDelete={setCourseToDelete}
                onView={(c: LmsCourse) =>
                  navigate({
                    to: "/dashboard/admin/courses/$courseId",
                    params: { courseId: c.id },
                  })
                }
              />
            ))}
          </div>
        </>
      )}

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {totalPages > 1 && !isLoading && courses.length > 0 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1 || isFetching}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Prev
          </Button>

          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages || isFetching}
            className="gap-1"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* ── Delete confirmation dialog ────────────────────────────────────── */}
      <AlertDialog
        open={!!courseToDelete}
        onOpenChange={(open: boolean) => !open && setCourseToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete course?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">"{courseToDelete?.title}"</span> and all
              its content. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting || publishing || archiving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete course"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProtectedRoute>
  );
}
