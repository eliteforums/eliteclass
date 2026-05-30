// ---------------------------------------------------------------------------
// EliteClass — Analytics & Reporting (/dashboard/analytics)
// ---------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "@/components/dashboard/analytics/AnalyticsPage";

export const Route = createFileRoute("/dashboard/analytics/")({
  head: () => ({ meta: [{ title: "Analytics — EliteClass" }] }),
  component: AnalyticsPage,
});
