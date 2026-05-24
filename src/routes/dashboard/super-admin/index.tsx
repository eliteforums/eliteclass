import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";

export const Route = createFileRoute("/dashboard/super-admin/")({
  head: () => ({ meta: [{ title: "Super Admin — EduOS" }] }),
  component: SuperAdminDashboard,
});

function SuperAdminDashboard() {
  const { user } = useAuthStore();
  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <ProtectedRoute allowedRoles={["super_admin"]}>
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Super Admin
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Welcome, {firstName}!</h1>
        <p className="mt-1 text-sm text-muted-foreground">Platform-wide oversight</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          All institutes, billing, and platform metrics coming soon.
        </p>
      </div>
    </ProtectedRoute>
  );
}
