import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { CommunicationPage } from "@/components/dashboard/communication/CommunicationPage";

export const Route = createFileRoute("/dashboard/messages")({
  head: () => ({
    meta: [{ title: "Messages — EliteClass" }],
  }),
  component: MessagesRoute,
});

function MessagesRoute() {
  return (
    <ProtectedRoute allowedRoles={["admin", "staff", "student"]}>
      <CommunicationPage />
    </ProtectedRoute>
  );
}
