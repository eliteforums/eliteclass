// ---------------------------------------------------------------------------
// EduOS — Admin: Student Detail Page
//
// Full profile page for a single student, accessible at:
//   /dashboard/admin/students/:studentId
//
// All data is fetched in parallel on mount via `useStudentDetail`.
// The page renders inside the shared DashboardLayout (sidebar + topbar)
// that is provided automatically by the /dashboard parent layout route.
//
// Sections:
//   • Back link
//   • [Profile card]  [Quick actions]   — 2-column grid
//   • Tabs: Overview | Attendance | Fees | Documents | History
//     – Overview : stat cards + linked parents list
//     – History  : StudentTimeline (merged history + promotions)
//     – Others   : "coming soon" placeholders
//
// Modals:
//   • LifecycleActionModal — graduate / suspend / reactivate / transfer
//   • StudentIDCard        — printable ID card
//   • StudentRemarkModal   — add a freeform remark
// ---------------------------------------------------------------------------

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import {
  ArrowLeft,
  Mail,
  Phone,
  BookOpen,
  Calendar,
  AlertTriangle,
  Users,
  FileText,
  Activity,
  CreditCard,
  History,
  Zap,
  IdCard,
  MessageSquarePlus,
  AlertCircle,
  Loader2,
} from "lucide-react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAuthStore } from "@/store/authStore";
import { useStudentDetail } from "@/modules/students/hooks/useStudentDetail";
import { LifecycleActionModal } from "@/modules/students/components/LifecycleActionModal";
import { StudentTimeline } from "@/modules/students/components/StudentTimeline";
import { StudentIDCard } from "@/modules/students/components/StudentIDCard";
import { StudentRemarkModal } from "@/modules/students/components/StudentRemarkModal";
import { getInitials, formatDate } from "@/utils/helpers";
import type { LifecycleAction } from "@/types";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/dashboard/admin/students/$studentId")({
  head: () => ({ meta: [{ title: "Student Detail — EduOS" }] }),
  component: StudentDetailPage,
});

// ── Tab configuration ─────────────────────────────────────────────────────────

type TabId = "overview" | "attendance" | "fees" | "documents" | "history";

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const TABS: TabConfig[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "attendance", label: "Attendance", icon: Calendar },
  { id: "fees", label: "Fees", icon: CreditCard },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "history", label: "History", icon: History },
];

// ── Sub-components ────────────────────────────────────────────────────────────

/** A single stat card shown in the Overview tab. */
function StatCard({
  label,
  value,
  sub,
  color = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: "default" | "green" | "red" | "blue";
}) {
  const valueColors: Record<typeof color, string> = {
    default: "text-foreground",
    green: "text-green-600 dark:text-green-400",
    red: "text-red-600 dark:text-red-400",
    blue: "text-blue-600 dark:text-blue-400",
  };
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueColors[color]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** An info row used in the profile card. */
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground wrap-break-word">{value}</p>
      </div>
    </div>
  );
}

/** Loading skeleton for the profile card + quick actions section. */
function ProfileSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 animate-pulse">
      {/* Profile card */}
      <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-muted shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-5 w-40 rounded bg-muted" />
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-5 w-16 rounded-full bg-muted" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-4 w-32 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
      {/* Quick actions */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="h-4 w-24 rounded bg-muted" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-full rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────

function StudentDetailPage() {
  const { studentId } = Route.useParams();
  const { user, institute } = useAuthStore();
  const instituteId = user?.institute_id ?? null;

  // ── Data ──────────────────────────────────────────────────────────────────

  const {
    student,
    history,
    promotions,
    documents,
    batches,
    isLoadingStudent,
    isLoadingHistory,
    isLoadingPromotions,
    isLoadingDocuments,
    studentError,
    refreshStudent,
    fetchAll,
  } = useStudentDetail({ studentId, instituteId });

  // ── Local UI state ────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const [idCardOpen, setIdCardOpen] = useState(false);
  const [remarkOpen, setRemarkOpen] = useState(false);

  // ── Callbacks ─────────────────────────────────────────────────────────────

  const handleLifecycleSuccess = useCallback(
    (_action: LifecycleAction) => {
      // Reload student profile + history/promotions to reflect the new status.
      fetchAll();
    },
    [fetchAll],
  );

  const handleRemarkSuccess = useCallback(() => {
    // Only the history list needs refreshing after a remark.
    fetchAll();
  }, [fetchAll]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      {/* ── Back link ───────────────────────────────────────────────────── */}
      <Link
        to="/dashboard/admin/students"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground mb-5"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Students
      </Link>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {studentError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{studentError}</span>
        </div>
      )}

      {/* ── Profile + Quick actions ──────────────────────────────────────── */}
      {isLoadingStudent && !student ? (
        <ProfileSkeleton />
      ) : student ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* ── Profile card ──────────────────────────────────────────────── */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
            {/* Avatar + name row */}
            <div className="flex items-start gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground select-none"
                aria-hidden="true"
              >
                {getInitials(student.user?.name ?? "?")}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold text-foreground truncate">
                  {student.user?.name ?? "—"}
                </h1>
                <p className="font-mono text-xs text-muted-foreground mt-0.5">
                  {student.admission_no}
                </p>
                <div className="mt-2">
                  <StatusBadge status={student.status} />
                </div>
              </div>
            </div>

            {/* Info grid */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoRow icon={<Mail />} label="Email" value={student.user?.email ?? "—"} />
              <InfoRow icon={<Phone />} label="Phone" value={student.user?.phone ?? "—"} />
              <InfoRow
                icon={<BookOpen />}
                label="Batch"
                value={student.batch_id ?? "No batch assigned"}
              />
              <InfoRow icon={<Calendar />} label="Joined" value={formatDate(student.created_at)} />
            </div>

            {/* Emergency contact */}
            {student.emergency_contact &&
              (student.emergency_contact.name || student.emergency_contact.phone) && (
                <div className="mt-5 rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Emergency Contact
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {student.emergency_contact.name && (
                      <InfoRow
                        icon={<AlertTriangle />}
                        label="Name"
                        value={student.emergency_contact.name}
                      />
                    )}
                    {student.emergency_contact.phone && (
                      <InfoRow
                        icon={<Phone />}
                        label="Phone"
                        value={student.emergency_contact.phone}
                      />
                    )}
                    {student.emergency_contact.relation && (
                      <InfoRow
                        icon={<Users />}
                        label="Relation"
                        value={student.emergency_contact.relation}
                      />
                    )}
                  </div>
                </div>
              )}
          </div>

          {/* ── Quick actions ──────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Quick Actions
            </p>
            <div className="flex flex-col gap-2">
              {/* Manage Lifecycle */}
              <button
                type="button"
                onClick={() => setLifecycleOpen(true)}
                className="inline-flex w-full items-center gap-2.5 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <Zap className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Manage Lifecycle
              </button>

              {/* View ID Card */}
              <button
                type="button"
                onClick={() => setIdCardOpen(true)}
                className="inline-flex w-full items-center gap-2.5 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <IdCard className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
                View ID Card
              </button>

              {/* Add Remark */}
              <button
                type="button"
                onClick={() => setRemarkOpen(true)}
                className="inline-flex w-full items-center gap-2.5 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <MessageSquarePlus className="h-4 w-4 shrink-0 text-green-500" aria-hidden="true" />
                Add Remark
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="mt-6">
        {/* Tab bar */}
        <div
          role="tablist"
          aria-label="Student detail sections"
          className="flex gap-1 border-b border-border overflow-x-auto"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tab-panel-${tab.id}`}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Tab panels ──────────────────────────────────────────────────── */}

        {/* Overview */}
        <div
          id="tab-panel-overview"
          role="tabpanel"
          aria-labelledby="tab-overview"
          hidden={activeTab !== "overview"}
          className="mt-5"
        >
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Attendance" value="—" sub="Not yet tracked" />
            <StatCard
              label="Documents"
              value={isLoadingDocuments ? "…" : documents.length}
              sub="uploaded files"
              color="blue"
            />
            <StatCard
              label="History Events"
              value={
                isLoadingHistory || isLoadingPromotions ? "…" : history.length + promotions.length
              }
              sub="total events"
            />
            <StatCard label="Fee Status" value="—" sub="Not yet tracked" />
          </div>

          {/* Linked parents */}
          {student && (
            <div className="mt-5 rounded-xl border border-border bg-card p-5">
              <p className="text-sm font-semibold text-foreground mb-3">Linked Parents</p>
              {isLoadingStudent ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading…
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Open the profile sheet to view linked parents.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Attendance (placeholder) */}
        <div
          id="tab-panel-attendance"
          role="tabpanel"
          hidden={activeTab !== "attendance"}
          className="mt-5"
        >
          <ComingSoonPanel label="Attendance tracking" />
        </div>

        {/* Fees (placeholder) */}
        <div id="tab-panel-fees" role="tabpanel" hidden={activeTab !== "fees"} className="mt-5">
          <ComingSoonPanel label="Fee management" />
        </div>

        {/* Documents */}
        <div
          id="tab-panel-documents"
          role="tabpanel"
          hidden={activeTab !== "documents"}
          className="mt-5"
        >
          <DocumentsPanel documents={documents} isLoading={isLoadingDocuments} />
        </div>

        {/* History */}
        <div
          id="tab-panel-history"
          role="tabpanel"
          hidden={activeTab !== "history"}
          className="mt-5"
        >
          <StudentTimeline
            history={history}
            promotions={promotions}
            isLoading={isLoadingHistory || isLoadingPromotions}
          />
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}

      {student && (
        <>
          {/* Lifecycle action */}
          <LifecycleActionModal
            student={student}
            batches={batches}
            isOpen={lifecycleOpen}
            onClose={() => setLifecycleOpen(false)}
            onSuccess={handleLifecycleSuccess}
          />

          {/* ID Card */}
          <StudentIDCard
            student={student}
            instituteName={institute?.name ?? "EduOS Institute"}
            instituteLogo={institute?.logo ?? undefined}
            isOpen={idCardOpen}
            onClose={() => setIdCardOpen(false)}
          />

          {/* Remark */}
          <StudentRemarkModal
            studentId={student.id}
            studentName={student.user?.name ?? student.admission_no}
            isOpen={remarkOpen}
            onClose={() => setRemarkOpen(false)}
            onSuccess={handleRemarkSuccess}
          />
        </>
      )}
    </ProtectedRoute>
  );
}

// ── Helper panels ─────────────────────────────────────────────────────────────

/** Renders a "coming soon" placeholder for unimplemented tabs. */
function ComingSoonPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Activity className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-foreground">{label} coming soon</p>
      <p className="text-xs text-muted-foreground max-w-48">
        This section is under development and will be available in a future release.
      </p>
    </div>
  );
}

/** Lists uploaded student documents or an empty state. */
function DocumentsPanel({
  documents,
  isLoading,
}: {
  documents: Array<{
    id: string;
    file_name: string;
    document_type: string;
    file_url: string;
    file_size: number | null;
    created_at: string;
  }>;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading documents…
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FileText className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-foreground">No documents yet</p>
        <p className="text-xs text-muted-foreground max-w-48">
          Uploaded documents will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
              <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{doc.file_name}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {doc.document_type}
                {doc.file_size != null && (
                  <span className="ml-2">· {(doc.file_size / 1024).toFixed(0)} KB</span>
                )}
              </p>
            </div>
          </div>
          <a
            href={doc.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 hover:bg-primary/10 transition-colors"
          >
            View
          </a>
        </li>
      ))}
    </ul>
  );
}
