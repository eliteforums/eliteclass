import { memo, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InstituteScheduleAnalytics } from "@/types";

const TYPE_COLORS = ["hsl(222 47% 35%)", "hsl(38 92% 50%)", "hsl(142 71% 45%)", "hsl(199 89% 48%)", "hsl(280 60% 50%)"];

interface ScheduleStaffAnalyticsProps {
  data: InstituteScheduleAnalytics;
}

export const ScheduleStaffAnalytics = memo(function ScheduleStaffAnalytics({
  data,
}: ScheduleStaffAnalyticsProps) {
  const typePie = useMemo(
    () =>
      Object.entries(data.by_type ?? {}).map(([name, value]) => ({
        name,
        value: Number(value),
      })),
    [data.by_type],
  );

  const workload = useMemo(
    () =>
      (data.teacher_workload ?? []).map((t) => ({
        name: t.name?.split(" ")[0] ?? "Staff",
        slots: t.slots,
      })),
    [data.teacher_workload],
  );

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="border-border/60 bg-card/90 shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-base">Schedule by type</CardTitle>
        </CardHeader>
        <CardContent className="p-4 flex justify-center">
          <ChartContainer config={{}} className="h-[280px] w-full max-w-sm">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie data={typePie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                {typePie.map((_, i) => (
                  <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/90 shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-base">Teacher workload (slots)</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {workload.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No published schedule data yet.</p>
          ) : (
            <ChartContainer
              config={{ slots: { label: "Slots", color: "hsl(222 47% 35%)" } }}
              className="h-[280px] w-full"
            >
              <BarChart data={workload} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={72} tickLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="slots" fill="var(--color-slots)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
