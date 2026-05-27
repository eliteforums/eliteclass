import React, { Suspense } from "react";

/**
 * Lazy route wrappers for heavy modules.
 *
 * These wrap components that pull in large dependencies (recharts, canvas, jspdf)
 * so they are code-split into separate async chunks and only loaded when needed.
 */

// ---------------------------------------------------------------------------
// Loading fallback
// ---------------------------------------------------------------------------

function RouteLoader() {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lazy imports — recharts-dependent components
// ---------------------------------------------------------------------------

const LazyTeacherStudentProfileView = React.lazy(() =>
  import("@/modules/teacher-students/components/TeacherStudentProfileView").then(
    (m) => ({ default: m.TeacherStudentProfileView }),
  ),
);

const LazyAttendanceChart = React.lazy(() =>
  import("@/components/dashboard/student/AttendanceChart").then((m) => ({
    default: m.AttendanceChart,
  })),
);

const LazyAttendanceAnalyticsCharts = React.lazy(() =>
  import("@/modules/analytics/components/AttendanceAnalyticsCharts").then(
    (m) => ({ default: m.AttendanceAnalyticsCharts }),
  ),
);

const LazyFeeAnalyticsCharts = React.lazy(() =>
  import("@/modules/analytics/components/FeeAnalyticsCharts").then((m) => ({
    default: m.FeeAnalyticsCharts,
  })),
);

const LazyScheduleStaffAnalytics = React.lazy(() =>
  import("@/modules/analytics/components/ScheduleStaffAnalytics").then(
    (m) => ({ default: m.ScheduleStaffAnalytics }),
  ),
);

// ---------------------------------------------------------------------------
// Lazy imports — canvas/jspdf-dependent components
// ---------------------------------------------------------------------------

const LazyCanvasEditor = React.lazy(
  () => import("@/components/canvas/CanvasEditor"),
);

const LazyCanvasModal = React.lazy(
  () => import("@/modules/assignments/components/admin/CanvasModal"),
);

const LazyNotebook = React.lazy(
  () => import("@/components/notebook/Notebook"),
);

const LazyCreateAssignment = React.lazy(
  () => import("@/components/assignments/CreateAssignment"),
);

// ---------------------------------------------------------------------------
// Suspense-wrapped exports — recharts
// ---------------------------------------------------------------------------

export function TeacherStudentProfileViewLazy(
  props: React.ComponentProps<typeof LazyTeacherStudentProfileView>,
) {
  return (
    <Suspense fallback={<RouteLoader />}>
      <LazyTeacherStudentProfileView {...props} />
    </Suspense>
  );
}

export function AttendanceChartLazy(
  props: React.ComponentProps<typeof LazyAttendanceChart>,
) {
  return (
    <Suspense fallback={<RouteLoader />}>
      <LazyAttendanceChart {...props} />
    </Suspense>
  );
}

export function AttendanceAnalyticsChartsLazy(
  props: React.ComponentProps<typeof LazyAttendanceAnalyticsCharts>,
) {
  return (
    <Suspense fallback={<RouteLoader />}>
      <LazyAttendanceAnalyticsCharts {...props} />
    </Suspense>
  );
}

export function FeeAnalyticsChartsLazy(
  props: React.ComponentProps<typeof LazyFeeAnalyticsCharts>,
) {
  return (
    <Suspense fallback={<RouteLoader />}>
      <LazyFeeAnalyticsCharts {...props} />
    </Suspense>
  );
}

export function ScheduleStaffAnalyticsLazy(
  props: React.ComponentProps<typeof LazyScheduleStaffAnalytics>,
) {
  return (
    <Suspense fallback={<RouteLoader />}>
      <LazyScheduleStaffAnalytics {...props} />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Suspense-wrapped exports — canvas / jspdf
// ---------------------------------------------------------------------------

export function CanvasEditorLazy(
  props: React.ComponentProps<typeof LazyCanvasEditor>,
) {
  return (
    <Suspense fallback={<RouteLoader />}>
      <LazyCanvasEditor {...props} />
    </Suspense>
  );
}

export function CanvasModalLazy(
  props: React.ComponentProps<typeof LazyCanvasModal>,
) {
  return (
    <Suspense fallback={<RouteLoader />}>
      <LazyCanvasModal {...props} />
    </Suspense>
  );
}

export function NotebookLazy() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <LazyNotebook />
    </Suspense>
  );
}

export function CreateAssignmentLazy() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <LazyCreateAssignment />
    </Suspense>
  );
}
