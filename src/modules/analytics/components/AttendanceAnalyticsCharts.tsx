import { memo, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InstituteAttendanceAnalytics } from "@/types";

const lineConfig = {
  present: { label: "Present", color: "hsl(142 71% 45%)" },
  absent: { label: "Absent", color: "hsl(0 84% 60%)" },
  late: { label: "Late", color: "hsl(38 92% 50%)" },
} as const;

const PIE_COLORS = ["hsl(142 71% 45%)", "hsl(0 84% 60%)", "hsl(38 92% 50%)", "hsl(199 89% 48%)"];

interface AttendanceAnalyticsChartsProps {
  data: InstituteAttendanceAnalytics;
}

export const AttendanceAnalyticsCharts = memo(function AttendanceAnalyticsCharts({
  data,
}: AttendanceAnalyticsChartsProps) {
  const pieData = useMemo(() => {
    const d = data.status_distribution ?? {};
    return [
      { name: "Present", value: d.present ?? 0 },
      { name: "Absent", value: d.absent ?? 0 },
      { name: "Late", value: d.late ?? 0 },
      { name: "Leave", value: d.leave ?? 0 },
    ].filter((x) => x.value > 0);
  }, [data.status_distribution]);

  const batchChart = useMemo(
    () =>
      (data.batch_breakdown ?? []).map((b) => ({
        name: b.batch_name.length > 12 ? `${b.batch_name.slice(0, 12)}…` : b.batch_name,
        rate: b.rate,
        total: b.total,
      })),
    [data.batch_breakdown],
  );

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="border-border/60 bg-card/90 shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-base">Daily attendance trend</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <ChartContainer config={lineConfig} className="h-[300px] w-full">
            <LineChart data={data.daily_trend ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line type="monotone" dataKey="present" stroke="var(--color-present)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="absent" stroke="var(--color-absent)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="late" stroke="var(--color-late)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/90 shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-base">Status distribution</CardTitle>
        </CardHeader>
        <CardContent className="p-4 flex items-center justify-center">
          <ChartContainer config={{}} className="h-[300px] w-full max-w-sm">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {batchChart.length > 0 && (
        <Card className="border-border/60 bg-card/90 shadow-sm xl:col-span-2">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-base">Batch-wise attendance %</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ChartContainer config={{ rate: { label: "Rate %", color: "hsl(222 47% 35%)" } }} className="h-[280px] w-full">
              <BarChart data={batchChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="rate" fill="var(--color-rate)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
});
