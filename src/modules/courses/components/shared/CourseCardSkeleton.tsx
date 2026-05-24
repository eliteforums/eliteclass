// ---------------------------------------------------------------------------
// CourseCardSkeleton — loading placeholder matching the CourseCard layout.
// Uses the shadcn Skeleton component for consistent animate-pulse styling.
// ---------------------------------------------------------------------------

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

export function CourseCardSkeleton() {
  return (
    <Card className="flex flex-col overflow-hidden rounded-xl border">
      {/* Thumbnail placeholder (16:9) */}
      <Skeleton className="aspect-video w-full rounded-none" />

      {/* Body */}
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        {/* Category */}
        <Skeleton className="h-3 w-20 rounded" />

        {/* Title */}
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-4/5 rounded" />
        </div>

        {/* Subtitle */}
        <Skeleton className="h-3 w-3/4 rounded" />

        {/* Difficulty badge */}
        <Skeleton className="h-5 w-20 rounded-md" />

        {/* Stats row */}
        <div className="mt-auto flex items-center gap-3 pt-2">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-3 w-12 rounded" />
        </div>
      </CardContent>

      {/* Footer */}
      <CardFooter className="flex items-center justify-between border-t border-border px-4 py-3">
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="h-7 w-7 rounded-md" />
      </CardFooter>
    </Card>
  );
}
