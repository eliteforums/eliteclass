// ---------------------------------------------------------------------------
// Admin / Staff — Course detail & analytics
// Route: /dashboard/admin/courses/:courseId
// ---------------------------------------------------------------------------

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Edit, UserPlus } from "lucide-react";
import { useState } from "react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { useCourseDetail } from "@/modules/courses/hooks/useCourses";
import { CourseAnalyticsPanel } from "@/modules/courses/components/admin/CourseAnalyticsPanel";
import { EnrollmentManager } from "@/modules/courses/components/admin/EnrollmentManager";
import { CourseEnrollmentsList } from "@/modules/courses/components/admin/CourseEnrollmentsList";
import { DifficultyBadge } from "@/modules/courses/components/shared/DifficultyBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/dashboard/admin/courses/$courseId")({
  head: () => ({ meta: [{ title: "Course Details — EduOS" }] }),
  component: CourseDetailPage,
});

function CourseDetailPage() {
  const { courseId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";
  const isStaff = user?.role === "staff";

  const { data: course, isLoading, error } = useCourseDetail(courseId);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const canManage = !isStaff || (course && user?.id && course.created_by === user.id);

  if (isLoading) {
    return (
      <ProtectedRoute allowedRoles={["admin", "staff"]}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </ProtectedRoute>
    );
  }

  if (error || !course) {
    return (
      <ProtectedRoute allowedRoles={["admin", "staff"]}>
        <div className="rounded-xl border border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">Course not found or access denied.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate({ to: "/dashboard/admin/courses" })}
          >
            Back to courses
          </Button>
        </div>
      </ProtectedRoute>
    );
  }

  if (!canManage) {
    return (
      <ProtectedRoute allowedRoles={["admin", "staff"]}>
        <div className="rounded-xl border border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">You can only view courses you created.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate({ to: "/dashboard/staff/courses" })}
          >
            Back to my courses
          </Button>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              navigate({
                to: isStaff ? "/dashboard/staff/courses" : "/dashboard/admin/courses",
              })
            }
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{course.title}</h1>
            {course.subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{course.subtitle}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {course.status}
              </Badge>
              <DifficultyBadge difficulty={course.difficulty} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setEnrollOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Enroll students
          </Button>
          <Button
            className="gap-2"
            onClick={() =>
              navigate({
                to: "/dashboard/admin/courses/create",
                search: { edit: course.id },
              })
            }
          >
            <Edit className="h-4 w-4" />
            Edit course
          </Button>
        </div>
      </div>

      {course.thumbnail_url && (
        <img
          src={course.thumbnail_url}
          alt=""
          className="mb-6 aspect-video w-full max-h-56 rounded-xl border border-border object-cover"
        />
      )}

      <Tabs defaultValue="analytics">
        <TabsList>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments</TabsTrigger>
        </TabsList>
        <TabsContent value="analytics" className="mt-4">
          <CourseAnalyticsPanel course={course} />
        </TabsContent>
        <TabsContent value="enrollments" className="mt-4">
          <CourseEnrollmentsList courseId={course.id} />
        </TabsContent>
        <TabsContent value="overview" className="mt-4">
          <div className="prose prose-sm dark:prose-invert max-w-none rounded-xl border border-border bg-card p-6">
            {course.description ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {course.description}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No description yet.</p>
            )}
            {course.learning_outcomes.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-foreground">Learning outcomes</h3>
                <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                  {course.learning_outcomes.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <EnrollmentManager
        courseId={course.id}
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        instituteId={instituteId}
      />
    </ProtectedRoute>
  );
}
