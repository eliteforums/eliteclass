import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttendanceTrendPoint } from "@/types";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

interface AttendanceChartProps {
  monthlyTrend: AttendanceTrendPoint[];
  weeklyTrend: AttendanceTrendPoint[];
}

const chartConfig = {
  present: { label: "Present", color: "hsl(142 71% 45%)" },
  absent: { label: "Absent", color: "hsl(0 84% 60%)" },
  late: { label: "Late", color: "hsl(38 92% 50%)" },
  leave: { label: "Leave", color: "hsl(199 89% 48%)" },
  percentage: { label: "Attendance %", color: "hsl(222 47% 35%)" },
} as const;

export function AttendanceChart({ monthlyTrend, weeklyTrend }: AttendanceChartProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="border-border/60 bg-card/90 shadow-sm backdrop-blur">
        <CardHeader className="border-b border-border/60 bg-gradient-to-br from-background via-background to-muted/20 pb-5">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Attendance trend
          </p>
          <CardTitle className="text-xl">Monthly performance</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ChartContainer config={chartConfig} className="h-[320px] w-full">
            <LineChart data={monthlyTrend} margin={{ left: 8, right: 8, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                type="monotone"
                dataKey="present"
                stroke="var(--color-present)"
                strokeWidth={3}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="absent"
                stroke="var(--color-absent)"
                strokeWidth={3}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="late"
                stroke="var(--color-late)"
                strokeWidth={3}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="leave"
                stroke="var(--color-leave)"
                strokeWidth={3}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/90 shadow-sm backdrop-blur">
        <CardHeader className="border-b border-border/60 bg-gradient-to-br from-background via-background to-muted/20 pb-5">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Weekly snapshot
          </p>
          <CardTitle className="text-xl">Last 7 days</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ChartContainer config={chartConfig} className="h-[320px] w-full">
            <BarChart data={weeklyTrend} margin={{ left: 8, right: 8, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="present"
                stackId="attendance"
                fill="var(--color-present)"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="late"
                stackId="attendance"
                fill="var(--color-late)"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="absent"
                stackId="attendance"
                fill="var(--color-absent)"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="leave"
                stackId="attendance"
                fill="var(--color-leave)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
