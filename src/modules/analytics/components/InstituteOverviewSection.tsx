import { memo } from "react";
import {
  GraduationCap,
  UserCheck,
  Users,
  BookOpen,
  CalendarCheck,
  CreditCard,
  Calendar,
  School,
} from "lucide-react";
import { AnalyticsKpiCard } from "./AnalyticsKpiCard";
import type { InstituteAnalyticsOverview } from "@/types";

interface InstituteOverviewSectionProps {
  overview: InstituteAnalyticsOverview;
}

function formatCurrency(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export const InstituteOverviewSection = memo(function InstituteOverviewSection({
  overview,
}: InstituteOverviewSectionProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <AnalyticsKpiCard
        label="Students"
        value={overview.students.active ?? overview.students.total}
        hint={`${overview.students.total} total enrolled`}
        icon={GraduationCap}
      />
      <AnalyticsKpiCard
        label="Staff"
        value={overview.staff.total}
        hint={`${overview.staff.assignments ?? 0} assignments`}
        icon={UserCheck}
      />
      <AnalyticsKpiCard label="Parents" value={overview.parents.total} icon={Users} />
      <AnalyticsKpiCard
        label="Active batches"
        value={overview.batches.active ?? overview.batches.total}
        icon={BookOpen}
      />
      <AnalyticsKpiCard
        label="Attendance rate"
        value={`${overview.attendance.rate}%`}
        hint={`${overview.attendance.present_or_late}/${overview.attendance.total_records} records`}
        icon={CalendarCheck}
        tone={overview.attendance.rate >= 85 ? "success" : overview.attendance.rate >= 70 ? "warning" : "danger"}
      />
      <AnalyticsKpiCard
        label="Fees collected"
        value={formatCurrency(overview.fees.collected_in_range)}
        hint={`Pending ${formatCurrency(overview.fees.pending)}`}
        icon={CreditCard}
      />
      <AnalyticsKpiCard
        label="Overdue fees"
        value={formatCurrency(overview.fees.overdue)}
        icon={CreditCard}
        tone={overview.fees.overdue > 0 ? "danger" : "success"}
      />
      <AnalyticsKpiCard
        label="Published schedules"
        value={overview.schedules.published}
        hint={`${overview.schedules.exam_slots} exam slots`}
        icon={Calendar}
      />
      <AnalyticsKpiCard
        label="Course enrollments"
        value={overview.courses.enrollments_active}
        icon={School}
        tone="default"
      />
    </div>
  );
});
