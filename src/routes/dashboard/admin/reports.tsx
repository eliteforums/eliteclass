// ---------------------------------------------------------------------------
// EliteClass — /dashboard/admin/reports
// Enhanced reporting dashboard with pre-built templates, date range filters,
// charts (Recharts), and export capabilities (PDF via jsPDF, CSV for Excel).
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { getSessionLogs, getActivityLogs, getLiveLocations, type UserSession, type ActivityLog, type UserLocation } from "@/services/activity.service";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  FileText,
  Download,
  Calendar,
  Loader2,
  BarChart3,
  Users,
  CreditCard,
  GraduationCap,
  ClipboardList,
  Activity,
  MapPin,
  LogIn,
  Clock,
} from "lucide-react";
import { jsPDF } from "jspdf";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/admin/reports")({
  head: () => ({ meta: [{ title: "Reports — EliteClass" }] }),
  component: ReportsPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportType = "attendance" | "fees" | "exams" | "enrollment";

interface ReportTemplate {
  id: ReportType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface ReportRow {
  [key: string]: string | number;
}

interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: string | number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "attendance",
    title: "Attendance Summary",
    description: "Student attendance rates by batch and date range. Shows present, absent, and late counts.",
    icon: Calendar,
  },
  {
    id: "fees",
    title: "Fee Collection",
    description: "Fee payment status, collection amounts, and pending dues across batches.",
    icon: CreditCard,
  },
  {
    id: "exams",
    title: "Exam Results",
    description: "Exam performance analysis with pass rates, averages, and score distributions.",
    icon: ClipboardList,
  },
  {
    id: "enrollment",
    title: "Enrollment Statistics",
    description: "Student enrollment trends, batch capacity, and course popularity.",
    icon: GraduationCap,
  },
];

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

// ── Page ──────────────────────────────────────────────────────────────────────

function ReportsPage() {
  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      <PageHeader title="Reports & Activity Logs" subtitle="Generate reports, view login history, and track user activity." />
      <Tabs defaultValue="reports" className="mt-6">
        <TabsList>
          <TabsTrigger value="reports" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Reports</TabsTrigger>
          <TabsTrigger value="logins" className="gap-1.5"><LogIn className="h-3.5 w-3.5" />Login Logs</TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Activity Trail</TabsTrigger>
          <TabsTrigger value="locations" className="gap-1.5"><MapPin className="h-3.5 w-3.5" />Live Locations</TabsTrigger>
        </TabsList>
        <TabsContent value="reports"><ReportsContent /></TabsContent>
        <TabsContent value="logins"><LoginsTab /></TabsContent>
        <TabsContent value="activity"><ActivityTrailTab /></TabsContent>
        <TabsContent value="locations"><LocationsTab /></TabsContent>
      </Tabs>
    </ProtectedRoute>
  );
}

function LoginsTab() {
  const { user } = useAuthStore();
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user?.institute_id) return;
    setLoading(true);
    getSessionLogs(user.institute_id, { limit: 50 }).then((res) => {
      if (res.success && res.data) setSessions(res.data);
      setLoading(false);
    });
  }, [user?.institute_id]);
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (sessions.length === 0) return <Card className="mt-4"><CardContent className="py-8 text-center text-muted-foreground">No login sessions recorded yet. Run supabase/add_activity_tracking.sql first.</CardContent></Card>;
  return (
    <div className="space-y-2 mt-4">
      {sessions.map((s) => (
        <div key={s.id} className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${s.event_type === "login" ? "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400" : "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"}`}>
            <LogIn className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{s.user_id.slice(0, 8)}...</p>
            <p className="text-xs text-muted-foreground">{s.event_type} • {s.browser || "Unknown"} on {s.os || "Unknown"} ({s.device_type || "unknown"})</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">{s.city ? `${s.city}, ${s.country}` : s.ip_address || "Unknown"}</p>
            <p className="text-[10px] text-muted-foreground">{new Date(s.created_at).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityTrailTab() {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user?.institute_id) return;
    setLoading(true);
    getActivityLogs(user.institute_id, { limit: 50 }).then((res) => {
      if (res.success && res.data) setLogs(res.data);
      setLoading(false);
    });
  }, [user?.institute_id]);
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (logs.length === 0) return <Card className="mt-4"><CardContent className="py-8 text-center text-muted-foreground">No activity logged yet.</CardContent></Card>;
  return (
    <div className="space-y-2 mt-4">
      {logs.map((log) => (
        <div key={log.id} className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium">{log.action}</p>
            <p className="text-xs text-muted-foreground truncate">{log.description || log.category}{log.target_name ? ` → ${log.target_name}` : ""}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">{log.page_url}</p>
            <p className="text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function LocationsTab() {
  const { user } = useAuthStore();
  const [locations, setLocations] = useState<UserLocation[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user?.institute_id) return;
    setLoading(true);
    getLiveLocations(user.institute_id).then((res) => {
      if (res.success && res.data) setLocations(res.data);
      setLoading(false);
    });
  }, [user?.institute_id]);
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (locations.length === 0) return <Card className="mt-4"><CardContent className="py-8 text-center text-muted-foreground">No users currently online with location sharing.</CardContent></Card>;
  return (
    <div className="space-y-3 mt-4">
      <p className="text-sm text-muted-foreground">{locations.length} user(s) online</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((loc) => (
          <Card key={loc.id}>
            <CardContent className="py-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-medium">{loc.user_id.slice(0, 8)}...</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{loc.city || `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Last seen: {new Date(loc.last_seen_at).toLocaleTimeString()}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ReportsContent() {
  const { user, institute } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ReportType>("attendance");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [generated, setGenerated] = useState(false);

  // Load batches on mount
  useState(() => {
    if (supabase && user?.institute_id) {
      supabase
        .from("batches")
        .select("id, name")
        .eq("institute_id", user.institute_id)
        .then(({ data }) => {
          if (data) setBatches(data);
        });
    }
  });

  async function generateReport() {
    if (!supabase || !user?.institute_id) return;
    setLoading(true);
    setGenerated(false);

    try {
      switch (activeTab) {
        case "attendance":
          await generateAttendanceReport();
          break;
        case "fees":
          await generateFeesReport();
          break;
        case "exams":
          await generateExamsReport();
          break;
        case "enrollment":
          await generateEnrollmentReport();
          break;
      }
      setGenerated(true);
    } catch (err) {
      console.error("Report generation failed:", err);
    } finally {
      setLoading(false);
    }
  }

  async function generateAttendanceReport() {
    if (!supabase || !user?.institute_id) return;

    let query = supabase
      .from("attendance")
      .select("student_id, status, date, students!inner(id, user_id, users:user_id(name), batch_id)")
      .gte("date", startDate)
      .lte("date", endDate);

    if (batchFilter !== "all") {
      query = query.eq("students.batch_id", batchFilter);
    }

    const { data } = await query.limit(5000);

    if (!data?.length) {
      setReportData([]);
      setChartData([]);
      return;
    }

    // Group by student
    const studentMap: Record<string, { name: string; present: number; absent: number; late: number; total: number }> = {};

    data.forEach((record: any) => {
      const studentName = record.students?.users?.name ?? "Unknown";
      const sid = record.student_id;
      if (!studentMap[sid]) {
        studentMap[sid] = { name: studentName, present: 0, absent: 0, late: 0, total: 0 };
      }
      studentMap[sid].total++;
      if (record.status === "present") studentMap[sid].present++;
      else if (record.status === "absent") studentMap[sid].absent++;
      else if (record.status === "late") studentMap[sid].late++;
    });

    const rows: ReportRow[] = Object.values(studentMap).map((s) => ({
      Student: s.name,
      Present: s.present,
      Absent: s.absent,
      Late: s.late,
      Total: s.total,
      "Attendance %": s.total > 0 ? Math.round((s.present / s.total) * 100) : 0,
    }));

    setReportData(rows);

    // Chart: overall status distribution
    const totalPresent = Object.values(studentMap).reduce((s, v) => s + v.present, 0);
    const totalAbsent = Object.values(studentMap).reduce((s, v) => s + v.absent, 0);
    const totalLate = Object.values(studentMap).reduce((s, v) => s + v.late, 0);

    setChartData([
      { name: "Present", value: totalPresent },
      { name: "Absent", value: totalAbsent },
      { name: "Late", value: totalLate },
    ]);
  }

  async function generateFeesReport() {
    if (!supabase || !user?.institute_id) return;

    const { data } = await supabase
      .from("fee_transactions")
      .select("amount, status, created_at, student_id")
      .eq("institute_id", user.institute_id)
      .gte("created_at", startDate)
      .lte("created_at", endDate + "T23:59:59")
      .order("created_at", { ascending: true })
      .limit(5000);

    if (!data?.length) {
      setReportData([]);
      setChartData([]);
      return;
    }

    // Group by month
    const monthlyData: Record<string, { collected: number; pending: number; count: number }> = {};

    data.forEach((t: any) => {
      const d = new Date(t.created_at);
      const key = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      if (!monthlyData[key]) monthlyData[key] = { collected: 0, pending: 0, count: 0 };
      monthlyData[key].count++;
      const amount = Number(t.amount) || 0;
      if (t.status === "paid" || t.status === "completed") {
        monthlyData[key].collected += amount;
      } else {
        monthlyData[key].pending += amount;
      }
    });

    const rows: ReportRow[] = Object.entries(monthlyData).map(([month, d]) => ({
      Month: month,
      "Collected (₹)": d.collected,
      "Pending (₹)": d.pending,
      Transactions: d.count,
    }));

    setReportData(rows);
    setChartData(
      Object.entries(monthlyData).map(([month, d]) => ({
        name: month,
        value: d.collected,
        Collected: d.collected,
        Pending: d.pending,
      }))
    );
  }

  async function generateExamsReport() {
    if (!supabase || !user?.institute_id) return;

    const { data: exams } = await supabase
      .from("exams")
      .select("id, title, created_at")
      .eq("institute_id", user.institute_id)
      .gte("created_at", startDate)
      .lte("created_at", endDate + "T23:59:59")
      .limit(50);

    if (!exams?.length) {
      setReportData([]);
      setChartData([]);
      return;
    }

    const examIds = exams.map((e) => e.id);

    const { data: results } = await supabase
      .from("exam_results")
      .select("exam_id, score, total_marks")
      .in("exam_id", examIds);

    const examStats: Record<string, { title: string; scores: number[]; totalMarks: number }> = {};
    exams.forEach((e) => {
      examStats[e.id] = { title: e.title, scores: [], totalMarks: 0 };
    });

    (results ?? []).forEach((r: any) => {
      if (examStats[r.exam_id]) {
        examStats[r.exam_id].scores.push(r.score);
        examStats[r.exam_id].totalMarks = r.total_marks;
      }
    });

    const rows: ReportRow[] = Object.values(examStats).map((e) => {
      const count = e.scores.length;
      const avg = count > 0 ? Math.round(e.scores.reduce((s, v) => s + v, 0) / count) : 0;
      const maxScore = count > 0 ? Math.max(...e.scores) : 0;
      const minScore = count > 0 ? Math.min(...e.scores) : 0;
      const passCount = e.scores.filter((s) => e.totalMarks > 0 ? (s / e.totalMarks) * 100 >= 40 : s >= 40).length;

      return {
        Exam: e.title,
        Students: count,
        "Avg Score": avg,
        "Top Score": maxScore,
        "Lowest Score": minScore,
        "Pass Rate %": count > 0 ? Math.round((passCount / count) * 100) : 0,
      };
    });

    setReportData(rows);
    setChartData(
      rows.map((r) => ({
        name: String(r.Exam).slice(0, 20),
        value: Number(r["Avg Score"]),
        "Avg Score": Number(r["Avg Score"]),
        "Pass Rate": Number(r["Pass Rate %"]),
      }))
    );
  }

  async function generateEnrollmentReport() {
    if (!supabase || !user?.institute_id) return;

    const { data: batchesData } = await supabase
      .from("batches")
      .select("id, name, max_students")
      .eq("institute_id", user.institute_id);

    if (!batchesData?.length) {
      setReportData([]);
      setChartData([]);
      return;
    }

    const batchIds = batchesData.map((b) => b.id);

    const { data: enrollments } = await supabase
      .from("student_batches")
      .select("batch_id, created_at")
      .in("batch_id", batchIds);

    const batchEnrollment: Record<string, number> = {};
    batchIds.forEach((id) => (batchEnrollment[id] = 0));

    (enrollments ?? []).forEach((e: any) => {
      if (batchEnrollment[e.batch_id] !== undefined) {
        batchEnrollment[e.batch_id]++;
      }
    });

    const rows: ReportRow[] = batchesData.map((b) => ({
      Batch: b.name,
      Enrolled: batchEnrollment[b.id] ?? 0,
      Capacity: b.max_students ?? "Unlimited",
      "Fill Rate %": b.max_students
        ? Math.round(((batchEnrollment[b.id] ?? 0) / b.max_students) * 100)
        : 0,
    }));

    setReportData(rows);
    setChartData(
      batchesData.map((b) => ({
        name: b.name,
        value: batchEnrollment[b.id] ?? 0,
        Enrolled: batchEnrollment[b.id] ?? 0,
        Capacity: b.max_students ?? 0,
      }))
    );
  }

  function exportPDF() {
    const doc = new jsPDF();
    const template = REPORT_TEMPLATES.find((t) => t.id === activeTab);

    // Header
    doc.setFontSize(16);
    doc.text(template?.title ?? "Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Institute: ${institute?.name ?? "EliteClass"}`, 14, 28);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 34);
    doc.text(`Date Range: ${startDate} to ${endDate}`, 14, 40);

    if (reportData.length === 0) {
      doc.text("No data available for the selected filters.", 14, 55);
      doc.save(`${activeTab}-report.pdf`);
      return;
    }

    // Table headers
    const columns = Object.keys(reportData[0]);
    const colWidth = (doc.internal.pageSize.getWidth() - 28) / columns.length;
    let y = 55;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    columns.forEach((col, i) => {
      doc.text(col, 14 + i * colWidth, y);
    });

    doc.setFont("helvetica", "normal");
    y += 8;

    // Table rows
    reportData.forEach((row) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      columns.forEach((col, i) => {
        doc.text(String(row[col] ?? ""), 14 + i * colWidth, y);
      });
      y += 6;
    });

    doc.save(`${activeTab}-report.pdf`);
  }

  function exportCSV() {
    if (reportData.length === 0) return;

    const columns = Object.keys(reportData[0]);
    const csvRows = [columns.join(",")];

    reportData.forEach((row) => {
      csvRows.push(columns.map((col) => `"${String(row[col] ?? "")}"`).join(","));
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTab}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeTemplate = REPORT_TEMPLATES.find((t) => t.id === activeTab);

  return (
    <div className="space-y-6 mt-4">

      {/* Report Type Tabs */}
      <div className="flex flex-wrap gap-2">
        {REPORT_TEMPLATES.map((template) => (
          <button
            key={template.id}
            onClick={() => {
              setActiveTab(template.id);
              setGenerated(false);
              setReportData([]);
              setChartData([]);
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === template.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <template.icon className="h-4 w-4" />
            {template.title}
          </button>
        ))}
      </div>

      {/* Template Description */}
      {activeTemplate && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <activeTemplate.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{activeTemplate.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{activeTemplate.description}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Batch</label>
              <select
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">All Batches</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={generateReport} disabled={loading} className="w-full">
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <BarChart3 className="mr-2 h-4 w-4" />
                )}
                {loading ? "Generating..." : "Generate Report"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {generated && (
        <>
          {/* Export Buttons */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportPDF} disabled={reportData.length === 0}>
              <FileText className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={reportData.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Badge variant="secondary" className="ml-auto">
              {reportData.length} records
            </Badge>
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Visualization</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  {activeTab === "attendance" ? (
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={100}
                        dataKey="value"
                      >
                        {chartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  ) : activeTab === "fees" ? (
                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="name" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="Collected" stroke="hsl(142 76% 36%)" strokeWidth={2} />
                      <Line type="monotone" dataKey="Pending" stroke="hsl(0 84% 60%)" strokeWidth={2} />
                    </LineChart>
                  ) : (
                    <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="name" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                      <Bar dataKey="value" fill="hsl(var(--primary))" name={activeTab === "exams" ? "Avg Score" : "Enrolled"} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Data Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Report Data</CardTitle>
            </CardHeader>
            <CardContent>
              {reportData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No data found for the selected filters and date range.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {Object.keys(reportData[0]).map((col) => (
                          <th key={col} className="text-left py-3 px-2 font-medium text-muted-foreground whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((row, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="py-3 px-2 whitespace-nowrap">
                              {val}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
