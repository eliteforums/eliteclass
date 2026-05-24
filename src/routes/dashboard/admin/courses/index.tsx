// ---------------------------------------------------------------------------
// Admin / Staff — Course Management Page
// Route: /dashboard/admin/courses/
//
// Features:
//   - Gradient header with badge + New Course CTA
//   - 4 stat cards (Total / Published / Draft / Enrolled)
//   - CourseFilters bar (search + status + difficulty, debounced)
//   - Paginated 3-column course grid
//   - Loading skeletons, empty state
//   - Publish / Archive / Delete mutations with toast feedback
//   - AlertDialog for delete confirmation
//   - EnrollmentManager dialog
// ---------------------------------------------------------------------------

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Users, Globe, FileText, ChevronLeft, ChevronRight, Plus } from "lucide-react";

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
import { EnrollmentManager } from "@/modules/courses/components/admin/EnrollmentManager";

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

export const Route = createFileRoute("/dashboard/admin/courses/")({
  head: () => ({ meta: [{ title: "Courses \u2014 EduOS" }] }),
  component: AdminCoursesPage,
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

function AdminCoursesPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isStaff = user?.role === "staff";
  const instituteId = user?.institute_id ?? "";

  // ── Filter state ─────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LmsCourseStatus | "all">("all");
  const [difficultyFilter, setDifficultyFilter] = useState<LmsDifficulty | "all">("all");
  const [page, setPage] = useState(1);

  // Build filters object — reset to page 1 whenever filters change
  const filters: CourseFilters = {
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    difficulty: difficultyFilter !== "all" ? difficultyFilter : undefined,
    // Staff see courses they created or are assigned to (handled by RLS)
    // We no longer pass created_by for staff to allow seeing assigned courses
    page,
    pageSize: 12,
  };

  // ── Dialog state ─────────────────────────────────────────────────────────
  const [courseToDelete, setCourseToDelete] = useState<LmsCourse | null>(null);
  const [enrollCourse, setEnrollCourse] = useState<LmsCourse | null>(null);

  // ── Data hooks ───────────────────────────────────────────────────────────
  const { data, isLoading, isFetching } = useCourses(filters);
  const { data: stats } = useCourseStats(); // Removed isStaff ? user.id filter

  const { mutate: publishCourse, isPending: publishing } = usePublishCourse();
  const { mutate: archiveCourse, isPending: archiving } = useArchiveCourse();
  const { mutate: deleteCourse, isPending: deleting } = useDeleteCourse();

  const courses = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleFilterChange = (updater: () => void) => {
    updater();
    setPage(1); // always reset pagination when filters change
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
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      {/* ── Gradient header ──────────────────────────────────────────────── */}
      <div className="relative mb-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 py-5">
        {/* Decorative blobs */}
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
              {isStaff ? "My Courses" : "Course Management"}
            </Badge>
            <h1 className="text-2xl font-semibold text-foreground">
              {isStaff ? "My Courses" : "Courses"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isStaff
                ? "Manage and publish the courses you've created for your students."
                : "Create, manage, and publish your institute's learning catalog."}
            </p>
          </div>

          <Button onClick={goToCreate} className="shrink-0 gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Course
          </Button>
        </div>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
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
        <StatCard
          label="Total Enrolled"
          value={stats?.totalEnrollments?.toLocaleString() ?? "—"}
          icon={Users}
          colorClass="bg-purple-100 dark:bg-purple-950"
          iconColorClass="text-purple-600 dark:text-purple-400"
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
        role={isStaff ? "staff" : "admin"}
      />

      {/* ── Course grid ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CourseCardSkeleton key={i} />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyCoursesState role={isStaff ? "staff" : "admin"} onCreateCourse={goToCreate} />
      ) : (
        <>
          {/* Subtle fetching indicator (filter change, pagination) */}
          {isFetching && !isLoading && (
            <p className="mt-4 text-xs text-muted-foreground animate-pulse">Updating…</p>
          )}

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((course: LmsCourse) => (
              <CourseCard
                key={course.id}
                course={course}
                variant={isStaff ? "staff" : "admin"}
                onEdit={(c: LmsCourse) =>
                  navigate({
                    to: "/dashboard/admin/courses/create" as never,
                    search: { edit: c.id } as never,
                  })
                }
                onPublish={handlePublish}
                onArchive={handleArchive}
                onDelete={setCourseToDelete}
                onEnroll={setEnrollCourse}
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
              <span className="font-medium text-foreground">"{courseToDelete?.title}"</span> along
              with all its modules, lessons, and enrollment records. This action cannot be undone.
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

      {/* ── Enrollment Manager dialog ─────────────────────────────────────── */}
      {enrollCourse && (
        <EnrollmentManager
          courseId={enrollCourse.id}
          open={!!enrollCourse}
          onClose={() => setEnrollCourse(null)}
          instituteId={instituteId}
        />
      )}
    </ProtectedRoute>
  );
}
