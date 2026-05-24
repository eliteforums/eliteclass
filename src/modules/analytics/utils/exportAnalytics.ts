import type { InstituteAnalyticsBundle } from "@/types";

export function exportAnalyticsCsv(bundle: InstituteAnalyticsBundle, instituteName: string) {
  const lines: string[] = [
    `EduOS Analytics Report — ${instituteName}`,
    `Generated,${new Date().toISOString()}`,
    "",
    "OVERVIEW",
    `Students (active),${bundle.overview.students.active ?? bundle.overview.students.total}`,
    `Staff,${bundle.overview.staff.total}`,
    `Attendance rate,${bundle.overview.attendance.rate}%`,
    `Fees collected (range),${bundle.overview.fees.collected_in_range}`,
    `Fees pending,${bundle.overview.fees.pending}`,
    "",
    "BATCH ATTENDANCE",
    "Batch,Total,Rate %",
    ...bundle.attendance.batch_breakdown.map((b) => `${b.batch_name},${b.total},${b.rate}`),
    "",
    "MONTHLY REVENUE",
    "Month,Amount",
    ...bundle.fees.monthly_revenue.map((m) => `${m.label ?? m.month},${m.amount ?? 0}`),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analytics-${instituteName.replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
