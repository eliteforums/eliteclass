import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/store/authStore";
import { getInitials } from "@/utils/helpers";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  CreditCard,
  MessageSquare,
  BarChart3,
  Sparkles,
  Settings,
  Building2,
  UserCheck,
  FileText,
  ClipboardList,
  Search,
  Brain,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { UserRole } from "@/types";

// ---------------------------------------------------------------------------
// Nav item shape
// ---------------------------------------------------------------------------
interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  /** When true the item is greyed-out and not clickable (future module). */
  comingSoon?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// ---------------------------------------------------------------------------
// Role-aware navigation map
// Each role gets the correct base paths — pointing to REAL routes that exist.
// Items marked `comingSoon` render as disabled placeholders.
// ---------------------------------------------------------------------------
function getNavGroups(role: UserRole, t: (key: string) => string): NavGroup[] {
  // Merge strategy: prefer non-destructive union of both branches.
  if (role === "admin") {
    return [
      {
        label: t("nav.overview") || "Overview",
        items: [
          { title: t("nav.dashboard") || "Dashboard", url: "/dashboard", icon: LayoutDashboard },
          { title: t("nav.analytics") || "Analytics", url: "/dashboard/analytics", icon: BarChart3 },
          { title: t("nav.aiAnalytics") || "AI Analytics", url: "/dashboard/admin/ai-analytics", icon: Brain },
        ],
      },
      {
        label: t("nav.manage") || "Manage",
        items: [
          { title: t("nav.students") || "Students", url: "/dashboard/admin/students", icon: GraduationCap },
          { title: t("nav.batches") || "Batches", url: "/dashboard/admin/batches", icon: BookOpen },
          { title: t("nav.batchRequests") || "Batch Requests", url: "/dashboard/admin/batch-requests", icon: ClipboardList },
          { title: t("nav.parents") || "Parents", url: "/dashboard/admin/parents", icon: Users },
          { title: t("nav.staff") || "Staff", url: "/dashboard/admin/staff", icon: UserCheck },
          { title: t("nav.courses") || "Courses", url: "/dashboard/admin/courses", icon: BookOpen },
          { title: t("nav.certificates") || "Certificates", url: "/dashboard/admin/certificates", icon: GraduationCap },
          { title: t("nav.exams") || "MCQ Tests", url: "/dashboard/admin/exams", icon: FileText },
          { title: t("nav.assignments") || "Assignments", url: "/dashboard/admin/assignments", icon: FileText },
          { title: t("nav.schedule") || "Schedule", url: "/dashboard/admin/schedule", icon: Calendar },
        ],
      },
      {
        label: t("nav.operations") || "Operations",
        items: [
          { title: t("nav.attendance") || "Attendance", url: "/dashboard/admin/attendance", icon: Calendar },
          { title: t("nav.progressTracker") || "Progress Tracker", url: "/dashboard/admin/study-logs", icon: LayoutDashboard },
          { title: t("nav.fees") || "Fees & Billing", url: "/dashboard/admin/fees", icon: CreditCard },
          { title: "Reports & Logs", url: "/dashboard/admin/reports", icon: FileText },
          { title: t("nav.messages") || "Communication", url: "/dashboard/messages", icon: MessageSquare },
          { title: t("nav.notifications") || "Notifications", url: "/dashboard/notifications", icon: Bell },
          { title: t("nav.ai") || "AI Assistant", url: "/dashboard/ai", icon: Sparkles },
        ],
      },
    ];
  }

  if (role === "super_admin") {
    return [
      {
        label: t("nav.overview") || "Overview",
        items: [
          { title: t("nav.dashboard") || "Dashboard", url: "/dashboard/super-admin", icon: LayoutDashboard },
          { title: t("nav.analytics") || "Analytics", url: "/dashboard/analytics", icon: BarChart3 },
        ],
      },
      {
        label: t("nav.platform") || "Platform",
        items: [
          { title: t("nav.institutes") || "Institutes", url: "/dashboard/super-admin", icon: Building2 },
          { title: t("nav.users") || "Users", url: "/dashboard/super-admin", icon: Users },
        ],
      },
    ];
  }

  if (role === "staff") {
    return [
      {
        label: t("nav.overview") || "Overview",
        items: [
          { title: t("nav.dashboard") || "Dashboard", url: "/dashboard/staff", icon: LayoutDashboard },
          { title: t("nav.students") || "Students", url: "/dashboard/staff/students", icon: GraduationCap },
          { title: t("nav.schedule") || "Schedule", url: "/dashboard/admin/schedule", icon: Calendar },
          { title: t("nav.myCourses") || "My Courses", url: "/dashboard/staff/courses", icon: BookOpen },
          { title: t("nav.canvas") || "Canvas", url: "/dashboard/admin/assignments", icon: FileText },
        ],
      },
      {
        label: t("nav.operations") || "Operations",
        items: [
          { title: t("nav.attendance") || "Attendance", url: "/dashboard/admin/attendance", icon: Calendar },
          { title: t("nav.exams") || "MCQ Tests", url: "/dashboard/admin/exams", icon: FileText },
          { title: t("nav.assignments") || "Assignments", url: "/dashboard/admin/assignments", icon: FileText },
          { title: t("nav.certificates") || "Certificates", url: "/dashboard/admin/certificates", icon: GraduationCap },
          { title: t("nav.batchRequests") || "Batch Requests", url: "/dashboard/admin/batch-requests", icon: ClipboardList },
          { title: t("nav.progressTracker") || "Progress Tracker", url: "/dashboard/admin/study-logs", icon: LayoutDashboard },
          { title: t("nav.messages") || "Communication", url: "/dashboard/messages", icon: MessageSquare },
          { title: t("nav.notifications") || "Notifications", url: "/dashboard/notifications", icon: Bell },
          { title: t("nav.ai") || "AI Assistant", url: "/dashboard/ai", icon: Sparkles },
        ],
      },
    ];
  }

  if (role === "student") {
    return [
      {
        label: t("nav.myPortal") || "My Portal",
        items: [
          { title: t("nav.dashboard") || "Dashboard", url: "/dashboard/student", icon: LayoutDashboard },
          { title: t("nav.myLearning") || "My Learning", url: "/dashboard/student/my-learning", icon: BookOpen },
          { title: t("nav.exams") || "MCQ Tests", url: "/dashboard/student/exams", icon: FileText },
          { title: t("nav.assignments") || "Assignments", url: "/dashboard/student/assignments", icon: FileText },
          { title: t("nav.certificates") || "Certificates", url: "/dashboard/student/certificates", icon: GraduationCap },
          { title: t("nav.browseCourses") || "Browse Courses", url: "/dashboard/student/courses", icon: GraduationCap },
          { title: t("nav.browseBatches") || "Browse Batches", url: "/dashboard/student/batches", icon: Search },
          { title: t("nav.myRequests") || "My Requests", url: "/dashboard/student/my-requests", icon: ClipboardList },
          { title: t("nav.progressTracker") || "Progress Tracker", url: "/dashboard/student/study-logs", icon: LayoutDashboard },
          { title: t("nav.messages") || "Communication", url: "/dashboard/messages", icon: MessageSquare },
          { title: t("nav.ai") || "AI Assistant", url: "/dashboard/ai", icon: Sparkles },
        ],
      },
    ];
  }

  if (role === "parent") {
    return [
      {
        label: t("nav.myPortal") || "My Portal",
        items: [{ title: t("nav.myChildren") || "My Children", url: "/dashboard/parent", icon: Users }],
      },
    ];
  }

  return [];
}

// ---------------------------------------------------------------------------
// DashboardSidebar
// ---------------------------------------------------------------------------
export function DashboardSidebar({
  collapsed,
  mobileOpen,
  onMobileOpenChange,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}) {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const { institute, user } = useAuthStore();
  const { t } = useTranslation();

  const role = (user?.role ?? "student") as UserRole;
  const instituteName = institute?.name ?? "EliteClass";
  const instituteInitials = getInitials(instituteName);
  const groups = getNavGroups(role, t);

  const navigation = (
    <>
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-primary shadow-glow overflow-hidden">
          <img src="/logo.svg" alt="Logo" className="h-6 w-6" />
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="max-w-40 truncate text-sm font-semibold" title={instituteName}>
              {instituteName}
            </span>
            <span className="text-[10px] text-muted-foreground">EliteClass Platform</span>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="border-b border-sidebar-border px-4 py-3">
          <button className="flex w-full items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2 text-left text-xs transition-colors hover:bg-accent/10">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium" title={instituteName}>
                {instituteName}
              </div>
              <div className="text-[10px] text-muted-foreground">Switch institute</div>
            </div>
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((g) => (
          <div key={g.label} className="mb-6">
            {!collapsed && (
              <div className="mb-2 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {g.label}
              </div>
            )}
            <ul className="space-y-1">
              {g.items.map((item) => {
                const active =
                  item.url === "/dashboard"
                    ? currentPath === "/dashboard"
                    : currentPath.startsWith(item.url);

                if (item.comingSoon) {
                  return (
                    <li key={item.title}>
                      <div
                        title={collapsed ? `${item.title} (coming soon)` : undefined}
                        className="flex cursor-not-allowed select-none items-center gap-3 rounded-lg px-3 py-2 text-sm opacity-40"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && (
                          <span className="flex-1 truncate">
                            {item.title}
                            <span className="ml-2 text-[9px] uppercase tracking-wider opacity-70">
                              soon
                            </span>
                          </span>
                        )}
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={item.url}>
                    <Link
                      to={item.url}
                      preload="intent"
                      title={collapsed ? item.title : undefined}
                      onClick={() => onMobileOpenChange(false)}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                        active
                          ? "bg-primary/10 font-medium text-foreground"
                          : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-primary" />
                      )}
                      <item.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                      {!collapsed && <span className="truncate">{item.title}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Link
          to="/dashboard/settings"
          title={collapsed ? t("nav.settings") || "Settings" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{t("nav.settings") || "Settings"}</span>}
        </Link>
      </div>
    </>
  );

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-screen shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 md:flex md:flex-col",
          collapsed ? "w-[72px]" : "w-[260px]",
        )}
      >
        {navigation}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="w-[var(--sidebar-width)] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
          style={
            {
              "--sidebar-width": "min(18rem, calc(100vw - 1rem))",
            } as React.CSSProperties
          }
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation menu</SheetTitle>
            <SheetDescription>Dashboard navigation drawer for mobile and tablets.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full flex-col">{navigation}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
