// ---------------------------------------------------------------------------
// EmptyCoursesState — Role-aware empty state for course list pages.
// ---------------------------------------------------------------------------

import { BookOpen, GraduationCap, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyCoursesStateProps {
  role: "admin" | "staff" | "student";
  onCreateCourse?: () => void;
  onBrowse?: () => void;
}

export function EmptyCoursesState({ role, onCreateCourse, onBrowse }: EmptyCoursesStateProps) {
  const isEducator = role === "admin" || role === "staff";

  if (isEducator) {
    return (
      <div className="mt-10 flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 mb-5">
          <BookOpen className="h-10 w-10 text-primary" aria-hidden="true" />
        </div>

        <h2 className="text-lg font-semibold text-foreground">No courses yet</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {role === "admin"
            ? "Start building your institute's learning library. Create your first course to get started."
            : "You haven't created any courses yet. Create your first course to start teaching."}
        </p>

        {onCreateCourse && (
          <Button onClick={onCreateCourse} className="mt-6 gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create your first course
          </Button>
        )}
      </div>
    );
  }

  // Student variant
  return (
    <div className="mt-10 flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 mb-5">
        <GraduationCap className="h-10 w-10 text-primary" aria-hidden="true" />
      </div>

      <h2 className="text-lg font-semibold text-foreground">
        You haven't enrolled in any courses yet
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Explore available courses and start your learning journey today.
      </p>

      {onBrowse && (
        <Button onClick={onBrowse} variant="outline" className="mt-6">
          Browse Courses
        </Button>
      )}
    </div>
  );
}
