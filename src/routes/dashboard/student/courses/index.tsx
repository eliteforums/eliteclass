// ---------------------------------------------------------------------------
// EduOS — /dashboard/student/courses
// Browse published institute courses and self-enroll
// ---------------------------------------------------------------------------

import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpen, Search } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CatalogCourseCard } from "@/modules/courses/components/student/CatalogCourseCard";
import { useStudentCourseCatalog } from "@/modules/courses/hooks/useEnrollment";
import type { CourseListFilters } from "@/modules/courses/services/course.service";

export const Route = createFileRoute("/dashboard/student/courses/")({
  head: () => ({ meta: [{ title: "Browse Courses — EduOS" }] }),
  component: StudentCoursesPage,
});

function StudentCoursesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const filters: CourseListFilters = {
    search: search.trim() || undefined,
    page: 1,
    pageSize: 24,
  };

  const { data, isLoading, error } = useStudentCourseCatalog(filters);
  const courses = data?.items ?? [];

  const openCourse = (courseId: string) => {
    void navigate({
      to: "/dashboard/student/learn/$courseId",
      params: { courseId },
    });
  };

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[2rem] border border-border/40 bg-card p-6 md:p-10 shadow-lg">
          {/* Decorative background blobs */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 size-[300px] rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 size-[200px] rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-6">
            <div className="space-y-4 max-w-2xl">
              <Badge
                variant="outline"
                className="gap-1.5 px-3 py-1 bg-background/50 backdrop-blur-sm border-primary/20 text-primary w-fit"
              >
                <BookOpen className="size-3.5" />
                Course Catalog
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl leading-tight">
                Browse{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-indigo-600">
                  Courses
                </span>
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground leading-relaxed">
                Enroll in published courses from your institute. After enrolling, courses appear in
                My Learning and you can start lessons immediately.
              </p>
            </div>

            <div className="relative max-w-md">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search for a topic or course..."
                className="pl-10 h-12 rounded-xl bg-background border-border/60 shadow-sm focus-visible:ring-primary/20 transition-all"
              />
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load courses"}
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
            No published courses match your search.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courses.map((course) => (
              <CatalogCourseCard key={course.id} course={course} onOpenCourse={openCourse} />
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
