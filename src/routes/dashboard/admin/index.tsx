import { createFileRoute, Link } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { Building2, GraduationCap, UserCheck, Users, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/dashboard/admin/")({
  head: () => ({ meta: [{ title: "Admin Dashboard — EduOS" }] }),
  component: AdminDashboard,
});

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const { user, institute } = useAuthStore();

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Admin Panel
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Welcome, {user?.name?.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{institute?.name}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/dashboard/admin/students" className="group">
          <StatCard
            label="Total Students"
            value="—"
            icon={<GraduationCap className="h-5 w-5 text-blue-600" />}
            color="bg-blue-50 dark:bg-blue-950"
          />
        </Link>
        <Link to="/dashboard/admin/staff" className="group">
          <StatCard
            label="Staff Members"
            value="—"
            icon={<UserCheck className="h-5 w-5 text-green-600" />}
            color="bg-green-50 dark:bg-green-950"
          />
        </Link>
        <Link to="/dashboard/admin/parents" className="group">
          <StatCard
            label="Parents"
            value="—"
            icon={<Users className="h-5 w-5 text-purple-600" />}
            color="bg-purple-50 dark:bg-purple-950"
          />
        </Link>
        <StatCard
          label="Institute"
          value={institute?.subscription_plan?.toUpperCase() ?? "—"}
          icon={<Building2 className="h-5 w-5 text-orange-600" />}
          color="bg-orange-50 dark:bg-orange-950"
        />
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/dashboard/admin/staff"
            className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <UserCheck className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Manage Staff</p>
                <p className="text-xs text-muted-foreground">Admit, assign roles & courses</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          
          <Link
            to="/dashboard/admin/attendance"
            className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Daily Attendance</p>
                <p className="text-xs text-muted-foreground">Mark student attendance</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      </div>
    </ProtectedRoute>
  );
}
