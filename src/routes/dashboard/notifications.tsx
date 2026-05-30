import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NotificationCompose } from "@/components/dashboard/notifications/NotificationCompose";

export const Route = createFileRoute("/dashboard/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — EliteClass" }],
  }),
  component: NotificationsRoute,
});

function NotificationsRoute() {
  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      <div className="space-y-6 p-6">
        <NotificationCompose />
      </div>
    </ProtectedRoute>
  );
}
