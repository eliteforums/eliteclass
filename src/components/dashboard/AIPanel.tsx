// ---------------------------------------------------------------------------
// EliteClass — AI Insights Panel (Real-time Data)
//
// Fetches actual institute metrics from Supabase and displays them as
// actionable insights on the admin dashboard.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Sparkles, TrendingUp, AlertCircle, Lightbulb, Users, BookOpen, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { Link } from "@tanstack/react-router";

interface Insight {
  icon: typeof AlertCircle;
  color: string;
  bg: string;
  title: string;
  desc: string;
}

export function AIPanel() {
  const { user } = useAuthStore();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.institute_id || !supabase) {
      setIsLoading(false);
      return;
    }

    async function fetchInsights() {
      setIsLoading(true);
      const instituteId = user!.institute_id;
      const generatedInsights: Insight[] = [];

      try {
        // 1. Total students count
        const { count: totalStudents } = await supabase!
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("institute_id", instituteId)
          .eq("status", "active");

        // 2. Students without batch assignment
        const { count: unassignedStudents } = await supabase!
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("institute_id", instituteId)
          .eq("status", "active")
          .is("batch_id", null);

        // 3. Pending batch join requests
        const { count: pendingRequests } = await supabase!
          .from("batch_join_requests")
          .select("id", { count: "exact", head: true })
          .eq("institute_id", instituteId)
          .eq("status", "pending");

        // 4. Recent exam attempts (last 7 days)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const { count: recentAttempts } = await supabase!
          .from("exam_attempts")
          .select("id", { count: "exact", head: true })
          .eq("institute_id", instituteId)
          .gte("started_at", weekAgo.toISOString());

        // 5. Published courses
        const { count: publishedCourses } = await supabase!
          .from("lms_courses")
          .select("id", { count: "exact", head: true })
          .eq("institute_id", instituteId)
          .eq("status", "published");

        // 6. Active enrollments
        const { count: activeEnrollments } = await supabase!
          .from("lms_enrollments")
          .select("id", { count: "exact", head: true })
          .eq("institute_id", instituteId)
          .eq("status", "active");

        // Generate insights based on real data
        if ((unassignedStudents ?? 0) > 0) {
          generatedInsights.push({
            icon: AlertCircle,
            color: "text-warning",
            bg: "bg-warning/10",
            title: `${unassignedStudents} students without a batch`,
            desc: "These students haven't been assigned to any batch yet. Consider assigning them.",
          });
        }

        if ((pendingRequests ?? 0) > 0) {
          generatedInsights.push({
            icon: Users,
            color: "text-primary",
            bg: "bg-primary/10",
            title: `${pendingRequests} pending batch request${(pendingRequests ?? 0) > 1 ? "s" : ""}`,
            desc: "Students are waiting for batch join approval. Review them in Batch Requests.",
          });
        }

        if ((totalStudents ?? 0) > 0 && (activeEnrollments ?? 0) === 0) {
          generatedInsights.push({
            icon: BookOpen,
            color: "text-warning",
            bg: "bg-warning/10",
            title: "No active course enrollments",
            desc: "Students are registered but none are enrolled in courses yet.",
          });
        }

        if ((recentAttempts ?? 0) > 0) {
          generatedInsights.push({
            icon: TrendingUp,
            color: "text-success",
            bg: "bg-success/10",
            title: `${recentAttempts} exam attempt${(recentAttempts ?? 0) > 1 ? "s" : ""} this week`,
            desc: "Students are actively taking exams. Check results in the MCQ Tests section.",
          });
        }

        if ((publishedCourses ?? 0) > 0) {
          generatedInsights.push({
            icon: BookOpen,
            color: "text-success",
            bg: "bg-success/10",
            title: `${publishedCourses} course${(publishedCourses ?? 0) > 1 ? "s" : ""} published`,
            desc: `${activeEnrollments ?? 0} active enrollment${(activeEnrollments ?? 0) !== 1 ? "s" : ""} across all courses.`,
          });
        }

        if ((totalStudents ?? 0) > 0 && (unassignedStudents ?? 0) === 0 && (pendingRequests ?? 0) === 0) {
          generatedInsights.push({
            icon: Lightbulb,
            color: "text-primary",
            bg: "bg-primary/10",
            title: "All students assigned to batches",
            desc: `${totalStudents} active students are all properly assigned. Great job!`,
          });
        }

        // Fallback if no insights generated
        if (generatedInsights.length === 0) {
          generatedInsights.push({
            icon: Sparkles,
            color: "text-primary",
            bg: "bg-primary/10",
            title: `${totalStudents ?? 0} active students`,
            desc: "Your institute is set up. Start adding courses and exams to see more insights.",
          });
        }

        setInsights(generatedInsights.slice(0, 4)); // Show max 4 insights
      } catch (err) {
        // Fallback on error
        setInsights([
          {
            icon: AlertCircle,
            color: "text-muted-foreground",
            bg: "bg-muted",
            title: "Unable to load insights",
            desc: "Check your connection and try refreshing the page.",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchInsights();
  }, [user?.institute_id]);

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
            <p className="text-[11px] text-muted-foreground">
              {isLoading ? "Loading..." : "Live data"}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="space-y-3">
            {insights.map((i, idx) => (
              <li
                key={idx}
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
        )}

        <Link
          to="/dashboard/ai"
          className="mt-4 block w-full rounded-lg bg-gradient-primary py-2 text-center text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          Open AI assistant
        </Link>
      </div>
    </div>
  );
}
