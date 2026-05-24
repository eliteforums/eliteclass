import { useState, useMemo, useCallback, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuthStore } from "@/store/authStore";
import { signOut } from "@/services/auth.service";
import { getDashboardPath, ROLE_LABELS } from "@/utils/rbac";
import { getInitials } from "@/utils/helpers";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  UserCheck,
  Building2,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Bell,
} from "lucide-react";

interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
}

function getNavItems(role: string): NavItem[] {
  const base: NavItem[] = [];

  if (role === "super_admin") {
    base.push(
      {
        label: "Overview",
        to: "/dashboard/super-admin",
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
      {
        label: "Institutes",
        to: "/dashboard/super-admin/institutes",
        icon: <Building2 className="h-4 w-4" />,
      },
      { label: "Users", to: "/dashboard/super-admin/users", icon: <Users className="h-4 w-4" /> },
    );
  } else if (role === "admin") {
    base.push(
      { label: "Overview", to: "/dashboard/admin", icon: <LayoutDashboard className="h-4 w-4" /> },
      {
        label: "Students",
        to: "/dashboard/admin/students",
        icon: <GraduationCap className="h-4 w-4" />,
      },
      { label: "Staff", to: "/dashboard/admin/staff", icon: <UserCheck className="h-4 w-4" /> },
      { label: "Parents", to: "/dashboard/admin/parents", icon: <Users className="h-4 w-4" /> },
    );
  } else if (role === "staff") {
    base.push(
      { label: "Overview", to: "/dashboard/staff", icon: <LayoutDashboard className="h-4 w-4" /> },
      {
        label: "Students",
        to: "/dashboard/staff/students",
        icon: <GraduationCap className="h-4 w-4" />,
      },
    );
  } else if (role === "student") {
    base.push({
      label: "My Dashboard",
      to: "/dashboard/student",
      icon: <LayoutDashboard className="h-4 w-4" />,
    });
  } else if (role === "parent") {
    base.push({
      label: "My Children",
      to: "/dashboard/parent",
      icon: <LayoutDashboard className="h-4 w-4" />,
    });
  }

  return base;
}

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user, institute, logout } = useAuthStore();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const role = user?.role ?? "student";
  const navItems = useMemo(() => getNavItems(role), [role]);

  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    await signOut();
    logout();
    navigate({ to: "/auth/login", replace: true });
  }, [logout, navigate]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-60" : "w-16"
        } flex flex-col border-r border-border bg-card transition-all duration-200 ease-in-out shrink-0`}
      >
        {/* Brand */}
        <div className="flex h-14 items-center border-b border-border px-4 gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary">
            <span className="text-xs font-bold text-primary-foreground">E</span>
          </div>
          {sidebarOpen && (
            <span className="text-sm font-semibold text-foreground truncate">
              {institute?.name ?? "EduOS"}
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = currentPath === item.to || currentPath.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {getInitials(user?.name ?? "U")}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
                </p>
              </div>
            )}
            {sidebarOpen && (
              <button
                onClick={handleLogout}
                className="text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Topbar */}
        <header className="flex h-14 items-center border-b border-border bg-card px-4 gap-4 shrink-0">
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>Dashboard</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium capitalize">{role.replace("_", " ")}</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button className="relative text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
