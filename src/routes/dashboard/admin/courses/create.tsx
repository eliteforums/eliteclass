// ---------------------------------------------------------------------------
// EduOS — Course Creation / Editing Route
//
// Route: /dashboard/admin/courses/create
//
// Search params:
//   ?edit={courseId}  →  opens wizard in edit mode for an existing course
//
// Access: admin and staff roles only.
// On complete → navigate to /dashboard/admin/courses (course list)
// On cancel   → navigate to /dashboard/admin/courses
// ---------------------------------------------------------------------------

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { CourseWizard } from "@/modules/courses/components/wizard/CourseWizard";

// ── Route definition ──────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/admin/courses/create")({
  head: () => ({
    meta: [{ title: "Create Course — EduOS" }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    edit: typeof search.edit === "string" ? search.edit : undefined,
  }),
  component: CreateCoursePage,
});

// ── Page component ────────────────────────────────────────────────────────────

function CreateCoursePage() {
  const navigate = useNavigate();
  const { edit } = Route.useSearch();

  const handleComplete = (courseId: string) => {
    // Navigate to the course list after completing the wizard.
    // Replace history entry so the user can't accidentally go back to the wizard.
    navigate({ to: "/dashboard/admin/courses" as never, replace: true });
  };

  const handleCancel = () => {
    // Navigate back with browser history if possible, otherwise to course list.
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate({ to: "/dashboard/admin/courses" as never, replace: true });
    }
  };

  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      <div className="max-w-4xl mx-auto">
        <CourseWizard courseId={edit} onComplete={handleComplete} onCancel={handleCancel} />
      </div>
    </ProtectedRoute>
  );
}
