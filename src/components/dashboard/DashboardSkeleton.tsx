// ---------------------------------------------------------------------------
// DashboardSkeleton — full-page skeleton for /dashboard/ transitions
//
// Renders immediately during route loading so users see structure
// rather than a blank screen. Mirrors the layout of DashboardOverview:
// greeting header → stat cards → recent table + AI panel.
// ---------------------------------------------------------------------------

import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="animate-in fade-in duration-200">
      {/* Greeting header skeleton */}
      <div className="mb-8">
        <Skeleton className="h-3 w-16 mb-2" />
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <Skeleton className="h-3 w-24 mb-3" />
                <Skeleton className="h-9 w-20" />
              </div>
              <Skeleton className="h-10 w-10 rounded-xl" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-20" />
            </div>
          </div>
        ))}
      </div>

      {/* Recent table + AI panel row */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Table skeleton */}
        <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-border bg-card">
          {/* Table header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <Skeleton className="h-4 w-36 mb-1" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
          {/* Table rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-t border-border px-5 py-3"
            >
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 w-32 mb-1" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>

        {/* AI panel skeleton */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card p-5">
          <Skeleton className="h-5 w-28 mb-4" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4 mb-4" />
          <Skeleton className="h-24 w-full rounded-xl mb-4" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
