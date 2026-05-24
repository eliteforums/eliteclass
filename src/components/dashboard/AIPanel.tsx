import { Sparkles, TrendingUp, AlertCircle, Lightbulb } from "lucide-react";

const insights = [
  {
    icon: AlertCircle,
    color: "text-warning",
    bg: "bg-warning/10",
    title: "12 students at dropout risk",
    desc: "Attendance dropped >30% this week in Batch B-204.",
  },
  {
    icon: TrendingUp,
    color: "text-success",
    bg: "bg-success/10",
    title: "Revenue forecast +18%",
    desc: "On track to exceed monthly target by ₹6.8L.",
  },
  {
    icon: Lightbulb,
    color: "text-primary",
    bg: "bg-primary/10",
    title: "Suggested follow-ups",
    desc: "47 leads cold for 3+ days — auto-nurture sequence ready.",
  },
];

export function AIPanel() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-primary opacity-20 blur-3xl" />
      <div className="relative">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI Insights</h3>
            <p className="text-[11px] text-muted-foreground">Updated 2 min ago</p>
          </div>
        </div>
        <ul className="space-y-3">
          {insights.map((i) => (
            <li
              key={i.title}
              className="flex gap-3 rounded-xl border border-border bg-background/40 p-3 transition-colors hover:bg-background/70"
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${i.bg} ${i.color}`}
              >
                <i.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{i.title}</div>
                <div className="text-xs text-muted-foreground">{i.desc}</div>
              </div>
            </li>
          ))}
        </ul>
        <button className="mt-4 w-full rounded-lg bg-gradient-primary py-2 text-xs font-medium text-primary-foreground hover:opacity-90">
          Open AI assistant
        </button>
      </div>
    </div>
  );
}
