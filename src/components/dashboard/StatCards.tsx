import { motion } from "framer-motion";
import { TrendingUp, Users, GraduationCap, IndianRupee, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface StatCardsProps {
  /** Real student count from Supabase. `null` while loading. */
  studentCount: number | null;
  /** Real staff count from Supabase. `null` while loading. */
  staffCount: number | null;
  /** When true, renders animated skeleton placeholders instead of values. */
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Sparkline (unchanged — purely decorative)
// ---------------------------------------------------------------------------
function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const w = 80,
    h = 28;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke={positive ? "var(--color-success)" : "var(--color-destructive)"}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Skeleton value placeholder
// ---------------------------------------------------------------------------
function SkeletonValue() {
  return <div className="mt-2 h-9 w-24 animate-pulse rounded-lg bg-muted" aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// StatCards
// ---------------------------------------------------------------------------
export function StatCards({ studentCount, staffCount, isLoading = false }: StatCardsProps) {
  // Build stats dynamically — Revenue and Courses are future modules
  const stats = [
    {
      label: "Total Students",
      value: studentCount !== null ? studentCount.toLocaleString("en-IN") : null,
      positive: true,
      icon: GraduationCap,
      spark: [10, 14, 12, 18, 22, 19, 28],
      // Only show delta badge once we have historical data
      delta: null as number | null,
      suffix: "",
    },
    {
      label: "Active Staff",
      value: staffCount !== null ? staffCount.toLocaleString("en-IN") : null,
      positive: true,
      icon: Users,
      spark: [8, 10, 9, 12, 11, 13, 14],
      delta: null as number | null,
      suffix: "",
    },
    {
      label: "Revenue (MTD)",
      // Revenue module not yet built — placeholder
      value: "Coming soon",
      positive: true,
      icon: IndianRupee,
      spark: [12, 18, 15, 22, 28, 26, 34],
      delta: null as number | null,
      suffix: "",
    },
    {
      label: "Courses Live",
      // Courses module not yet built — placeholder
      value: "Coming soon",
      positive: true,
      icon: BookOpen,
      spark: [20, 18, 22, 19, 21, 18, 17],
      delta: null as number | null,
      suffix: "",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.05 }}
          className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card transition-all hover:shadow-elegant"
        >
          {/* Hover glow */}
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-primary opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-30" />

          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>

              {/* Value — skeleton while loading, real value or placeholder once loaded */}
              {isLoading && s.value === null ? (
                <SkeletonValue />
              ) : (
                <p
                  className={cn(
                    "mt-2 text-3xl font-semibold tracking-tight",
                    s.value === "Coming soon" && "text-xl text-muted-foreground",
                  )}
                >
                  {s.value ?? "—"}
                </p>
              )}
            </div>

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <s.icon className="h-5 w-5" />
            </div>
          </div>

          {/* Bottom row — trend badge + sparkline */}
          <div className="mt-4 flex items-end justify-between">
            {s.delta !== null ? (
              <div
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
                  s.positive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
                )}
              >
                <TrendingUp className="h-3 w-3" />
                {Math.abs(s.delta)}%
              </div>
            ) : (
              // No historical delta available yet
              <span className="text-[11px] text-muted-foreground/60">
                {s.value === "Coming soon" ? "Module coming soon" : "Live data"}
              </span>
            )}

            <Sparkline data={s.spark} positive={s.positive} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
