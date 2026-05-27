import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AIAssistantPage } from "@/components/dashboard/ai/AIAssistantPage";

export const Route = createFileRoute("/dashboard/ai")({
  head: () => ({
    meta: [{ title: "AI Assistant — EliteClass" }],
  }),
  component: AIAssistantRoute,
});

function AIAssistantRoute() {
  return (
    <ProtectedRoute allowedRoles={["admin", "staff", "student"]}>
      <AIAssistantPage />
    </ProtectedRoute>
  );
}
