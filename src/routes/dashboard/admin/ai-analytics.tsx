// ---------------------------------------------------------------------------
// EliteClass — /dashboard/admin/ai-analytics
// AI-powered analytics dashboard with student risk assessment, revenue
// forecasting, batch performance comparison, and AI-generated insights.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { generateExamAnalytics } from "@/services/ai.service";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Brain,
  AlertTriangle,
  TrendingUp,
  Users,
  Loader2,
  Sparkles,
  RefreshCw,
} from "lucide-react";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/admin/ai-analytics")({
  head: () => ({ meta: [{ title: "AI Analytics — EliteClass" }] }),
  component: AIAnalyticsPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudentRisk {
  id: string;
  name: string;
  attendanceRate: number;
  avgScore: number;
  riskCategory: "On Track" | "Needs Attention" | "At Risk";
  riskScore: number;
}

interface RevenueData {
  month: string;
  actual: number | null;
  projected: number | null;
}

interface BatchPerformance {
  name: string;
  avgAttendance: number;
  avgScore: number;
}

// ── Page ──────────────────────────────────────────────────────────────────────

function AIAnalyticsPage() {
  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <AIAnalyticsContent />
    </ProtectedRoute>
  );
}

function AIAnalyticsContent() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentRisk[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [batchData, setBatchData] = useState<BatchPerformance[]>([]);
  const [aiInsights, setAiInsights] = useState<string>("");
  const [insightsLoading, setInsightsLoading] = useState(false);

  useEffect(() => {
    if (user?.institute_id) {
      loadAnalytics();
    }
  }, [user?.institute_id]);

  async function loadAnalytics() {
    if (!supabase || !user?.institute_id) return;
    setLoading(true);

    try {
      await Promise.all([
        loadStudentRisks(),
        loadRevenueData(),
        loadBatchPerformance(),
      ]);
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadStudentRisks() {
    if (!supabase || !user?.institute_id) return;

    // Fetch students with their attendance and exam data
    const { data: studentsData } = await supabase
      .from("students")
      .select("id, user_id, users:user_id(name)")
      .eq("institute_id", user.institute_id)
      .limit(100);

    if (!studentsData?.length) {
      setStudents([]);
      return;
    }

    const studentIds = studentsData.map((s) => s.id);

    // Fetch attendance records
    const { data: attendanceData } = await supabase
      .from("attendance")
      .select("student_id, status")
      .in("student_id", studentIds);

    // Fetch exam results
    const { data: examResults } = await supabase
      .from("exam_results")
      .select("student_id, score, total_marks")
      .in("student_id", studentIds);

    // Calculate risk for each student
    const riskStudents: StudentRisk[] = studentsData.map((student) => {
      const studentAttendance = (attendanceData ?? []).filter(
        (a) => a.student_id === student.id
      );
      const totalClasses = studentAttendance.length;
      const presentClasses = studentAttendance.filter(
        (a) => a.status === "present"
      ).length;
      const attendanceRate = totalClasses > 0 ? Math.round((presentClasses / totalClasses) * 100) : 100;

      const studentExams = (examResults ?? []).filter(
        (e) => e.student_id === student.id
      );
      const avgScore =
        studentExams.length > 0
          ? Math.round(
              studentExams.reduce(
                (sum, e) => sum + (e.total_marks > 0 ? (e.score / e.total_marks) * 100 : 0),
                0
              ) / studentExams.length
            )
          : 50; // Default if no exams taken

      // Calculate risk score (0-100, higher = more at risk)
      const attendanceRisk = Math.max(0, 100 - attendanceRate);
      const scoreRisk = Math.max(0, 100 - avgScore);
      const riskScore = Math.round(attendanceRisk * 0.5 + scoreRisk * 0.5);

      let riskCategory: StudentRisk["riskCategory"] = "On Track";
      if (attendanceRate < 60 && avgScore < 40) {
        riskCategory = "At Risk";
      } else if (attendanceRate < 75 || avgScore < 60) {
        riskCategory = "Needs Attention";
      }

      const userName = (student as any).users?.name ?? "Unknown";

      return {
        id: student.id,
        name: userName,
        attendanceRate,
        avgScore,
        riskCategory,
        riskScore,
      };
    });

    // Sort by risk score descending
    riskStudents.sort((a, b) => b.riskScore - a.riskScore);
    setStudents(riskStudents);
  }

  async function loadRevenueData() {
    if (!supabase || !user?.institute_id) return;

    // Fetch fee transactions from the past 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: transactions } = await supabase
      .from("fee_transactions")
      .select("amount, created_at")
      .eq("institute_id", user.institute_id)
      .gte("created_at", sixMonthsAgo.toISOString())
      .order("created_at", { ascending: true });

    // Group by month
    const monthlyRevenue: Record<string, number> = {};
    const months: string[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      months.push(label);
      monthlyRevenue[key] = 0;
    }

    (transactions ?? []).forEach((t) => {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthlyRevenue[key] !== undefined) {
        monthlyRevenue[key] += Number(t.amount) || 0;
      }
    });

    const values = Object.values(monthlyRevenue);
    const avgGrowth =
      values.length > 1
        ? values.slice(1).reduce((sum, v, i) => sum + (v - values[i]), 0) / (values.length - 1)
        : 0;

    const lastValue = values[values.length - 1] ?? 0;

    // Build chart data with actual + projected
    const chartData: RevenueData[] = months.map((month, i) => ({
      month,
      actual: values[i] ?? 0,
      projected: null,
    }));

    // Add 3 months projection
    for (let i = 1; i <= 3; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      chartData.push({
        month: label,
        actual: null,
        projected: Math.max(0, Math.round(lastValue + avgGrowth * i)),
      });
    }

    setRevenueData(chartData);
  }

  async function loadBatchPerformance() {
    if (!supabase || !user?.institute_id) return;

    const { data: batches } = await supabase
      .from("batches")
      .select("id, name")
      .eq("institute_id", user.institute_id)
      .eq("status", "active");

    if (!batches?.length) {
      setBatchData([]);
      return;
    }

    const batchIds = batches.map((b) => b.id);

    // Fetch student-batch assignments
    const { data: assignments } = await supabase
      .from("student_batches")
      .select("student_id, batch_id")
      .in("batch_id", batchIds);

    if (!assignments?.length) {
      setBatchData(batches.map((b) => ({ name: b.name, avgAttendance: 0, avgScore: 0 })));
      return;
    }

    const studentIds = [...new Set(assignments.map((a) => a.student_id))];

    const { data: attendanceData } = await supabase
      .from("attendance")
      .select("student_id, status")
      .in("student_id", studentIds);

    const { data: examResults } = await supabase
      .from("exam_results")
      .select("student_id, score, total_marks")
      .in("student_id", studentIds);

    const batchPerf: BatchPerformance[] = batches.map((batch) => {
      const batchStudentIds = assignments
        .filter((a) => a.batch_id === batch.id)
        .map((a) => a.student_id);

      const batchAttendance = (attendanceData ?? []).filter((a) =>
        batchStudentIds.includes(a.student_id)
      );
      const totalRecords = batchAttendance.length;
      const presentRecords = batchAttendance.filter((a) => a.status === "present").length;
      const avgAttendance = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0;

      const batchExams = (examResults ?? []).filter((e) =>
        batchStudentIds.includes(e.student_id)
      );
      const avgScore =
        batchExams.length > 0
          ? Math.round(
              batchExams.reduce(
                (sum, e) => sum + (e.total_marks > 0 ? (e.score / e.total_marks) * 100 : 0),
                0
              ) / batchExams.length
            )
          : 0;

      return { name: batch.name, avgAttendance, avgScore };
    });

    setBatchData(batchPerf);
  }

  async function generateInsights() {
    setInsightsLoading(true);
    try {
      const atRiskCount = students.filter((s) => s.riskCategory === "At Risk").length;
      const avgAttendance =
        students.length > 0
          ? Math.round(students.reduce((sum, s) => sum + s.attendanceRate, 0) / students.length)
          : 0;
      const avgScore =
        students.length > 0
          ? Math.round(students.reduce((sum, s) => sum + s.avgScore, 0) / students.length)
          : 0;

      const insights = await generateExamAnalytics({
        examTitle: "Institute-wide Performance Analysis",
        totalStudents: students.length,
        averageScore: avgScore,
        passRate: students.filter((s) => s.avgScore >= 40).length / Math.max(students.length, 1) * 100,
        topScore: students.length > 0 ? Math.max(...students.map((s) => s.avgScore)) : 0,
        lowestScore: students.length > 0 ? Math.min(...students.map((s) => s.avgScore)) : 0,
      });

      setAiInsights(insights);
    } catch (err) {
      setAiInsights("Unable to generate insights. Please check your AI API key configuration.");
    } finally {
      setInsightsLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const atRiskStudents = students.filter((s) => s.riskCategory === "At Risk");
  const needsAttention = students.filter((s) => s.riskCategory === "Needs Attention");

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Analytics"
        subtitle="AI-powered insights into student performance, revenue trends, and batch comparisons."
        actions={
          <Button variant="outline" onClick={loadAnalytics}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{atRiskStudents.length}</p>
                <p className="text-xs text-muted-foreground">At Risk Students</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10">
                <Users className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{needsAttention.length}</p>
                <p className="text-xs text-muted-foreground">Needs Attention</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {students.length > 0
                    ? Math.round(students.reduce((s, st) => s + st.attendanceRate, 0) / students.length)
                    : 0}%
                </p>
                <p className="text-xs text-muted-foreground">Avg Attendance</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <Brain className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {students.length > 0
                    ? Math.round(students.reduce((s, st) => s + st.avgScore, 0) / students.length)
                    : 0}%
                </p>
                <p className="text-xs text-muted-foreground">Avg Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Student Risk Assessment Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Student Risk Assessment
          </CardTitle>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No student data available. Enroll students and record attendance/exams to see risk assessments.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Student</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">Attendance %</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">Avg Score</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">Risk Score</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {students.slice(0, 20).map((student) => (
                    <tr key={student.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-3 px-2 font-medium">{student.name}</td>
                      <td className="py-3 px-2 text-center">{student.attendanceRate}%</td>
                      <td className="py-3 px-2 text-center">{student.avgScore}%</td>
                      <td className="py-3 px-2 text-center">{student.riskScore}</td>
                      <td className="py-3 px-2 text-center">
                        <Badge
                          variant={
                            student.riskCategory === "At Risk"
                              ? "destructive"
                              : student.riskCategory === "Needs Attention"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {student.riskCategory}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revenue Forecast Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            Revenue Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          {revenueData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Insufficient fee transaction data for forecasting. At least 3 months of data required.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Actual Revenue"
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="projected"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 4 }}
                  name="Projected Revenue"
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Batch Performance Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Batch Performance Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          {batchData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No batch data available. Create batches and assign students to see comparisons.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={batchData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Bar dataKey="avgAttendance" fill="hsl(var(--primary))" name="Avg Attendance %" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avgScore" fill="hsl(210 80% 60%)" name="Avg Score %" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* AI Insights Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI-Generated Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!aiInsights && !insightsLoading && (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-4">
                Generate AI-powered insights based on your institute's performance data.
              </p>
              <Button onClick={generateInsights} disabled={students.length === 0}>
                <Brain className="mr-2 h-4 w-4" />
                Generate Insights
              </Button>
            </div>
          )}
          {insightsLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
              <span className="text-sm text-muted-foreground">Analyzing data with AI...</span>
            </div>
          )}
          {aiInsights && !insightsLoading && (
            <div className="space-y-3">
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap rounded-lg bg-muted/30 p-4 text-sm">
                {aiInsights}
              </div>
              <Button variant="outline" size="sm" onClick={generateInsights}>
                <RefreshCw className="mr-2 h-3 w-3" />
                Regenerate
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
