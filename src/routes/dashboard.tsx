// ---------------------------------------------------------------------------
// EduOS — /dashboard Layout Route
//
// This file is a LAYOUT-ONLY route. It renders the persistent shell
// (DashboardSidebar + Topbar) and a single <Outlet /> where all child
// routes render their page content.
//
// ┌─ DashboardSidebar ─┬─ Topbar ─────────────────────────────┐
// │  Our Class         │                                      │
// │  ─────────────     ├──────────────────────────────────────┤
// │  OVERVIEW          │  <Outlet />                          │
// │   Dashboard        │                                      │
// │   Analytics soon   │  → /dashboard/          (index.tsx)  │
// │  MANAGE            │  → /dashboard/admin/    (admin page) │
// │   Students     ←── │  → /dashboard/admin/students/        │
// │   Parents          │  → /dashboard/admin/parents/         │
// └────────────────────┴──────────────────────────────────────┘
//
// WHY <Outlet /> is required:
//   All sub-routes (/dashboard/admin/students/, etc.) are registered as
//   children of this route in routeTree.gen.ts. TanStack Router renders
//   child content inside the parent's <Outlet />. Without it, child routes
//   match the URL but their components never render — the user would see
//   only the sidebar/topbar and an empty content area.
// ---------------------------------------------------------------------------

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardSidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard — EduOS" }],
  }),
  component: DashboardLayoutPage,
});

function DashboardLayoutPage() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  function handleToggleSidebar() {
    if (isMobile) {
      setMobileSidebarOpen((open) => !open);
      return;
    }

    setCollapsed((open) => !open);
  }

  return (
    <div className="flex min-h-svh w-full overflow-x-hidden bg-background">
      {/* Persistent sidebar — role-aware navigation */}
      <DashboardSidebar
        collapsed={collapsed}
        mobileOpen={mobileSidebarOpen}
        onMobileOpenChange={setMobileSidebarOpen}
      />

      {/* Right column: topbar + page content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onToggleSidebar={handleToggleSidebar} />

        {/* All child routes render here */}
        <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 sm:py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
