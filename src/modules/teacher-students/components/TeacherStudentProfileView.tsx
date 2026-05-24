// ---------------------------------------------------------------------------
// EduOS — TeacherStudentProfileView (staff read-only student detail)
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  FileText,
  Loader2,
  MessageSquarePlus,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { StatusBadge } from "@/components/ui/StatusBadge";
import { StudentRemarkModal } from "@/modules/students/components/StudentRemarkModal";
import {
  getStudentWithParents,
  getStudentHistory,
  getStudentDocuments,
} from "@/services/student.service";
import { getStudentAnalytics } from "@/services/analytics.service";
import { getStudentAttendanceHistory } from "@/services/attendance.service";
import { invalidateTeacherStudentsCache } from "@/services/teacherStudents.service";
import { formatDate, getInitials } from "@/utils/helpers";
import type {
  Student,
  StudentAnalyticsBundle,
  StudentAttendanceRecord,
  StudentDocument,
  StudentHistory,
  StudentParent,
} from "@/types";

type TabId = "overview" | "attendance" | "performance" | "submissions" | "remarks" | "parents";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: Users },
  { id: "attendance", label: "Attendance", icon: Calendar },
  { id: "performance", label: "Performance", icon: TrendingUp },
  { id: "submissions", label: "Submissions", icon: FileText },
  { id: "remarks", label: "Remarks", icon: MessageSquarePlus },
  { id: "parents", label: "Parents", icon: Users },
];

interface TeacherStudentProfileViewProps {
  studentId: string;
  staffId: string;
}

export function TeacherStudentProfileView({ studentId, staffId }: TeacherStudentProfileViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [student, setStudent] = useState<(Student & { parents: StudentParent[] }) | null>(null);
  const [analytics, setAnalytics] = useState<StudentAnalyticsBundle | null>(null);
  const [history, setHistory] = useState<StudentHistory[]>([]);
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<StudentAttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remarkOpen, setRemarkOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const [studentRes, analyticsRes, historyRes, docsRes, attRes] = await Promise.all([
      getStudentWithParents(studentId),
      getStudentAnalytics(studentId),
      getStudentHistory(studentId),
      getStudentDocuments(studentId),
      getStudentAttendanceHistory(studentId, {
        dateFrom: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      }),
    ]);

    if (!studentRes.success || !studentRes.data) {
      setError(studentRes.error ?? "Student not found or access denied.");
      setIsLoading(false);
      return;
    }

    setStudent(studentRes.data);
    if (analyticsRes.success && analyticsRes.data) setAnalytics(analyticsRes.data);
    if (historyRes.success && historyRes.data) setHistory(historyRes.data);
    if (docsRes.success && docsRes.data) setDocuments(docsRes.data);
    if (attRes.success && attRes.data) setAttendanceRecords(attRes.data);
    setIsLoading(false);
  }, [studentId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const onRemarkSaved = () => {
    toast.success("Remark saved");
    invalidateTeacherStudentsCache(staffId);
    void loadProfile();
  };

  if (isLoading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        {error ?? "Unable to load student."}
        <Link
          to="/dashboard/staff/students"
          className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
        >
          Back to students
        </Link>
      </div>
    );
  }

  const name = student.user?.name ?? "Student";
  const remarks = history.filter((h) => h.remark || h.action === "remark_added");
  const chartData =
    analytics?.attendance.weekly_trend?.map((p) => ({
      label: p.label ?? p.period,
      present: Number(p.present ?? 0),
      absent: Number(p.absent ?? 0),
    })) ?? [];

  return (
    <div className="space-y-6">
      <Link
        to="/dashboard/staff/students"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to students
      </Link>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              {getInitials(name)}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{name}</h1>
              <p className="text-sm text-muted-foreground font-mono">{student.admission_no}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge status={student.status} size="sm" />
                {analytics && (
                  <span className="text-xs text-muted-foreground">
                    Attendance: {analytics.attendance.rate}%
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/dashboard/admin/attendance"
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Mark attendance
            </Link>
            <button
              type="button"
              onClick={() => setRemarkOpen(true)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Add remark
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Contact</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="text-foreground">{student.user?.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="text-foreground">{student.user?.phone ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Emergency</dt>
                <dd className="text-foreground text-right">
                  {student.emergency_contact?.name
                    ? `${student.emergency_contact.name} (${student.emergency_contact.phone ?? "—"})`
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Recent activity</h3>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {history.slice(0, 8).map((entry) => (
                  <li key={entry.id} className="text-xs border-b border-border/50 pb-2">
                    <span className="font-medium text-foreground">{entry.action}</span>
                    <span className="text-muted-foreground"> · {formatDate(entry.created_at)}</span>
                    {entry.remark && (
                      <p className="mt-0.5 text-muted-foreground line-clamp-2">{entry.remark}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {analytics?.fees && (
            <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-foreground mb-2">Fees (read-only)</h3>
              <p className="text-sm text-muted-foreground">
                Due: ₹{analytics.fees.total_due} · Paid: ₹{analytics.fees.total_paid} · Pending
                items: {analytics.fees.pending_count}
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "attendance" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Rate (90 days)</p>
              <p className="text-2xl font-semibold">{analytics?.attendance.rate ?? 0}%</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Sessions</p>
              <p className="text-2xl font-semibold">{analytics?.attendance.total ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Present / late</p>
              <p className="text-2xl font-semibold">{analytics?.attendance.present_or_late ?? 0}</p>
            </div>
          </div>
          {chartData.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="present" fill="hsl(var(--primary))" name="Present" />
                  <Bar dataKey="absent" fill="hsl(var(--muted-foreground))" name="Absent" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(attendanceRecords ?? []).map((rec) => (
                  <tr key={rec.id} className="border-t border-border">
                    <td className="px-4 py-2">{formatDate(rec.session?.session_date ?? rec.created_at)}</td>
                    <td className="px-4 py-2 capitalize">{rec.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(attendanceRecords ?? []).length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No attendance records yet.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "performance" && (
        <div className="space-y-4">
          {analytics?.insights?.map((insight, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-foreground"
            >
              {insight}
            </div>
          ))}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Courses</h3>
            {analytics?.courses?.length ? (
              <ul className="space-y-2">
                {analytics.courses.map((c, i) => (
                  <li key={i} className="flex justify-between text-sm">
                    <span>{c.course_name}</span>
                    <span className="text-muted-foreground capitalize">{c.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No course enrollments.</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Exam and assignment grades will appear here when those modules are enabled.
          </p>
        </div>
      )}

      {activeTab === "submissions" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Documents & submissions</h3>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No submissions on file.</p>
          ) : (
            <ul className="divide-y divide-border">
              {documents.map((doc) => (
                <li key={doc.id} className="flex justify-between py-3 text-sm">
                  <span>
                    {doc.file_name}{" "}
                    <span className="text-muted-foreground">({doc.document_type})</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(doc.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === "remarks" && (
        <div className="space-y-4">
          <ul className="space-y-3">
            {remarks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No remarks yet.</p>
            ) : (
              remarks.map((r) => (
                <li key={r.id} className="rounded-xl border border-border bg-card p-4 text-sm">
                  <p className="text-foreground">{r.remark}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(r.created_at)}
                    {r.changed_by_user?.name ? ` · ${r.changed_by_user.name}` : ""}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {activeTab === "parents" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {student.parents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No linked parents.</p>
          ) : (
            student.parents.map((sp) => (
              <div key={sp.id} className="rounded-xl border border-border bg-card p-5">
                <p className="font-semibold text-foreground">{sp.parent?.user?.name ?? "Parent"}</p>
                <p className="text-xs text-muted-foreground capitalize">{sp.relation_type}</p>
                <p className="mt-2 text-sm">{sp.parent?.user?.email ?? "—"}</p>
                <p className="text-sm text-muted-foreground">{sp.parent?.user?.phone ?? "—"}</p>
              </div>
            ))
          )}
        </div>
      )}

      <StudentRemarkModal
        studentId={studentId}
        studentName={name}
        isOpen={remarkOpen}
        onClose={() => setRemarkOpen(false)}
        onSuccess={onRemarkSaved}
      />
    </div>
  );
}
