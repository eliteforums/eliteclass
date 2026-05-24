import { memo, useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InstituteFeeAnalytics } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  paid: "hsl(142 71% 45%)",
  pending: "hsl(38 92% 50%)",
  partial: "hsl(199 89% 48%)",
  overdue: "hsl(0 84% 60%)",
  waived: "hsl(220 10% 50%)",
};

interface FeeAnalyticsChartsProps {
  data: InstituteFeeAnalytics;
}

export const FeeAnalyticsCharts = memo(function FeeAnalyticsCharts({ data }: FeeAnalyticsChartsProps) {
  const pieData = useMemo(
    () =>
      Object.entries(data.status_distribution ?? {}).map(([name, value]) => ({
        name,
        value: Number(value),
      })),
    [data.status_distribution],
  );

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="border-border/60 bg-card/90 shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-base">Monthly revenue</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <ChartContainer
            config={{ amount: { label: "Collected", color: "hsl(222 47% 35%)" } }}
            className="h-[300px] w-full"
          >
            <AreaChart data={data.monthly_revenue ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="amount" stroke="var(--color-amount)" fill="var(--color-amount)" fillOpacity={0.2} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/90 shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-base">Fee status</CardTitle>
        </CardHeader>
        <CardContent className="p-4 flex items-center justify-center">
          <ChartContainer config={{}} className="h-[300px] w-full max-w-sm">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95}>
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "hsl(220 10% 60%)"} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/90 shadow-sm xl:col-span-2">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="text-base">Revenue summary (range)</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <ChartContainer
            config={{
              collected: { label: "Collected", color: "hsl(142 71% 45%)" },
              pending: { label: "Pending", color: "hsl(38 92% 50%)" },
              overdue: { label: "Overdue", color: "hsl(0 84% 60%)" },
            }}
            className="h-[220px] w-full max-w-lg mx-auto"
          >
            <BarChart
              data={[
                { label: "Collected", value: data.totals?.collected ?? 0, fill: "hsl(142 71% 45%)" },
                { label: "Pending", value: data.totals?.pending ?? 0, fill: "hsl(38 92% 50%)" },
                { label: "Overdue", value: data.totals?.overdue ?? 0, fill: "hsl(0 84% 60%)" },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {[
                  { fill: "hsl(142 71% 45%)" },
                  { fill: "hsl(38 92% 50%)" },
                  { fill: "hsl(0 84% 60%)" },
                ].map((c, i) => (
                  <Cell key={i} fill={c.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
});
